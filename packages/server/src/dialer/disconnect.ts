import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { campaigns, contacts, recordings, callLogs } from '../db/schema.js';
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
import { config } from '../config.js';
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
 * Order of preference:
 *   1. **Transfer** the live call to another available operator if one is free.
 *      The contact stays on the line, the new operator gets the same routed-call
 *      UI they'd see for a normal pickup. Best UX.
 *   2. **Play failover recording** (if the campaign has one set), then hang up.
 *      Graceful "we'll call you right back" instead of dead air.
 *   3. **Hang up immediately** if no failover recording is configured.
 *
 * Either way, the disconnected operator's WebRTC + bridge state is cleared
 * so they don't get routed more calls until they re-register a fresh WebRTC leg.
 *
 * Triggered from two places:
 *   1. Telnyx webhook `call.hangup` for the operator's WebRTC leg
 *   2. `/api/dialer/leave` when the operator clicks Leave Session while bridged
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
    // Transfer failed (bridge error etc.) — fall through to failover playback.
    console.error('[disconnect] Transfer failed, falling back to failover playback');
  }

  // --- Step 2 / 3: no operator available (or transfer failed) — failover or hangup ---
  setOperatorAvailability(userId, 'offline');
  broadcast({
    type: 'operator_status_changed',
    data: { operatorId: userId, availability: 'offline', reason: 'disconnected' },
  });

  const session = getTeamSession();
  const campaign = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.id, session.campaignId))
    .get();

  const provider = await getProvider();

  // Notify the (now-disconnected) operator's other devices, if any
  broadcastToUser(userId, {
    type: 'call_status_changed',
    data: {
      callControlId: contactCallControlId,
      callState: 'ended',
      message: 'Disconnected from call — failover playing.',
    },
  });

  if (campaign?.failoverRecordingId) {
    const recording = await db
      .select()
      .from(recordings)
      .where(eq(recordings.id, campaign.failoverRecordingId))
      .get();

    if (recording) {
      // Mark the call so the playback.ended handler knows to hang up after.
      const clientState = JSON.stringify({
        campaignId: session.campaignId,
        contactId: inFlight.contactId,
        playbackType: 'failover',
      });
      const audioUrl = `${config.WEBHOOK_BASE_URL}${recording.filePath}`;

      try {
        // Stop any in-progress playback first (e.g. opener still going)
        await provider.stopPlayback(contactCallControlId).catch(() => {});
        await provider.playAudio(contactCallControlId, audioUrl, clientState);

        // Note the disconnect on the call log
        await db
          .update(callLogs)
          .set({ notes: 'Operator disconnected — failover message played' })
          .where(eq(callLogs.telnyxCallControlId, contactCallControlId));

        // Don't hang up here — the playback.ended handler will do it once the
        // failover recording finishes.
        return;
      } catch (err: any) {
        console.error('[disconnect] Failed to play failover, hanging up:', err.message);
      }
    }
  }

  // No failover recording, OR the playback failed — hang up immediately.
  try {
    await provider.hangup(contactCallControlId);
  } catch {
    // Already gone
  }
  await db
    .update(callLogs)
    .set({ notes: 'Operator disconnected — call ended (no failover recording)' })
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

  // Note the transfer on the call log
  await db
    .update(callLogs)
    .set({
      operatorId: target.userId,
      notes: 'Call transferred to new operator after previous operator disconnected',
    })
    .where(eq(callLogs.telnyxCallControlId, contactCallControlId));

  return true;
}
