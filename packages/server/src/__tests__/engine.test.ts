import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { buildApp } from '../app.js';
import { TEST_USER_ID, TEST_OPERATOR_USER_ID } from './setup.js';
import { db } from '../db/index.js';
import { campaigns, contacts, callLogs } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import {
  resetTeamSession,
  getTeamSession,
  addOperator,
  setOperatorWebrtc,
  setOperatorAvailability,
  addInFlightCall,
  getInFlightCall,
} from '../dialer/team-state.js';
import type { FastifyInstance } from 'fastify';

// Mock the provider so dial/bridge/hangup don't try to hit Telnyx. Each
// dial returns a unique call_control_id derived from the to-number so
// tests can correlate. Other methods are no-ops.
let dialCounter = 0;
const dialMock = vi.fn(async ({ to }: { to: string }) => {
  dialCounter++;
  return {
    callControlId: `mock-call-${to}-${dialCounter}`,
    callLegId: `mock-leg-${dialCounter}`,
  };
});
const hangupMock = vi.fn();
const bridgeMock = vi.fn();
const playAudioMock = vi.fn();
const startRecordingMock = vi.fn();
const startTranscriptionMock = vi.fn();

vi.mock('../providers/index.js', async () => {
  const actual = await vi.importActual<typeof import('../providers/index.js')>(
    '../providers/index.js',
  );
  return {
    ...actual,
    getProvider: vi.fn(async () => ({
      dial: dialMock,
      hangup: hangupMock,
      bridge: bridgeMock,
      playAudio: playAudioMock,
      startRecording: startRecordingMock,
      stopRecording: vi.fn(),
      startTranscription: startTranscriptionMock,
      stopTranscription: vi.fn(),
      sendDTMF: vi.fn(),
      speak: vi.fn(),
      mute: vi.fn(),
      unmute: vi.fn(),
      stopPlayback: vi.fn(),
      provisionCredential: vi.fn(),
      deleteCredential: vi.fn(),
    })),
  };
});

// Import dialerEngine AFTER vi.mock so the mocked provider is in scope
let dialerEngine: typeof import('../dialer/engine.js').dialerEngine;
let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp();
  await app.ready();
  ({ dialerEngine } = await import('../dialer/engine.js'));
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  resetTeamSession();
  dialCounter = 0;
  dialMock.mockClear();
  hangupMock.mockClear();
  bridgeMock.mockClear();
  playAudioMock.mockClear();
  startRecordingMock.mockClear();
  startTranscriptionMock.mockClear();
});

afterEach(async () => {
  // Clean up any in-flight calls created by tests so they don't leak across
  resetTeamSession();
});

// Helper: seed a campaign + N pending contacts and return them
async function seedCampaignWithContacts(contactCount: number, options: Partial<{ name: string; dropIfNoOperator: boolean }> = {}) {
  const [campaign] = await db
    .insert(campaigns)
    .values({
      name: options.name ?? `Engine Test ${Date.now()}-${Math.random()}`,
      callerId: '+15555550000',
      dropIfNoOperator: options.dropIfNoOperator ?? false,
    })
    .returning();

  const contactRows = [];
  for (let i = 0; i < contactCount; i++) {
    const [c] = await db
      .insert(contacts)
      .values({
        campaignId: campaign.id,
        phone: `+1555000${String(i).padStart(4, '0')}`,
        name: `Test Contact ${i}`,
      })
      .returning();
    contactRows.push(c);
  }
  return { campaign, contacts: contactRows };
}

describe('dialerEngine.startSession', () => {
  it('throws when the campaign does not exist', async () => {
    await expect(dialerEngine.startSession(99999)).rejects.toThrow(/Campaign not found/);
  });

  it('throws when the campaign has no pending contacts', async () => {
    const { campaign } = await seedCampaignWithContacts(0);
    await expect(dialerEngine.startSession(campaign.id)).rejects.toThrow(/No pending contacts/);
  });

  it('throws when a session is already running', async () => {
    const { campaign } = await seedCampaignWithContacts(2);
    await dialerEngine.startSession(campaign.id);
    expect(getTeamSession().status).toBe('running');

    const { campaign: campaign2 } = await seedCampaignWithContacts(2);
    await expect(dialerEngine.startSession(campaign2.id)).rejects.toThrow(/already running/);

    // Stop session so we don't pollute the next test
    await dialerEngine.stopSession();
  });

  it('seeds the queue with all pending contact ids and starts dialing', async () => {
    const { campaign, contacts: c } = await seedCampaignWithContacts(3);
    await dialerEngine.startSession(campaign.id);

    const session = getTeamSession();
    expect(session.status).toBe('running');
    expect(session.campaignId).toBe(campaign.id);
    // Queue may already be partially drained by the auto dialNextBatch tick
    // — assert all 3 contacts were either dialed or are still queued.
    expect(session.queue.length + session.inFlightCalls.size + session.callsMade).toBeGreaterThanOrEqual(c.length);

    await dialerEngine.stopSession();
  });
});

describe('dialerEngine.dialNextBatch', () => {
  it('marks the session completed when queue + in-flight are both empty', async () => {
    const { campaign } = await seedCampaignWithContacts(1);
    await dialerEngine.startSession(campaign.id);
    // After starting, drain everything: empty the queue and in-flight
    const session = getTeamSession();
    session.queue = [];
    session.inFlightCalls.clear();

    await dialerEngine.dialNextBatch();

    expect(getTeamSession().status).toBe('stopped');
    // Verify the campaign was marked completed
    const updated = await db.select().from(campaigns).where(eq(campaigns.id, campaign.id)).get();
    expect(updated?.status).toBe('completed');
  });

  it('does nothing when the session status is not running', async () => {
    const session = getTeamSession();
    session.status = 'paused';
    session.queue = [1, 2, 3];

    await dialerEngine.dialNextBatch();

    // Still paused; queue untouched; no dials happened
    expect(getTeamSession().status).toBe('paused');
    expect(dialMock).not.toHaveBeenCalled();
  });

  it('dials at least 1 contact when an operator is available', async () => {
    addOperator(TEST_USER_ID, 'Test Op');
    setOperatorWebrtc(TEST_USER_ID, 'webrtc-leg-1');
    setOperatorAvailability(TEST_USER_ID, 'available');

    const { campaign } = await seedCampaignWithContacts(5);
    await dialerEngine.startSession(campaign.id);

    // dialNextBatch ran inside startSession; should have dialed at least 1
    expect(dialMock.mock.calls.length).toBeGreaterThan(0);

    await dialerEngine.stopSession();
  });
});

describe('dialerEngine.routeToOperator', () => {
  it('returns false when no in-flight call exists for the given id', async () => {
    const result = await dialerEngine.routeToOperator('nonexistent-call');
    expect(result).toBe(false);
  });

  it('drops the call and re-queues the contact when no operator available AND dropIfNoOperator=true', async () => {
    const { campaign, contacts: c } = await seedCampaignWithContacts(1, {
      dropIfNoOperator: true,
    });
    const session = getTeamSession();
    session.campaignId = campaign.id;

    addInFlightCall('drop-test-call', c[0].id);

    const result = await dialerEngine.routeToOperator('drop-test-call');
    expect(result).toBe(false);
    expect(hangupMock).toHaveBeenCalledWith('drop-test-call');

    // Contact was re-set to pending (re-queued for next call attempt)
    const refreshed = await db.select().from(contacts).where(eq(contacts.id, c[0].id)).get();
    expect(refreshed?.status).toBe('pending');
  });

  it('puts the call in the waiting queue when no operator available AND dropIfNoOperator=false', async () => {
    const { campaign, contacts: c } = await seedCampaignWithContacts(1, {
      dropIfNoOperator: false,
    });
    const session = getTeamSession();
    session.campaignId = campaign.id;

    addInFlightCall('wait-test-call', c[0].id);

    const result = await dialerEngine.routeToOperator('wait-test-call');
    expect(result).toBe(false);
    expect(getTeamSession().waitingCalls).toContain('wait-test-call');
    expect(getInFlightCall('wait-test-call')?.callState).toBe('waiting_for_operator');
  });

  it('bridges the call to an available operator and notifies them', async () => {
    addOperator(TEST_USER_ID, 'Bridge Op');
    setOperatorWebrtc(TEST_USER_ID, 'op-leg-bridge');
    setOperatorAvailability(TEST_USER_ID, 'available');

    const { campaign, contacts: c } = await seedCampaignWithContacts(1);
    const session = getTeamSession();
    session.campaignId = campaign.id;

    // Insert a call log so handleCallEnd path inside the engine has a row to update
    await db.insert(callLogs).values({
      campaignId: campaign.id,
      contactId: c[0].id,
      telnyxCallControlId: 'route-bridge-call',
    });
    addInFlightCall('route-bridge-call', c[0].id);

    const result = await dialerEngine.routeToOperator('route-bridge-call');
    expect(result).toBe(true);
    expect(bridgeMock).toHaveBeenCalledWith('route-bridge-call', 'op-leg-bridge');
    expect(getInFlightCall('route-bridge-call')?.assignedOperatorId).toBe(TEST_USER_ID);
    expect(getInFlightCall('route-bridge-call')?.callState).toBe('operator_bridged');
  });

  it('reverts state when bridge fails', async () => {
    addOperator(TEST_USER_ID, 'Failbridge Op');
    setOperatorWebrtc(TEST_USER_ID, 'op-leg-fail');
    setOperatorAvailability(TEST_USER_ID, 'available');

    const { campaign, contacts: c } = await seedCampaignWithContacts(1);
    const session = getTeamSession();
    session.campaignId = campaign.id;

    addInFlightCall('bridge-fail-call', c[0].id);

    // Force bridge to throw on this single call
    bridgeMock.mockRejectedValueOnce(new Error('telnyx 500'));

    const result = await dialerEngine.routeToOperator('bridge-fail-call');
    expect(result).toBe(false);
    expect(getInFlightCall('bridge-fail-call')?.callState).toBe('human_answered');
    expect(getInFlightCall('bridge-fail-call')?.assignedOperatorId).toBeNull();
  });
});

describe('dialerEngine.handleCallEnd', () => {
  it('does nothing when the call is unknown', async () => {
    // Should not throw
    await expect(dialerEngine.handleCallEnd('unknown-call', 'connected')).resolves.toBeUndefined();
  });

  it('marks the contact as connected on disposition=connected', async () => {
    const { campaign, contacts: c } = await seedCampaignWithContacts(1);
    const session = getTeamSession();
    session.campaignId = campaign.id;
    await db
      .insert(callLogs)
      .values({ campaignId: campaign.id, contactId: c[0].id, telnyxCallControlId: 'end-conn' });
    addInFlightCall('end-conn', c[0].id);

    await dialerEngine.handleCallEnd('end-conn', 'connected');

    const refreshed = await db.select().from(contacts).where(eq(contacts.id, c[0].id)).get();
    expect(refreshed?.status).toBe('connected');
    // In-flight call removed
    expect(getInFlightCall('end-conn')).toBeUndefined();
  });

  it('marks the contact as voicemail and increments voicemailsDropped', async () => {
    const { campaign, contacts: c } = await seedCampaignWithContacts(1);
    const session = getTeamSession();
    session.campaignId = campaign.id;
    const before = session.voicemailsDropped;

    await db
      .insert(callLogs)
      .values({ campaignId: campaign.id, contactId: c[0].id, telnyxCallControlId: 'end-vm' });
    addInFlightCall('end-vm', c[0].id);

    await dialerEngine.handleCallEnd('end-vm', 'voicemail');

    const refreshed = await db.select().from(contacts).where(eq(contacts.id, c[0].id)).get();
    expect(refreshed?.status).toBe('voicemail');
    expect(getTeamSession().voicemailsDropped).toBe(before + 1);
  });

  it('maps ringing_abandoned to no_answer for the contact but keeps the richer disposition on the call log', async () => {
    const { campaign, contacts: c } = await seedCampaignWithContacts(1);
    const session = getTeamSession();
    session.campaignId = campaign.id;

    const [callLog] = await db
      .insert(callLogs)
      .values({
        campaignId: campaign.id,
        contactId: c[0].id,
        telnyxCallControlId: 'end-ringing-abandon',
      })
      .returning();
    addInFlightCall('end-ringing-abandon', c[0].id);

    await dialerEngine.handleCallEnd('end-ringing-abandon', 'ringing_abandoned');

    const refreshedContact = await db
      .select()
      .from(contacts)
      .where(eq(contacts.id, c[0].id))
      .get();
    expect(refreshedContact?.status).toBe('no_answer');

    const refreshedLog = await db.select().from(callLogs).where(eq(callLogs.id, callLog.id)).get();
    expect(refreshedLog?.disposition).toBe('ringing_abandoned');
  });

  it('frees the assigned operator into wrap_up state', async () => {
    addOperator(TEST_OPERATOR_USER_ID, 'WrapUp Op');
    setOperatorAvailability(TEST_OPERATOR_USER_ID, 'on_call');
    const { campaign, contacts: c } = await seedCampaignWithContacts(1);
    const session = getTeamSession();
    session.campaignId = campaign.id;

    await db
      .insert(callLogs)
      .values({ campaignId: campaign.id, contactId: c[0].id, telnyxCallControlId: 'end-wrapup' });
    const inFlight = addInFlightCall('end-wrapup', c[0].id);
    inFlight.assignedOperatorId = TEST_OPERATOR_USER_ID;

    await dialerEngine.handleCallEnd('end-wrapup', 'connected');

    const { getOperator } = await import('../dialer/team-state.js');
    expect(getOperator(TEST_OPERATOR_USER_ID)?.availability).toBe('wrap_up');
  });
});

describe('dialerEngine.tryRouteWaitingCall', () => {
  it('does nothing when the waiting queue is empty', async () => {
    const before = bridgeMock.mock.calls.length;
    await dialerEngine.tryRouteWaitingCall();
    expect(bridgeMock.mock.calls.length).toBe(before);
  });

  it('routes a waiting call to a newly-available operator', async () => {
    addOperator(TEST_USER_ID, 'Waiting Op');
    setOperatorWebrtc(TEST_USER_ID, 'op-leg-wait');
    setOperatorAvailability(TEST_USER_ID, 'available');

    const { campaign, contacts: c } = await seedCampaignWithContacts(1);
    const session = getTeamSession();
    session.campaignId = campaign.id;
    session.waitingCalls = ['waiting-call-1'];

    await db.insert(callLogs).values({
      campaignId: campaign.id,
      contactId: c[0].id,
      telnyxCallControlId: 'waiting-call-1',
    });
    addInFlightCall('waiting-call-1', c[0].id);

    await dialerEngine.tryRouteWaitingCall();

    expect(bridgeMock).toHaveBeenCalled();
    expect(getInFlightCall('waiting-call-1')?.assignedOperatorId).toBe(TEST_USER_ID);
    // Waiting queue should be drained
    expect(getTeamSession().waitingCalls).not.toContain('waiting-call-1');
  });
});

describe('dialerEngine.pauseSession / resumeSession / stopSession', () => {
  it('pause flips status to paused', async () => {
    const { campaign } = await seedCampaignWithContacts(1);
    await dialerEngine.startSession(campaign.id);
    dialerEngine.pauseSession();
    expect(getTeamSession().status).toBe('paused');
    await dialerEngine.stopSession();
  });

  it('resume flips status back to running', async () => {
    const { campaign } = await seedCampaignWithContacts(1);
    await dialerEngine.startSession(campaign.id);
    dialerEngine.pauseSession();
    await dialerEngine.resumeSession();
    expect(getTeamSession().status).toBe('running');
    await dialerEngine.stopSession();
  });

  it('stop flips status to stopped and clears the session', async () => {
    const { campaign } = await seedCampaignWithContacts(1);
    await dialerEngine.startSession(campaign.id);
    await dialerEngine.stopSession();
    // After stop, the session is reset — campaignId is back to 0
    expect(getTeamSession().campaignId).toBe(0);
  });
});
