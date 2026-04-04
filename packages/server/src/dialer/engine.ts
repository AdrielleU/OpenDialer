import { db } from '../db/index.js';
import { contacts, campaigns, callLogs, recordings, settings } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { getSession, updateSession, resetSession } from './state.js';
import { getProvider } from '../providers/index.js';
import { broadcast } from '../ws/index.js';
import { config } from '../config.js';

async function getSetting(key: string): Promise<string | undefined> {
  const row = await db.select().from(settings).where(eq(settings.key, key)).get();
  return row?.value;
}

export const dialerEngine = {
  async startSession(campaignId: number) {
    const session = getSession();
    if (session.status === 'running') {
      throw new Error('A session is already running. Stop it first.');
    }

    const campaign = await db.select().from(campaigns).where(eq(campaigns.id, campaignId)).get();
    if (!campaign) throw new Error('Campaign not found');

    // Load pending contacts
    const pendingContacts = await db
      .select()
      .from(contacts)
      .where(and(eq(contacts.campaignId, campaignId), eq(contacts.status, 'pending')));

    if (pendingContacts.length === 0) {
      throw new Error('No pending contacts in this campaign');
    }

    const queue = pendingContacts.map((c) => c.id);

    updateSession({
      campaignId,
      status: 'running',
      queue,
      currentContactId: null,
      currentCallControlId: null,
      currentCallState: 'idle',
      callsMade: 0,
      voicemailsDropped: 0,
      connects: 0,
      sessionStartedAt: new Date().toISOString(),
    });

    // Update campaign status
    await db.update(campaigns).set({ status: 'active' }).where(eq(campaigns.id, campaignId));

    broadcast({
      type: 'session_status_changed',
      data: { status: 'running', campaignId, queueLength: queue.length },
    });

    // Start dialing
    await this.dialNext();
  },

  async dialNext() {
    const session = getSession();
    if (session.status !== 'running') return;
    if (session.queue.length === 0) {
      // Campaign complete
      updateSession({ status: 'stopped', currentCallState: 'idle' });
      await db
        .update(campaigns)
        .set({ status: 'completed' })
        .where(eq(campaigns.id, session.campaignId));
      broadcast({
        type: 'session_status_changed',
        data: { status: 'completed', campaignId: session.campaignId },
      });
      return;
    }

    const nextContactId = session.queue[0];
    const remainingQueue = session.queue.slice(1);

    const contact = await db.select().from(contacts).where(eq(contacts.id, nextContactId)).get();
    if (!contact) {
      updateSession({ queue: remainingQueue });
      return this.dialNext();
    }

    updateSession({
      queue: remainingQueue,
      currentContactId: nextContactId,
      currentCallState: 'dialing',
      callsMade: session.callsMade + 1,
    });

    broadcast({
      type: 'call_status_changed',
      data: {
        callState: 'dialing',
        contactId: contact.id,
        contactName: contact.name,
        phone: contact.phone,
        company: contact.company,
        queueRemaining: remainingQueue.length,
      },
    });

    try {
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
        contactId: nextContactId,
      });

      const result = await provider.dial({
        to: contact.phone,
        from: campaign?.callerId || '',
        connectionId,
        webhookUrl,
        enableAmd: true,
        clientState,
      });

      updateSession({ currentCallControlId: result.callControlId });

      // Create call log entry
      await db.insert(callLogs).values({
        campaignId: session.campaignId,
        contactId: nextContactId,
        telnyxCallControlId: result.callControlId,
        startedAt: new Date().toISOString(),
      });

      // Update contact
      await db
        .update(contacts)
        .set({
          callCount: contact.callCount + 1,
          lastCalledAt: new Date().toISOString(),
        })
        .where(eq(contacts.id, nextContactId));
    } catch (err: any) {
      broadcast({
        type: 'error',
        data: { message: `Failed to dial: ${err.message}`, contactId: nextContactId },
      });

      // Skip to next on error
      updateSession({ currentCallState: 'idle', currentContactId: null });
      setTimeout(() => this.dialNext(), 1000);
    }
  },

  pauseSession() {
    const session = getSession();
    if (session.status !== 'running') throw new Error('No running session to pause');
    updateSession({ status: 'paused' });
    broadcast({ type: 'session_status_changed', data: { status: 'paused' } });
  },

  async resumeSession() {
    const session = getSession();
    if (session.status !== 'paused') throw new Error('No paused session to resume');
    updateSession({ status: 'running' });
    broadcast({ type: 'session_status_changed', data: { status: 'running' } });

    // If no active call, dial next
    if (!session.currentCallControlId) {
      await this.dialNext();
    }
  },

  async stopSession() {
    const session = getSession();
    if (session.status === 'idle') throw new Error('No session to stop');

    // Hangup current call if active
    if (session.currentCallControlId) {
      try {
        const provider = await getProvider();
        await provider.hangup(session.currentCallControlId);
      } catch {
        // Ignore hangup errors
      }
    }

    resetSession();
    broadcast({ type: 'session_status_changed', data: { status: 'stopped' } });
  },

  async skipCurrent() {
    const session = getSession();
    if (!session.currentCallControlId) throw new Error('No active call to skip');

    try {
      const provider = await getProvider();
      await provider.hangup(session.currentCallControlId);
    } catch {
      // Ignore hangup errors
    }

    updateSession({
      currentCallControlId: null,
      currentContactId: null,
      currentCallState: 'idle',
    });

    // Update contact status
    if (session.currentContactId) {
      await db
        .update(contacts)
        .set({ status: 'no_answer' })
        .where(eq(contacts.id, session.currentContactId));
    }

    await this.dialNext();
  },

  async jumpIn() {
    const session = getSession();
    if (!session.currentCallControlId) throw new Error('No active call to jump into');
    if (session.currentCallState !== 'human_answered' && session.currentCallState !== 'opener_playing') {
      throw new Error('Can only jump in when a human has answered');
    }

    // The bridge logic is handled separately — this triggers the bridge
    // The operator's WebRTC call leg ID needs to be known
    broadcast({
      type: 'call_status_changed',
      data: {
        callState: 'operator_bridged',
        contactId: session.currentContactId,
        message: 'Operator bridging into call',
      },
    });

    updateSession({ currentCallState: 'operator_bridged' });
  },

  getStatus() {
    const session = getSession();
    return {
      status: session.status,
      campaignId: session.campaignId,
      currentContactId: session.currentContactId,
      currentCallState: session.currentCallState,
      queueRemaining: session.queue.length,
      callsMade: session.callsMade,
      voicemailsDropped: session.voicemailsDropped,
      connects: session.connects,
      sessionStartedAt: session.sessionStartedAt,
    };
  },

  // Called by webhook handler when a call ends
  async handleCallEnd(callControlId: string, disposition: string) {
    const session = getSession();
    if (session.currentCallControlId !== callControlId) return;

    // Update call log
    await db
      .update(callLogs)
      .set({
        endedAt: new Date().toISOString(),
        disposition,
      })
      .where(eq(callLogs.telnyxCallControlId, callControlId));

    // Update contact status
    if (session.currentContactId) {
      await db
        .update(contacts)
        .set({ status: disposition as any })
        .where(eq(contacts.id, session.currentContactId));

      broadcast({
        type: 'contact_updated',
        data: { contactId: session.currentContactId, status: disposition },
      });
    }

    // Update stats
    const updates: Partial<typeof session> = {
      currentCallControlId: null,
      currentContactId: null,
      currentCallState: 'idle',
    };
    if (disposition === 'voicemail') updates.voicemailsDropped = session.voicemailsDropped + 1;
    if (disposition === 'connected') updates.connects = session.connects + 1;
    updateSession(updates);

    broadcast({
      type: 'call_log_added',
      data: { callControlId, disposition },
    });

    // Auto-advance if running
    if (session.status === 'running') {
      setTimeout(() => this.dialNext(), 500);
    }
  },
};
