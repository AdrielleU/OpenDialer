import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { buildApp } from '../app.js';
import { authCookie, operatorAuthCookie, TEST_USER_ID, TEST_OPERATOR_USER_ID } from './setup.js';
import { db } from '../db/index.js';
import { campaigns, recordings } from '../db/schema.js';
import {
  resetTeamSession,
  addInFlightCall,
  removeInFlightCall,
  updateInFlightCall,
  getTeamSession,
} from '../dialer/team-state.js';
import type { FastifyInstance } from 'fastify';

const playAudioMock = vi.fn();
const stopPlaybackMock = vi.fn();

vi.mock('../providers/index.js', async () => {
  const actual = await vi.importActual<typeof import('../providers/index.js')>(
    '../providers/index.js',
  );
  return {
    ...actual,
    getProvider: vi.fn(async () => ({
      dial: vi.fn(),
      hangup: vi.fn(),
      bridge: vi.fn(),
      playAudio: playAudioMock,
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
      stopPlayback: stopPlaybackMock,
      provisionCredential: vi.fn(),
      deleteCredential: vi.fn(),
    })),
  };
});

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp();
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  resetTeamSession();
  playAudioMock.mockClear();
  stopPlaybackMock.mockClear();
});

describe('POST /api/dialer/drop-voicemail', () => {
  it('rejects empty callControlId', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/dialer/drop-voicemail',
      headers: { cookie: authCookie() },
      payload: { callControlId: '' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 404 when call does not exist', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/dialer/drop-voicemail',
      headers: { cookie: authCookie() },
      payload: { callControlId: 'nonexistent' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('rejects a non-assigned operator with 403', async () => {
    addInFlightCall('drop-vm-not-mine', 1);
    updateInFlightCall('drop-vm-not-mine', { assignedOperatorId: 99999 });

    const res = await app.inject({
      method: 'POST',
      url: '/api/dialer/drop-voicemail',
      headers: { cookie: operatorAuthCookie() },
      payload: { callControlId: 'drop-vm-not-mine' },
    });
    expect(res.statusCode).toBe(403);
    removeInFlightCall('drop-vm-not-mine');
  });

  it('allows admin to drop on a call assigned to a different operator', async () => {
    const [rec] = await db
      .insert(recordings)
      .values({ name: 'admin-vm', type: 'voicemail', filePath: '/files/admin-vm.mp3' })
      .returning();
    const [campaign] = await db
      .insert(campaigns)
      .values({
        name: 'VM Drop Admin',
        callerId: '+15555550000',
        voicemailRecordingId: rec.id,
      })
      .returning();
    // Set session campaign so the route can resolve the campaign voicemail
    getTeamSession().campaignId = campaign.id;

    addInFlightCall('drop-vm-admin', 1);
    updateInFlightCall('drop-vm-admin', { assignedOperatorId: TEST_OPERATOR_USER_ID });

    const res = await app.inject({
      method: 'POST',
      url: '/api/dialer/drop-voicemail',
      headers: { cookie: authCookie() }, // admin
      payload: { callControlId: 'drop-vm-admin' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('dropping');
    expect(playAudioMock).toHaveBeenCalledTimes(1);
    // playAudio called with voicemail playbackType in client_state
    const [, , clientState] = playAudioMock.mock.calls[0];
    expect(JSON.parse(clientState).playbackType).toBe('voicemail');

    removeInFlightCall('drop-vm-admin');
  });

  it('returns 400 when no voicemail recording is configured and none provided', async () => {
    const [campaign] = await db
      .insert(campaigns)
      .values({ name: 'No VM', callerId: '+15555550000', voicemailRecordingId: null })
      .returning();
    getTeamSession().campaignId = campaign.id;

    addInFlightCall('drop-vm-no-recording', 1);
    updateInFlightCall('drop-vm-no-recording', { assignedOperatorId: TEST_USER_ID });

    const res = await app.inject({
      method: 'POST',
      url: '/api/dialer/drop-voicemail',
      headers: { cookie: authCookie() },
      payload: { callControlId: 'drop-vm-no-recording' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/voicemail recording/i);

    removeInFlightCall('drop-vm-no-recording');
  });

  it('uses an explicit recordingId override when provided', async () => {
    const [rec] = await db
      .insert(recordings)
      .values({ name: 'override', type: 'voicemail', filePath: '/files/override.mp3' })
      .returning();
    const [campaign] = await db
      .insert(campaigns)
      .values({ name: 'VM Override', callerId: '+15555550000' })
      .returning();
    getTeamSession().campaignId = campaign.id;

    addInFlightCall('drop-vm-override', 1);
    updateInFlightCall('drop-vm-override', { assignedOperatorId: TEST_USER_ID });

    const res = await app.inject({
      method: 'POST',
      url: '/api/dialer/drop-voicemail',
      headers: { cookie: authCookie() },
      payload: { callControlId: 'drop-vm-override', recordingId: rec.id },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().recordingId).toBe(rec.id);
    expect(playAudioMock).toHaveBeenCalled();
    const [, audioUrl] = playAudioMock.mock.calls[0];
    expect(audioUrl).toContain('/files/override.mp3');

    removeInFlightCall('drop-vm-override');
  });
});
