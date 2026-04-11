import { describe, it, expect, beforeAll, afterAll, beforeEach, vi, afterEach } from 'vitest';
import { buildApp } from '../app.js';
import { authCookie, TEST_USER_ID } from './setup.js';
import { db } from '../db/index.js';
import { campaigns, contacts, callLogs, settings, transcripts } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import {
  OpenAIWhisperProvider,
  SelfHostedWhisperProvider,
  getBatchSTTProvider,
} from '../transcription/providers.js';
import { transcribeCallRecording } from '../transcription/post-call.js';
import type { FastifyInstance } from 'fastify';

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp();
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

// Snapshot global fetch so we can restore between tests
const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

// Helper to seed a campaign+contact+callLog row for orchestration tests
async function seedCampaignWithCallLog(transcriptionMode: 'off' | 'realtime' | 'post_call') {
  const [campaign] = await db
    .insert(campaigns)
    .values({
      name: `Transcription Test ${transcriptionMode} ${Date.now()}`,
      callerId: '+15551234567',
      transcriptionMode,
    })
    .returning();

  const [contact] = await db
    .insert(contacts)
    .values({
      campaignId: campaign.id,
      phone: '+15559876543',
      name: 'Test Contact',
    })
    .returning();

  const [callLog] = await db
    .insert(callLogs)
    .values({
      campaignId: campaign.id,
      contactId: contact.id,
      operatorId: TEST_USER_ID,
      telnyxCallControlId: `transcribe-test-${Date.now()}-${Math.random()}`,
      startedAt: new Date().toISOString(),
    })
    .returning();

  return { campaign, contact, callLog };
}

describe('OpenAIWhisperProvider', () => {
  const fakeBlob = () => new Blob(['fake audio bytes'], { type: 'audio/mpeg' });

  it('POSTs to the OpenAI Whisper endpoint with the API key and parses response', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ text: 'Hello, this is a test transcript.' }),
    });
    global.fetch = fetchMock as any;

    const provider = new OpenAIWhisperProvider('sk-test-key');
    const result = await provider.transcribe(fakeBlob());

    expect(result.text).toBe('Hello, this is a test transcript.');
    expect(result.confidence).toBeNull();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const call = fetchMock.mock.calls[0];
    expect(call[0]).toBe('https://api.openai.com/v1/audio/transcriptions');
    expect(call[1].method).toBe('POST');
    expect(call[1].headers.Authorization).toBe('Bearer sk-test-key');
    expect(call[1].body).toBeInstanceOf(FormData);
  });

  it('throws when the OpenAI API returns an error', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () => 'Invalid API key',
    }) as any;

    const provider = new OpenAIWhisperProvider('sk-bad-key');
    await expect(provider.transcribe(fakeBlob())).rejects.toThrow(/401/);
  });

  it('throws when OpenAI returns no text', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    }) as any;

    const provider = new OpenAIWhisperProvider('sk-test-key');
    await expect(provider.transcribe(fakeBlob())).rejects.toThrow(/no text/);
  });
});

describe('SelfHostedWhisperProvider', () => {
  const fakeBlob = () => new Blob(['fake audio'], { type: 'audio/mpeg' });

  it('POSTs FormData to the configured endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ text: 'Self-hosted transcript here.' }),
    });
    global.fetch = fetchMock as any;

    const provider = new SelfHostedWhisperProvider('http://whisper.local:9000/asr');
    const result = await provider.transcribe(fakeBlob());

    expect(result.text).toBe('Self-hosted transcript here.');
    expect(result.confidence).toBeNull();

    const call = fetchMock.mock.calls[0];
    expect(call[0]).toBe('http://whisper.local:9000/asr');
    expect(call[1].method).toBe('POST');
    expect(call[1].body).toBeInstanceOf(FormData);
    expect(call[1].headers).toBeUndefined();
  });

  it('throws when the self-hosted endpoint returns an error', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => 'Whisper crashed',
    }) as any;

    const provider = new SelfHostedWhisperProvider('http://whisper:9000/asr');
    await expect(provider.transcribe(fakeBlob())).rejects.toThrow(/500/);
  });
});

describe('getBatchSTTProvider — factory', () => {
  beforeEach(async () => {
    // Clean up any settings rows from previous tests
    await db.delete(settings).where(eq(settings.key, 'WHISPER_BATCH_URL'));
    await db.delete(settings).where(eq(settings.key, 'OPENAI_API_KEY'));
    delete process.env.WHISPER_BATCH_URL;
    delete process.env.OPENAI_API_KEY;
  });

  it('throws when neither provider is configured', async () => {
    await expect(getBatchSTTProvider()).rejects.toThrow(/No batch STT provider configured/);
  });

  it('prefers self-hosted Whisper when WHISPER_BATCH_URL is set', async () => {
    await db.insert(settings).values({
      key: 'WHISPER_BATCH_URL',
      value: 'http://whisper:9000/asr',
    });
    await db.insert(settings).values({
      key: 'OPENAI_API_KEY',
      value: 'sk-fallback-key',
    });
    const provider = await getBatchSTTProvider();
    expect(provider.name).toBe('self-hosted-whisper');
  });

  it('falls back to OpenAI when only OPENAI_API_KEY is set', async () => {
    await db.insert(settings).values({
      key: 'OPENAI_API_KEY',
      value: 'sk-test-key',
    });
    const provider = await getBatchSTTProvider();
    expect(provider.name).toBe('openai-whisper');
  });
});

describe('transcribeCallRecording — orchestration', () => {
  beforeEach(async () => {
    await db.delete(settings).where(eq(settings.key, 'WHISPER_BATCH_URL'));
    await db.delete(settings).where(eq(settings.key, 'OPENAI_API_KEY'));
    delete process.env.WHISPER_BATCH_URL;
    delete process.env.OPENAI_API_KEY;
  });

  it('inserts a transcript row when STT succeeds', async () => {
    const { callLog } = await seedCampaignWithCallLog('post_call');

    // Configure self-hosted Whisper
    await db
      .insert(settings)
      .values({ key: 'WHISPER_BATCH_URL', value: 'http://whisper:9000/asr' });

    // Mock fetches: 1. recording download (orchestrator) 2. STT (provider)
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        blob: async () => new Blob(['audio'], { type: 'audio/mpeg' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ text: 'Test transcript content from orchestrator.' }),
      }) as any;

    await transcribeCallRecording(callLog.id, 'https://recordings.example.com/test.mp3');

    const stored = await db
      .select()
      .from(transcripts)
      .where(eq(transcripts.callLogId, callLog.id));
    expect(stored.length).toBe(1);
    expect(stored[0].content).toBe('Test transcript content from orchestrator.');
    expect(stored[0].speaker).toBe('inbound');
  });

  it('does not throw when STT fails (errors are caught and logged)', async () => {
    const { callLog } = await seedCampaignWithCallLog('post_call');

    // No provider configured → factory throws → orchestrator catches
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Should not throw
    await expect(
      transcribeCallRecording(callLog.id, 'https://example.com/audio.mp3'),
    ).resolves.toBeUndefined();

    expect(consoleError).toHaveBeenCalled();
    // No transcript should have been stored
    const stored = await db
      .select()
      .from(transcripts)
      .where(eq(transcripts.callLogId, callLog.id));
    expect(stored.length).toBe(0);
  });

  it('skips storing when the transcript is empty', async () => {
    const { callLog } = await seedCampaignWithCallLog('post_call');

    await db
      .insert(settings)
      .values({ key: 'WHISPER_BATCH_URL', value: 'http://whisper:9000/asr' });

    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        blob: async () => new Blob(['silence'], { type: 'audio/mpeg' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ text: '   ' }), // whitespace only
      }) as any;

    await transcribeCallRecording(callLog.id, 'https://example.com/silence.mp3');

    const stored = await db
      .select()
      .from(transcripts)
      .where(eq(transcripts.callLogId, callLog.id));
    expect(stored.length).toBe(0);
  });
});

describe('Campaigns API — transcriptionMode field', () => {
  it('POST /api/campaigns persists transcriptionMode and defaults to off', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/campaigns',
      headers: { cookie: authCookie() },
      payload: {
        name: 'Trans Mode Default Test',
        callerId: '+15551110000',
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().transcriptionMode).toBe('off');
  });

  it('POST /api/campaigns accepts transcriptionMode = post_call', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/campaigns',
      headers: { cookie: authCookie() },
      payload: {
        name: 'Post Call Test',
        callerId: '+15551110001',
        transcriptionMode: 'post_call',
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().transcriptionMode).toBe('post_call');
  });

  it('PUT /api/campaigns/:id updates transcriptionMode', async () => {
    const create = await app.inject({
      method: 'POST',
      url: '/api/campaigns',
      headers: { cookie: authCookie() },
      payload: { name: 'Mode Update Test', callerId: '+15551110002' },
    });
    const id = create.json().id;

    const update = await app.inject({
      method: 'PUT',
      url: `/api/campaigns/${id}`,
      headers: { cookie: authCookie() },
      payload: { transcriptionMode: 'realtime' },
    });
    expect(update.statusCode).toBe(200);
    expect(update.json().transcriptionMode).toBe('realtime');
  });

  it('GET /api/campaigns includes transcriptionMode in the list response', async () => {
    const list = await app.inject({
      method: 'GET',
      url: '/api/campaigns',
      headers: { cookie: authCookie() },
    });
    expect(list.statusCode).toBe(200);
    const rows = list.json();
    expect(rows.length).toBeGreaterThan(0);
    expect('transcriptionMode' in rows[0]).toBe(true);
  });

  it('rejects invalid transcriptionMode value', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/campaigns',
      headers: { cookie: authCookie() },
      payload: {
        name: 'Bad Mode Test',
        callerId: '+15551110003',
        transcriptionMode: 'invalid_mode',
      },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('Settings API — transcription keys whitelist', () => {
  it('PUT /api/settings accepts OPENAI_API_KEY', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/api/settings',
      headers: { cookie: authCookie() },
      payload: { OPENAI_API_KEY: 'sk-whitelist-test' },
    });
    expect(res.statusCode).toBe(200);
  });

  it('PUT /api/settings accepts WHISPER_BATCH_URL', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/api/settings',
      headers: { cookie: authCookie() },
      payload: { WHISPER_BATCH_URL: 'http://whisper:9000/asr' },
    });
    expect(res.statusCode).toBe(200);
  });

  it('PUT /api/settings accepts RECORDING_STORAGE', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/api/settings',
      headers: { cookie: authCookie() },
      payload: { RECORDING_STORAGE: 'local' },
    });
    expect(res.statusCode).toBe(200);
  });
});

describe('POST /api/transcripts/retranscribe', () => {
  beforeEach(async () => {
    await db.delete(settings).where(eq(settings.key, 'WHISPER_BATCH_URL'));
    await db.delete(settings).where(eq(settings.key, 'OPENAI_API_KEY'));
  });

  it('returns 404 for a non-existent call log', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/transcripts/retranscribe',
      headers: { cookie: authCookie() },
      payload: { callLogId: 999999 },
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 400 when the call has no recording URL', async () => {
    const { callLog } = await seedCampaignWithCallLog('off');
    // No recordingUrl set
    const res = await app.inject({
      method: 'POST',
      url: '/api/transcripts/retranscribe',
      headers: { cookie: authCookie() },
      payload: { callLogId: callLog.id },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/No recording/);
  });

  it('returns 409 when a transcript already exists and force=false', async () => {
    const { callLog } = await seedCampaignWithCallLog('off');
    await db.update(callLogs).set({ recordingUrl: 'https://r.example.com/x.mp3' }).where(eq(callLogs.id, callLog.id));
    await db.insert(transcripts).values({
      callLogId: callLog.id,
      speaker: 'inbound',
      content: 'existing transcript',
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/transcripts/retranscribe',
      headers: { cookie: authCookie() },
      payload: { callLogId: callLog.id },
    });
    expect(res.statusCode).toBe(409);
  });

  it('replaces an existing transcript when force=true', async () => {
    const { callLog } = await seedCampaignWithCallLog('off');
    await db.update(callLogs).set({ recordingUrl: 'https://r.example.com/x.mp3' }).where(eq(callLogs.id, callLog.id));
    await db.insert(transcripts).values({
      callLogId: callLog.id,
      speaker: 'inbound',
      content: 'OLD transcript that should be replaced',
    });

    // Configure STT and mock both fetches (download + STT)
    await db
      .insert(settings)
      .values({ key: 'WHISPER_BATCH_URL', value: 'http://whisper:9000/asr' });
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        blob: async () => new Blob(['audio'], { type: 'audio/mpeg' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ text: 'NEW transcript from re-run' }),
      }) as any;

    const res = await app.inject({
      method: 'POST',
      url: '/api/transcripts/retranscribe',
      headers: { cookie: authCookie() },
      payload: { callLogId: callLog.id, force: true },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('transcribed');
    expect(res.json().lines).toBe(1);

    // Verify the old transcript was replaced
    const stored = await db
      .select()
      .from(transcripts)
      .where(eq(transcripts.callLogId, callLog.id));
    expect(stored.length).toBe(1);
    expect(stored[0].content).toBe('NEW transcript from re-run');
  });

  it('transcribes a call that has no existing transcript', async () => {
    const { callLog } = await seedCampaignWithCallLog('off');
    await db.update(callLogs).set({ recordingUrl: 'https://r.example.com/y.mp3' }).where(eq(callLogs.id, callLog.id));

    await db
      .insert(settings)
      .values({ key: 'WHISPER_BATCH_URL', value: 'http://whisper:9000/asr' });
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        blob: async () => new Blob(['audio'], { type: 'audio/mpeg' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ text: 'First-time transcript' }),
      }) as any;

    const res = await app.inject({
      method: 'POST',
      url: '/api/transcripts/retranscribe',
      headers: { cookie: authCookie() },
      payload: { callLogId: callLog.id },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('transcribed');

    const stored = await db
      .select()
      .from(transcripts)
      .where(eq(transcripts.callLogId, callLog.id));
    expect(stored.length).toBe(1);
    expect(stored[0].content).toBe('First-time transcript');
  });

  it('rejects invalid body with 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/transcripts/retranscribe',
      headers: { cookie: authCookie() },
      payload: { callLogId: 'not-a-number' },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('Local recording storage — loadRecording from disk', () => {
  it('reads a local recording file from /uploads path', async () => {
    // Write a tiny file into uploads/recordings/ and confirm the orchestrator
    // can pick it up via the relative URL.
    const { mkdirSync, writeFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const recordingsDir = resolve('uploads/recordings');
    mkdirSync(recordingsDir, { recursive: true });
    const localFile = resolve(recordingsDir, 'test-local.mp3');
    writeFileSync(localFile, Buffer.from('fake mp3 bytes'));

    const { callLog } = await seedCampaignWithCallLog('off');
    await db
      .update(callLogs)
      .set({ recordingUrl: '/uploads/recordings/test-local.mp3' })
      .where(eq(callLogs.id, callLog.id));

    await db
      .insert(settings)
      .values({ key: 'WHISPER_BATCH_URL', value: 'http://whisper:9000/asr' });

    // Only the STT call needs a fetch mock — the recording read is from disk
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ text: 'Transcript from local file' }),
    }) as any;

    const res = await app.inject({
      method: 'POST',
      url: '/api/transcripts/retranscribe',
      headers: { cookie: authCookie() },
      payload: { callLogId: callLog.id },
    });
    expect(res.statusCode).toBe(200);

    const stored = await db
      .select()
      .from(transcripts)
      .where(eq(transcripts.callLogId, callLog.id));
    expect(stored[0].content).toBe('Transcript from local file');

    // Clean up
    const { unlinkSync } = await import('node:fs');
    try {
      unlinkSync(localFile);
    } catch {}
  });
});
