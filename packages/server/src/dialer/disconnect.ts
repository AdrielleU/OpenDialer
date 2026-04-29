import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { contacts, callLogs } from '../db/schema.js';
import {
  getTeamSession,
  getInFlightCall,
  updateInFlightCall,
  setOperatorAvailability,
  setOperatorWebrtc,
  findAvailableOperator,
  getOperator,
} from './team-state.js';
import type { OperatorState } from './team-state.js';
import { getProvider } from '../providers/index.js';
import { broadcast, broadcastToUser } from '../ws/index.js';
import { dialerEngine } from './engine.js';

/**
 * Find the operator (if any) whose WebRTC leg matches the given callControlId.
 * Used by the webhook handler to recognize when Telnyx tells us the operator's
 * leg dropped (browser crash, network glitch, sleep, intentional close).
 */
export function findOperatorByWebrtcLeg(callControlId: string): OperatorState | null {
  const session = getTeamSession();
  for (const op of session.operators.values()) {
    if (op.webrtcCallControlId === callControlId) return op;
  }
  return null;
}

/**
 * Handle operator disconnect mid-call.
 *
 * 1. Transfer the live call to another available operator if one is free.
 * 2. Otherwise hang up cleanly.
 *
 * Either way, the disconnected operator's WebRTC + bridge state is cleared
 * so they don't get routed more calls until they re-register.
 *
 * Triggered by Telnyx `call.hangup` for the operator's WebRTC leg, or by
 * `/api/dialer/leave` when the operator clicks Leave while bridged.
 */
export async function handleOperatorDisconnect(operator: OperatorState): Promise<void> {
  const contactCallControlId = operator.bridgedToCallId;
  const userId = operator.userId;

  // Clear disconnected operator's WebRTC + bridge state. Note: their availability
  // was 'on_call', so findAvailableOperator() naturally won't pick them. We set
  // them to 'offline' below; first we try the transfer while they're still
  // safely excluded from the available pool.
  setOperatorWebrtc(userId, null);
  operator.bridgedToCallId = null;
  operator.bridgedContactId = null;

  if (!contactCallControlId) {
    // Operator wasn't on a call — just mark them offline.
    setOperatorAvailability(userId, 'offline');
    broadcast({
      type: 'operator_status_changed',
      data: { operatorId: userId, availability: 'offline', reason: 'disconnected' },
    });
    return;
  }

  const inFlight = getInFlightCall(contactCallControlId);
  if (!inFlight) {
    // The contact's leg already cleaned up (race) — nothing to do.
    setOperatorAvailability(userId, 'offline');
    broadcast({
      type: 'operator_status_changed',
      data: { operatorId: userId, availability: 'offline', reason: 'disconnected' },
    });
    return;
  }

  // --- Step 1: try to transfer the call to another available operator ---
  const transferTarget = findAvailableOperator();
  if (transferTarget && transferTarget.userId !== userId) {
    const transferred = await transferCall(contactCallControlId, inFlight.contactId, transferTarget);
    if (transferred) {
      // Transfer succeeded. Mark the disconnected operator offline and we're done.
      setOperatorAvailability(userId, 'offline');
      broadcast({
        type: 'operator_status_changed',
        data: { operatorId: userId, availability: 'offline', reason: 'disconnected' },
      });
      // Notify the disconnected operator's other devices that the call moved on
      broadcastToUser(userId, {
        type: 'call_status_changed',
        data: {
          callControlId: contactCallControlId,
          callState: 'ended',
          message: `Disconnected — call transferred to ${transferTarget.name}.`,
        },
      });
      return;
    }
    console.error('[disconnect] Transfer failed, hanging up');
  }

  // No transfer target (or transfer failed) — hang up the contact leg cleanly.
  setOperatorAvailability(userId, 'offline');
  broadcast({
    type: 'operator_status_changed',
    data: { operatorId: userId, availability: 'offline', reason: 'disconnected' },
  });

  broadcastToUser(userId, {
    type: 'call_status_changed',
    data: {
      callControlId: contactCallControlId,
      callState: 'ended',
      message: 'Disconnected from call.',
    },
  });

  const provider = await getProvider();
  try {
    await provider.hangup(contactCallControlId);
  } catch {
    // Already gone
  }
  await db
    .update(callLogs)
    .set({ notes: 'Operator disconnected — call ended' })
    .where(eq(callLogs.telnyxCallControlId, contactCallControlId));

  // The Telnyx hangup we just sent will fire its own call.hangup webhook
  // which will run handleCallEnd. But if the contact is unreachable, fall
  // back to running it ourselves so the in-flight map doesn't leak.
  setTimeout(() => {
    if (getInFlightCall(contactCallControlId)) {
      dialerEngine
        .handleCallEnd(contactCallControlId, 'connected')
        .catch((err) =>
          console.error('[disconnect] handleCallEnd fallback failed:', err?.message ?? err),
        );
    }
  }, 5000);
}

/**
 * Bridge a live contact call leg to a new available operator. Used when an
 * operator disconnects mid-call and we want to transfer rather than hang up.
 *
 * Returns true on success. On failure (bridge error, missing webrtc leg) the
 * caller should fall back to failover playback.
 */
async function transferCall(
  contactCallControlId: string,
  contactId: number,
  target: OperatorState,
): Promise<boolean> {
  if (!target.webrtcCallControlId) return false;

  // Look up the call log BEFORE the bridge so we can capture the original
  // operator id (the one who was on the call before this disconnect). We use
  // it to populate originalOperatorId on the audit columns added in 0003.
  const existingLog = await db
    .select()
    .from(callLogs)
    .where(eq(callLogs.telnyxCallControlId, contactCallControlId))
    .get();
  const originalOperatorId = existingLog?.originalOperatorId ?? existingLog?.operatorId ?? null;

  try {
    const provider = await getProvider();
    await provider.bridge(contactCallControlId, target.webrtcCallControlId);
  } catch (err: any) {
    console.error('[disconnect] bridge to new operator failed:', err?.message ?? err);
    return false;
  }

  // Update in-flight call assignment
  updateInFlightCall(contactCallControlId, {
    callState: 'operator_bridged',
    assignedOperatorId: target.userId,
    bridgedAt: new Date().toISOString(),
  });

  // Mark new operator as on_call and remember which call they're on
  setOperatorAvailability(target.userId, 'on_call');
  const op = getOperator(target.userId);
  if (op) {
    op.bridgedToCallId = contactCallControlId;
    op.bridgedContactId = contactId;
  }

  // Tell the new operator they have an incoming routed call (same UI path
  // as a fresh routing — IncomingCallCard + Soundboard render automatically).
  const contact = await db.select().from(contacts).where(eq(contacts.id, contactId)).get();
  broadcastToUser(target.userId, {
    type: 'call_routed_to_you',
    data: {
      callControlId: contactCallControlId,
      contactId,
      operatorId: target.userId,
      contactName: contact?.name ?? null,
      contactPhone: contact?.phone ?? '',
      contactCompany: contact?.company ?? null,
      contactNotes: contact?.notes ?? null,
      transferred: true,
    },
  });

  // Notify everyone about the new operator's status
  broadcast({
    type: 'operator_status_changed',
    data: {
      operatorId: target.userId,
      name: target.name,
      availability: 'on_call',
      contactId,
    },
  });

  // Update call log: current operator is now `target`, but record the
  // original (first-bridged) operator and the transfer timestamp so the
  // audit trail survives multiple transfers.
  await db
    .update(callLogs)
    .set({
      operatorId: target.userId,
      originalOperatorId,
      transferredAt: new Date().toISOString(),
      notes: 'Call transferred to new operator after previous operator disconnected',
    })
    .where(eq(callLogs.telnyxCallControlId, contactCallControlId));

  return true;
}
