import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { buildApp } from '../app.js';
import { db } from '../db/index.js';
import {
  campaigns,
  contacts,
  callLogs,
  settings,
  transcripts,
} from '../db/schema.js';
import { eq } from 'drizzle-orm';
import {
  resetTeamSession,
  addInFlightCall,
  getInFlightCall,
  addOperator,
  setOperatorWebrtc,
  setOperatorAvailability,
  getTeamSession,
} from '../dialer/team-state.js';
import type { FastifyInstance } from 'fastify';

// Mock the provider so webhook handlers that call provider.hangup / playAudio
// / sendDTMF don't try to hit the real Telnyx API. We don't need a Telnyx
// account configured for these tests.
vi.mock('../providers/index.js', async () => {
  const actual = await vi.importActual<typeof import('../providers/index.js')>(
    '../providers/index.js',
  );
  return {
    ...actual,
    getProvider: vi.fn(async () => ({
      dial: vi.fn(),
      hangup: vi.fn(),
      playAudio: vi.fn(),
      bridge: vi.fn(),
      startRecording: vi.fn(),
      stopRecording: vi.fn(),
      startTranscription: vi.fn(),
      stopTranscription: vi.fn(),
      startStreaming: vi.fn(),
      stopStreaming: vi.fn(),
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

let app: FastifyInstance;
let testCampaignId: number;
let testContactId: number;

beforeAll(async () => {
  app = await buildApp();
  await app.ready();

  // Seed a campaign + contact we'll reuse across tests
  const [campaign] = await db
    .insert(campaigns)
    .values({
      name: 'Webhook Test Campaign',
      callerId: '+15551234567',
    })
    .returning();
  testCampaignId = campaign.id;

  const [contact] = await db
    .insert(contacts)
    .values({
      campaignId: testCampaignId,
      phone: '+15559876543',
      name: 'Webhook Test Contact',
    })
    .returning();
  testContactId = contact.id;
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  resetTeamSession();
  // Most webhook handlers reference getTeamSession().campaignId — set it so
  // the lookups against the campaigns table actually find our seeded row.
  const session = getTeamSession();
  session.campaignId = testCampaignId;
});

afterEach(() => {
  vi.clearAllMocks();
});

// Helper to construct a minimal Telnyx webhook envelope
function telnyxEvent(eventType: string, payload: Record<string, unknown>) {
  return {
    data: {
      event_type: eventType,
      payload: payload,
    },
  };
}

// Helper to inject a webhook POST
async function postWebhook(body: Record<string, unknown>) {
  return app.inject({
    method: 'POST',
    url: '/webhooks/telnyx',
    payload: body,
    headers: { 'content-type': 'application/json' },
  });
}

describe('Telnyx webhook — basic event routing', () => {
  it('returns 200 for an unknown event type without crashing', async () => {
    const res = await postWebhook(
      telnyxEvent('call.something.weird', { call_control_id: 'unknown-event-test' }),
    );
    expect(res.statusCode).toBe(200);
  });

  it('returns 200 for a malformed payload without crashing', async () => {
    const res = await postWebhook({ data: { event_type: 'call.hangup', payload: {} } });
    expect(res.statusCode).toBe(200);
  });

  it('handles call.initiated by updating in-flight call state', async () => {
    addInFlightCall('test-initiated-1', testContactId);
    const res = await postWebhook(
      telnyxEvent('call.initiated', { call_control_id: 'test-initiated-1' }),
    );
    expect(res.statusCode).toBe(200);
    expect(getInFlightCall('test-initiated-1')?.callState).toBe('ringing');
  });
});

describe('Telnyx webhook — call.hangup', () => {
  it('does nothing for an unknown call_control_id when no operator owns it', async () => {
    const res = await postWebhook(
      telnyxEvent('call.hangup', { call_control_id: 'completely-unknown-call' }),
    );
    expect(res.statusCode).toBe(200);
  });

  it('detects orphaned operator WebRTC leg and triggers disconnect cleanup', async () => {
    // Set up an operator who's bridged into a contact's leg
    addOperator(42, 'Op Forty-Two');
    setOperatorWebrtc(42, 'webrtc-leg-orphan');
    setOperatorAvailability(42, 'on_call');

    // The operator's WebRTC leg "hangs up" (browser crashed). The webhook
    // arrives for that leg, not for any contact leg in the inFlightCalls map.
    const res = await postWebhook(
      telnyxEvent('call.hangup', { call_control_id: 'webrtc-leg-orphan' }),
    );
    expect(res.statusCode).toBe(200);

    // The orphaned operator should be marked offline by the disconnect handler
    const { getOperator } = await import('../dialer/team-state.js');
    const op = getOperator(42);
    expect(op?.availability).toBe('offline');
    expect(op?.webrtcCallControlId).toBeNull();
  });
});

describe('Telnyx webhook — call.recording.saved', () => {
  beforeEach(async () => {
    // Wipe transcripts + STT settings between tests
    await db.delete(transcripts);
    await db.delete(settings).where(eq(settings.key, 'WHISPER_BATCH_URL'));
    await db.delete(settings).where(eq(settings.key, 'OPENAI_API_KEY'));
  });

  it('stores the recording URL on the call log', async () => {
    // Seed a call log to attach the recording to
    const [callLog] = await db
      .insert(callLogs)
      .values({
        campaignId: testCampaignId,
        contactId: testContactId,
        telnyxCallControlId: 'rec-saved-test-1',
      })
      .returning();

    const res = await postWebhook(
      telnyxEvent('call.recording.saved', {
        call_control_id: 'rec-saved-test-1',
        recording_urls: { mp3: 'https://recordings.example.com/test.mp3' },
      }),
    );
    expect(res.statusCode).toBe(200);

    const updated = await db.select().from(callLogs).where(eq(callLogs.id, callLog.id)).get();
    expect(updated?.recordingUrl).toBe('https://recordings.example.com/test.mp3');
  });

  it('does NOT trigger post-call transcription when transcriptionMode is off', async () => {
    // Default campaign has transcriptionMode='off'
    const [callLog] = await db
      .insert(callLogs)
      .values({
        campaignId: testCampaignId,
        contactId: testContactId,
        telnyxCallControlId: 'rec-no-transcribe',
      })
      .returning();

    await postWebhook(
      telnyxEvent('call.recording.saved', {
        call_control_id: 'rec-no-transcribe',
        recording_urls: { mp3: 'https://recordings.example.com/no-transcribe.mp3' },
      }),
    );

    // Wait briefly to confirm no async transcription job ran
    await new Promise((r) => setTimeout(r, 100));

    const stored = await db
      .select()
      .from(transcripts)
      .where(eq(transcripts.callLogId, callLog.id));
    expect(stored.length).toBe(0);
  });

  it('triggers post-call transcription when transcriptionMode is post_call', async () => {
    // Create a fresh campaign with transcriptionMode='post_call'
    const [pcCampaign] = await db
      .insert(campaigns)
      .values({
        name: 'Post-Call Campaign',
        callerId: '+15550000000',
        transcriptionMode: 'post_call',
      })
      .returning();
    const [pcCallLog] = await db
      .insert(callLogs)
      .values({
        campaignId: pcCampaign.id,
        contactId: testContactId,
        telnyxCallControlId: 'rec-post-call-test',
      })
      .returning();

    // Configure the STT provider so getBatchSTTProvider() doesn't throw
    await db
      .insert(settings)
      .values({ key: 'WHISPER_BATCH_URL', value: 'http://whisper:9000/asr' });

    // Mock fetch: 1. recording download (orchestrator) 2. STT (provider)
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        blob: async () => new Blob(['fake audio'], { type: 'audio/mpeg' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ text: 'Transcript from webhook trigger.' }),
      }) as any;

    await postWebhook(
      telnyxEvent('call.recording.saved', {
        call_control_id: 'rec-post-call-test',
        recording_urls: { mp3: 'https://recordings.example.com/post-call.mp3' },
      }),
    );

    // The transcription is fire-and-forget — wait for it to complete
    await new Promise((r) => setTimeout(r, 500));

    const stored = await db
      .select()
      .from(transcripts)
      .where(eq(transcripts.callLogId, pcCallLog.id));
    expect(stored.length).toBe(1);
    expect(stored[0].content).toBe('Transcript from webhook trigger.');
  });

  it('falls back gracefully if recording_urls is missing', async () => {
    const res = await postWebhook(
      telnyxEvent('call.recording.saved', {
        call_control_id: 'rec-no-url-test',
        // no recording_urls field
      }),
    );
    expect(res.statusCode).toBe(200);
  });

  it('uses public_recording_urls.mp3 as a fallback', async () => {
    const [callLog] = await db
      .insert(callLogs)
      .values({
        campaignId: testCampaignId,
        contactId: testContactId,
        telnyxCallControlId: 'rec-public-url-test',
      })
      .returning();

    await postWebhook(
      telnyxEvent('call.recording.saved', {
        call_control_id: 'rec-public-url-test',
        public_recording_urls: { mp3: 'https://public.example.com/clip.mp3' },
      }),
    );

    const updated = await db.select().from(callLogs).where(eq(callLogs.id, callLog.id)).get();
    expect(updated?.recordingUrl).toBe('https://public.example.com/clip.mp3');
  });
});

describe('Telnyx webhook — call.transcription (real-time path)', () => {
  it('stores final transcript lines and ignores interim ones', async () => {
    const [callLog] = await db
      .insert(callLogs)
      .values({
        campaignId: testCampaignId,
        contactId: testContactId,
        telnyxCallControlId: 'realtime-trans-test',
      })
      .returning();

    // Interim — should NOT be stored
    await postWebhook(
      telnyxEvent('call.transcription', {
        call_control_id: 'realtime-trans-test',
        transcription_data: {
          transcript: 'partial...',
          confidence: 0.5,
          is_final: false,
        },
      }),
    );

    // Final — SHOULD be stored
    await postWebhook(
      telnyxEvent('call.transcription', {
        call_control_id: 'realtime-trans-test',
        transcription_data: {
          transcript: 'this is a final line',
          confidence: 0.95,
          is_final: true,
        },
      }),
    );

    const stored = await db
      .select()
      .from(transcripts)
      .where(eq(transcripts.callLogId, callLog.id));
    expect(stored.length).toBe(1);
    expect(stored[0].content).toBe('this is a final line');
    expect(stored[0].confidence).toBe(0.95);
  });
});
