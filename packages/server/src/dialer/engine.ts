import { db } from '../db/index.js';
import { contacts, campaigns, callLogs, recordings, recordingProfiles, settings } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { fireWebhook, buildCallWebhookData } from '../integrations/webhooks.js';
import { logCallToHubspot } from '../integrations/hubspot.js';
import {
  getTeamSession,
  updateTeamSession,
  resetTeamSession,
  addInFlightCall,
  getInFlightCall,
  updateInFlightCall,
  removeInFlightCall,
  findAvailableOperator,
  countAvailableOperators,
  setOperatorAvailability,
  getOperator,
  popWaitingCall,
  addToWaitingQueue,
} from './team-state.js';
import { getProvider } from '../providers/index.js';
import { broadcast, broadcastToUser } from '../ws/index.js';
import { config } from '../config.js';

async function getSetting(key: string): Promise<string | undefined> {
  const row = await db.select().from(settings).where(eq(settings.key, key)).get();
  return row?.value;
}

export const dialerEngine = {
  async startSession(campaignId: number) {
    const session = getTeamSession();
    if (session.status === 'running') {
      throw new Error('A session is already running. Stop it first.');
    }

    const campaign = await db.select().from(campaigns).where(eq(campaigns.id, campaignId)).get();
    if (!campaign) throw new Error('Campaign not found');

    const pendingContacts = await db
      .select()
      .from(contacts)
      .where(and(eq(contacts.campaignId, campaignId), eq(contacts.status, 'pending')));

    if (pendingContacts.length === 0) {
      throw new Error('No pending contacts in this campaign');
    }

    const queue = pendingContacts.map((c) => c.id);

    updateTeamSession({
      campaignId,
      status: 'running',
      queue,
      maxParallelLines: Math.max(session.operators.size * 3, 1),
      callsMade: 0,
      voicemailsDropped: 0,
      connects: 0,
      sessionStartedAt: new Date().toISOString(),
    });

    await db.update(campaigns).set({ status: 'active' }).where(eq(campaigns.id, campaignId));

    broadcast({
      type: 'session_status_changed',
      data: { status: 'running', campaignId, queueLength: queue.length },
    });

    await this.dialNextBatch();
  },

  async dialNextBatch(): Promise<void> {
    const session = getTeamSession();
    if (session.status !== 'running') return;
    if (session.queue.length === 0 && session.inFlightCalls.size === 0) {
      // Campaign complete
      updateTeamSession({ status: 'stopped' });
      await db
        .update(campaigns)
        .set({ status: 'completed' })
        .where(eq(campaigns.id, session.campaignId));
      broadcast({
        type: 'session_status_changed',
        data: { status: 'completed', campaignId: session.campaignId },
      });
      fireWebhook('session.completed', {
        campaign: { id: session.campaignId },
        total_calls: session.callsMade,
        voicemails_dropped: session.voicemailsDropped,
        connects: session.connects,
        started_at: session.sessionStartedAt,
        ended_at: new Date().toISOString(),
      }).catch((err) =>
        console.error('[engine] fireWebhook(session.completed) failed:', err?.message ?? err),
      );
      return;
    }

    const available = countAvailableOperators();
    const targetInFlight = Math.min(
      Math.max(available * 3, 1), // 3:1 ratio, minimum 1
      session.maxParallelLines,
      session.queue.length + session.inFlightCalls.size, // don't exceed total
    );
    const toDial = Math.max(0, targetInFlight - session.inFlightCalls.size);

    for (let i = 0; i < toDial; i++) {
      if (session.queue.length === 0) break;
      const contactId = session.queue.shift()!;
      await this.dialOne(contactId).catch(() => {
        // On error, put contact back or skip
      });
    }
  },

  async dialOne(contactId: number): Promise<void> {
    const session = getTeamSession();
    const contact = await db.select().from(contacts).where(eq(contacts.id, contactId)).get();
    if (!contact) return;

    updateTeamSession({ callsMade: session.callsMade + 1 });

    broadcast({
      type: 'call_status_changed',
      data: {
        callState: 'dialing',
        contactId: contact.id,
        contactName: contact.name,
        phone: contact.phone,
        company: contact.company,
        queueRemaining: session.queue.length,
      },
    });

    const provider = await getProvider();
    const campaign = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, session.campaignId))
      .get();

    const connectionId =
      (await getSetting('TELNYX_CONNECTION_ID')) || config.TELNYX_CONNECTION_ID || '';
    const webhookUrl = `${(await getSetting('WEBHOOK_BASE_URL')) || config.WEBHOOK_BASE_URL}/webhooks/telnyx`;

    const clientState = JSON.stringify({
      campaignId: session.campaignId,
      contactId,
    });

    // Disable AMD for contacts with IVR sequences (navigating phone trees)
    const hasIvr = !!(contact.ivrSequence || campaign?.ivrSequence);

    // Phase 1: dial the contact via the provider. If THIS fails, no Telnyx
    // call exists yet, so there's nothing to clean up — just log and return.
    let result;
    try {
      result = await provider.dial({
        to: contact.phone,
        from: campaign?.callerId || '',
        connectionId,
        webhookUrl,
        enableAmd: !hasIvr,
        clientState,
      });
    } catch (err: any) {
      broadcast({
        type: 'error',
        data: { message: `Failed to dial: ${err.message}`, contactId },
      });
      return;
    }

    // Phase 2: track in-flight + insert call log + update contact. If any of
    // THIS fails, the Telnyx call is already live — we have to hang it up to
    // avoid an orphaned ringing line that nobody can see.
    try {
      addInFlightCall(result.callControlId, contactId);
      await db.insert(callLogs).values({
        campaignId: session.campaignId,
        contactId,
        telnyxCallControlId: result.callControlId,
        startedAt: new Date().toISOString(),
      });
      await db
        .update(contacts)
        .set({
          callCount: contact.callCount + 1,
          lastCalledAt: new Date().toISOString(),
        })
        .where(eq(contacts.id, contactId));
    } catch (err: any) {
      console.error(
        `[engine] dialOne post-dial setup failed, hanging up orphaned call ${result.callControlId}:`,
        err?.message ?? err,
      );
      removeInFlightCall(result.callControlId);
      // Best-effort hangup — if this also fails the Telnyx call will time out
      // on its own eventually, but we tried.
      try {
        await provider.hangup(result.callControlId);
      } catch {
        /* already gone */
      }
      broadcast({
        type: 'error',
        data: { message: `Dial setup failed: ${err.message}`, contactId },
      });
    }
  },

  // Route a human-answered call to an available operator
  async routeToOperator(callControlId: string): Promise<boolean> {
    const call = getInFlightCall(callControlId);
    if (!call) return false;

    const operator = findAvailableOperator();
    if (!operator) {
      // Check campaign setting
      const session = getTeamSession();
      const campaign = await db
        .select()
        .from(campaigns)
        .where(eq(campaigns.id, session.campaignId))
        .get();

      if (campaign?.dropIfNoOperator) {
        // Drop the call — don't waste the contact's time
        try {
          const provider = await getProvider();
          await provider.hangup(callControlId);
        } catch {
          // Call may have already ended
        }
        // Re-queue the contact for later
        updateInFlightCall(callControlId, { callState: 'ended' });
        await db
          .update(contacts)
          .set({ status: 'pending' })
          .where(eq(contacts.id, call.contactId));
        broadcast({
          type: 'call_status_changed',
          data: { callState: 'ended', contactId: call.contactId, message: 'No operator — will retry later.' },
        });
        return false;
      }

      // Queue mode — hold the call until an operator is free
      updateInFlightCall(callControlId, { callState: 'waiting_for_operator' });
      addToWaitingQueue(callControlId);
      broadcast({
        type: 'call_waiting',
        data: { callControlId, contactId: call.contactId },
      });
      return false;
    }

    // Assign operator
    updateInFlightCall(callControlId, {
      callState: 'operator_bridged',
      assignedOperatorId: operator.userId,
      bridgedAt: new Date().toISOString(),
    });

    setOperatorAvailability(operator.userId, 'on_call');
    const op = getOperator(operator.userId)!;
    op.bridgedToCallId = callControlId;
    op.bridgedContactId = call.contactId;

    // Auto-bridge
    if (operator.webrtcCallControlId) {
      try {
        const provider = await getProvider();
        await provider.bridge(callControlId, operator.webrtcCallControlId);
      } catch (err: any) {
        broadcast({
          type: 'error',
          data: { message: `Bridge failed: ${err.message}`, contactId: call.contactId },
        });
        // Revert operator state
        setOperatorAvailability(operator.userId, 'available');
        updateInFlightCall(callControlId, { callState: 'human_answered', assignedOperatorId: null });
        return false;
      }
    }

    // Notify the specific operator with contact details
    const contact = await db.select().from(contacts).where(eq(contacts.id, call.contactId)).get();
    broadcastToUser(operator.userId, {
      type: 'call_routed_to_you',
      data: {
        callControlId,
        contactId: call.contactId,
        operatorId: operator.userId,
        contactName: contact?.name ?? null,
        contactPhone: contact?.phone ?? '',
        contactCompany: contact?.company ?? null,
        contactNotes: contact?.notes ?? null,
      },
    });

    // Notify everyone about operator status change
    broadcast({
      type: 'operator_status_changed',
      data: {
        operatorId: operator.userId,
        name: operator.name,
        availability: 'on_call',
        contactId: call.contactId,
      },
    });

    // Update call log with operator
    await db
      .update(callLogs)
      .set({ operatorId: operator.userId, humanTookOver: true })
      .where(eq(callLogs.telnyxCallControlId, callControlId));

    // Auto-record and transcribe bridged calls
    try {
      const session = getTeamSession();
      const provider = await getProvider();

      // Always record bridged calls
      await provider.startRecording(callControlId);

      // Start transcription if enabled
      const campaign = await db
        .select()
        .from(campaigns)
        .where(eq(campaigns.id, session.campaignId))
        .get();

      // Real-time transcription branches: only run when the campaign explicitly
      // asks for live streaming. The 'post_call' mode is handled later by the
      // call.recording.saved webhook (no work needed here).
      const wantsRealtime =
        campaign?.transcriptionMode === 'realtime' ||
        // Backwards compat: campaigns created before transcriptionMode existed
        (campaign?.enableTranscription && !campaign?.transcriptionMode);

      if (wantsRealtime) {
        if (campaign?.sttProvider && campaign?.sttApiKey) {
          // BYO STT — stream audio to external provider via WebSocket relay
          const streamUrl = `wss://${config.WEBHOOK_BASE_URL.replace(/^https?:\/\//, '')}/audio-stream`;
          await provider.startStreaming(callControlId, streamUrl);
        } else {
          // Telnyx built-in transcription
          await provider.startTranscription(callControlId, {
            engine: (campaign?.transcriptionEngine as any) || 'telnyx',
            tracks: 'both',
          });
        }
      }
    } catch {
      // Don't fail the bridge if recording/transcription fails
    }

    return true;
  },

  // When an operator becomes available, check waiting queue
  async tryRouteWaitingCall(): Promise<void> {
    const waitingCallId = popWaitingCall();
    if (!waitingCallId) {
      // No waiting calls — dial more
      await this.dialNextBatch();
      return;
    }
    await this.routeToOperator(waitingCallId);
  },

  pauseSession() {
    const session = getTeamSession();
    if (session.status !== 'running') throw new Error('No running session to pause');
    updateTeamSession({ status: 'paused' });
    broadcast({ type: 'session_status_changed', data: { status: 'paused' } });
  },

  async resumeSession() {
    const session = getTeamSession();
    if (session.status !== 'paused') throw new Error('No paused session to resume');
    updateTeamSession({ status: 'running' });
    broadcast({ type: 'session_status_changed', data: { status: 'running' } });
    await this.dialNextBatch();
  },

  async stopSession() {
    const session = getTeamSession();
    if (session.status === 'idle') throw new Error('No session to stop');

    // Hangup all in-flight calls
    const provider = await getProvider();
    for (const [callControlId] of session.inFlightCalls) {
      try {
        await provider.hangup(callControlId);
      } catch {
        // Ignore hangup errors
      }
    }

    // Fire session.completed webhook
    fireWebhook('session.completed', {
      campaign: { id: session.campaignId },
      total_calls: session.callsMade,
      voicemails_dropped: session.voicemailsDropped,
      connects: session.connects,
      started_at: session.sessionStartedAt,
      ended_at: new Date().toISOString(),
    }).catch((err) =>
      console.error('[engine] fireWebhook(session.completed) failed:', err?.message ?? err),
    );

    resetTeamSession();
    broadcast({ type: 'session_status_changed', data: { status: 'stopped' } });
  },

  async skipCall(callControlId: string) {
    const call = getInFlightCall(callControlId);
    if (!call) throw new Error('No active call to skip');

    try {
      const provider = await getProvider();
      await provider.hangup(callControlId);
    } catch {
      // Ignore hangup errors
    }

    // Free the operator if one was assigned
    if (call.assignedOperatorId) {
      setOperatorAvailability(call.assignedOperatorId, 'available');
      broadcast({
        type: 'operator_status_changed',
        data: { operatorId: call.assignedOperatorId, availability: 'available' },
      });
    }

    removeInFlightCall(callControlId);

    if (call.contactId) {
      await db
        .update(contacts)
        .set({ status: 'no_answer' })
        .where(eq(contacts.id, call.contactId));
    }

    await this.dialNextBatch();
  },

  // Legacy jump-in for single-operator mode
  async jumpIn(userId?: number) {
    const session = getTeamSession();
    // Find the first human-answered call
    let targetCall: { callControlId: string; contactId: number } | null = null;
    for (const [id, call] of session.inFlightCalls) {
      if (call.callState === 'human_answered' || call.callState === 'opener_playing') {
        targetCall = { callControlId: id, contactId: call.contactId };
        break;
      }
    }
    if (!targetCall) throw new Error('No call waiting for jump in');

    if (userId) {
      // Route to specific operator
      const op = getOperator(userId);
      if (!op || !op.webrtcCallControlId) {
        throw new Error('Operator not connected');
      }

      updateInFlightCall(targetCall.callControlId, {
        callState: 'operator_bridged',
        assignedOperatorId: userId,
        bridgedAt: new Date().toISOString(),
      });
      setOperatorAvailability(userId, 'on_call');
      op.bridgedToCallId = targetCall.callControlId;
      op.bridgedContactId = targetCall.contactId;

      const provider = await getProvider();
      await provider.bridge(targetCall.callControlId, op.webrtcCallControlId);

      broadcast({
        type: 'call_status_changed',
        data: {
          callState: 'operator_bridged',
          contactId: targetCall.contactId,
          operatorId: userId,
        },
      });
    } else {
      // Legacy: bridge using first operator
      await this.routeToOperator(targetCall.callControlId);
    }
  },

  getStatus() {
    const session = getTeamSession();
    const operators = Array.from(session.operators.values()).map((op) => ({
      userId: op.userId,
      name: op.name,
      availability: op.availability,
      bridgedContactId: op.bridgedContactId,
    }));

    const inFlightCalls = Array.from(session.inFlightCalls.values()).map((call) => ({
      callControlId: call.callControlId,
      contactId: call.contactId,
      callState: call.callState,
      assignedOperatorId: call.assignedOperatorId,
    }));

    return {
      status: session.status,
      campaignId: session.campaignId,
      queueRemaining: session.queue.length,
      callsMade: session.callsMade,
      voicemailsDropped: session.voicemailsDropped,
      connects: session.connects,
      sessionStartedAt: session.sessionStartedAt,
      operators,
      inFlightCalls,
      waitingCalls: session.waitingCalls.length,
    };
  },

  // Called by webhook handler when a call ends
  async handleCallEnd(callControlId: string, disposition: string) {
    const call = getInFlightCall(callControlId);
    if (!call) return;

    const session = getTeamSession();

    // Free the operator
    if (call.assignedOperatorId) {
      setOperatorAvailability(call.assignedOperatorId, 'wrap_up');
      broadcast({
        type: 'operator_status_changed',
        data: { operatorId: call.assignedOperatorId, availability: 'wrap_up' },
      });

      // Calculate talk time
      if (call.bridgedAt) {
        const talkTimeSeconds = Math.round(
          (Date.now() - new Date(call.bridgedAt).getTime()) / 1000,
        );
        await db
          .update(callLogs)
          .set({ talkTimeSeconds })
          .where(eq(callLogs.telnyxCallControlId, callControlId));
      }
    }

    removeInFlightCall(callControlId);

    // Update call log
    await db
      .update(callLogs)
      .set({
        endedAt: new Date().toISOString(),
        disposition: disposition as any,
      })
      .where(eq(callLogs.telnyxCallControlId, callControlId));

    // Update contact status. The contact-level status enum is narrower than
    // the call-log disposition (no ringing_abandoned / amd_abandoned), so
    // map abandoned dispositions back to 'no_answer' for the contact view.
    // The richer disposition is still preserved on the call log itself.
    if (call.contactId) {
      const contactStatus =
        disposition === 'ringing_abandoned' || disposition === 'amd_abandoned'
          ? 'no_answer'
          : disposition;
      await db
        .update(contacts)
        .set({ status: contactStatus as any })
        .where(eq(contacts.id, call.contactId));

      broadcast({
        type: 'contact_updated',
        data: { contactId: call.contactId, status: contactStatus },
      });
    }

    // Update stats
    if (disposition === 'voicemail')
      updateTeamSession({ voicemailsDropped: session.voicemailsDropped + 1 });
    if (disposition === 'connected') updateTeamSession({ connects: session.connects + 1 });

    broadcast({
      type: 'call_log_added',
      data: { callControlId, disposition, contactId: call.contactId },
    });

    // Fire CRM webhook
    const callLog = await db
      .select()
      .from(callLogs)
      .where(eq(callLogs.telnyxCallControlId, callControlId))
      .get();
    if (callLog) {
      const webhookData = await buildCallWebhookData(callLog.id);
      if (webhookData) {
        const event = disposition === 'voicemail' ? 'voicemail.dropped' : 'call.completed';
        // Fire-and-forget — never let CRM webhook errors break the dial loop.
        fireWebhook(event, webhookData).catch((err) =>
          console.error('[engine] fireWebhook failed:', err?.message ?? err),
        );
      }
      // Sync to HubSpot if configured
      logCallToHubspot(callLog.id).catch(() => {});
    }

    // Auto-advance if running
    if (session.status === 'running') {
      setTimeout(() => {
        this.dialNextBatch().catch((err) =>
          console.error('[engine] dialNextBatch failed:', err?.message ?? err),
        );
      }, 500);
    }
  },

  // Operator sets themselves back to available after wrap-up
  async operatorReady(userId: number) {
    setOperatorAvailability(userId, 'available');
    broadcast({
      type: 'operator_status_changed',
      data: { operatorId: userId, availability: 'available' },
    });

    const session = getTeamSession();
    if (session.status === 'running') {
      await this.tryRouteWaitingCall();
    }
  },
};
