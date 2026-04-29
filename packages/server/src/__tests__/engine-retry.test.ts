import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { buildApp } from '../app.js';
import { db } from '../db/index.js';
import { campaigns, contacts } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import {
  resetTeamSession,
  getTeamSession,
  addOperator,
  setOperatorWebrtc,
  setOperatorAvailability,
} from '../dialer/team-state.js';
import type { FastifyInstance } from 'fastify';

let dialCounter = 0;
const dialedToNumbers: string[] = [];
const dialMock = vi.fn(async ({ to }: { to: string }) => {
  dialCounter++;
  dialedToNumbers.push(to);
  return {
    callControlId: `mock-call-${dialCounter}`,
    callLegId: `mock-leg-${dialCounter}`,
  };
});

vi.mock('../providers/index.js', async () => {
  const actual = await vi.importActual<typeof import('../providers/index.js')>(
    '../providers/index.js',
  );
  return {
    ...actual,
    getProvider: vi.fn(async () => ({
      dial: dialMock,
      hangup: vi.fn(),
      bridge: vi.fn(),
      playAudio: vi.fn(),
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
  dialedToNumbers.length = 0;
  dialMock.mockClear();
});

afterEach(() => {
  resetTeamSession();
});

async function seedCampaign(opts: {
  maxAttempts: number;
  retryAfterMinutes?: number;
  prioritizeVoicemails?: boolean;
}) {
  const [campaign] = await db
    .insert(campaigns)
    .values({
      name: `Retry Test ${Date.now()}-${Math.random()}`,
      callerId: '+15555550000',
      dropIfNoOperator: false,
      maxAttempts: opts.maxAttempts,
      retryAfterMinutes: opts.retryAfterMinutes ?? 60,
      prioritizeVoicemails: opts.prioritizeVoicemails ?? true,
    })
    .returning();
  return campaign;
}

async function seedContact(
  campaignId: number,
  init: {
    phone: string;
    status?: 'pending' | 'voicemail';
    callCount?: number;
    lastCalledAt?: string | null;
  },
) {
  const [c] = await db
    .insert(contacts)
    .values({
      campaignId,
      phone: init.phone,
      status: init.status ?? 'pending',
      callCount: init.callCount ?? 0,
      lastCalledAt: init.lastCalledAt ?? null,
    })
    .returning();
  return c;
}

describe('dialer retry: contact selection', () => {
  it('skips voicemail-status contacts when maxAttempts=1', async () => {
    const campaign = await seedCampaign({ maxAttempts: 1 });
    await seedContact(campaign.id, { phone: '+15550000001', status: 'voicemail', callCount: 1 });
    await seedContact(campaign.id, { phone: '+15550000002', status: 'pending' });

    addOperator(1, 'op');
    setOperatorWebrtc(1, 'leg-1');
    setOperatorAvailability(1, 'available');

    await dialerEngine.startSession(campaign.id);
    // Only the pending contact is eligible
    expect(dialedToNumbers).toEqual(['+15550000002']);
    await dialerEngine.stopSession();
  });

  it('includes voicemail-status contacts when maxAttempts > 1 AND retry window elapsed', async () => {
    const campaign = await seedCampaign({ maxAttempts: 3, retryAfterMinutes: 60 });
    const oldEnough = new Date(Date.now() - 90 * 60_000).toISOString(); // 90 min ago
    await seedContact(campaign.id, {
      phone: '+15550000010',
      status: 'voicemail',
      callCount: 1,
      lastCalledAt: oldEnough,
    });

    addOperator(1, 'op');
    setOperatorWebrtc(1, 'leg-1');
    setOperatorAvailability(1, 'available');

    await dialerEngine.startSession(campaign.id);
    expect(dialedToNumbers).toContain('+15550000010');
    await dialerEngine.stopSession();
  });

  it('excludes voicemail-status contacts whose retry window has not elapsed', async () => {
    const campaign = await seedCampaign({ maxAttempts: 3, retryAfterMinutes: 60 });
    const tooRecent = new Date(Date.now() - 10 * 60_000).toISOString(); // 10 min ago
    await seedContact(campaign.id, {
      phone: '+15550000020',
      status: 'voicemail',
      callCount: 1,
      lastCalledAt: tooRecent,
    });
    await seedContact(campaign.id, { phone: '+15550000021', status: 'pending' });

    addOperator(1, 'op');
    setOperatorWebrtc(1, 'leg-1');
    setOperatorAvailability(1, 'available');

    await dialerEngine.startSession(campaign.id);
    expect(dialedToNumbers).toContain('+15550000021');
    expect(dialedToNumbers).not.toContain('+15550000020');
    await dialerEngine.stopSession();
  });

  it('respects the maxAttempts cap (callCount >= maxAttempts is excluded)', async () => {
    const campaign = await seedCampaign({ maxAttempts: 2, retryAfterMinutes: 60 });
    const oldEnough = new Date(Date.now() - 90 * 60_000).toISOString();
    // Already attempted twice — should not be re-dialed
    await seedContact(campaign.id, {
      phone: '+15550000030',
      status: 'voicemail',
      callCount: 2,
      lastCalledAt: oldEnough,
    });
    await seedContact(campaign.id, { phone: '+15550000031', status: 'pending' });

    addOperator(1, 'op');
    setOperatorWebrtc(1, 'leg-1');
    setOperatorAvailability(1, 'available');

    await dialerEngine.startSession(campaign.id);
    expect(dialedToNumbers).toContain('+15550000031');
    expect(dialedToNumbers).not.toContain('+15550000030');
    await dialerEngine.stopSession();
  });

  it('dials voicemail-receivers BEFORE pending when prioritizeVoicemails=true', async () => {
    const campaign = await seedCampaign({
      maxAttempts: 3,
      retryAfterMinutes: 60,
      prioritizeVoicemails: true,
    });
    const oldEnough = new Date(Date.now() - 90 * 60_000).toISOString();
    await seedContact(campaign.id, { phone: '+15550000040', status: 'pending' });
    await seedContact(campaign.id, {
      phone: '+15550000041',
      status: 'voicemail',
      callCount: 1,
      lastCalledAt: oldEnough,
    });

    // Only one operator → only ~3 parallel lines, but we want to verify ORDER.
    // Use no operators so dialNextBatch dials minimum 1 line per pass and we
    // can read the order off dialedToNumbers.
    addOperator(1, 'op');
    setOperatorWebrtc(1, 'leg-1');
    setOperatorAvailability(1, 'available');

    await dialerEngine.startSession(campaign.id);
    // First dialed should be the voicemail-receiver
    expect(dialedToNumbers[0]).toBe('+15550000041');
    await dialerEngine.stopSession();
  });

  it('dials in id order when prioritizeVoicemails=false', async () => {
    const campaign = await seedCampaign({
      maxAttempts: 3,
      retryAfterMinutes: 60,
      prioritizeVoicemails: false,
    });
    const oldEnough = new Date(Date.now() - 90 * 60_000).toISOString();
    const a = await seedContact(campaign.id, { phone: '+15550000050', status: 'pending' });
    await seedContact(campaign.id, {
      phone: '+15550000051',
      status: 'voicemail',
      callCount: 1,
      lastCalledAt: oldEnough,
    });

    addOperator(1, 'op');
    setOperatorWebrtc(1, 'leg-1');
    setOperatorAvailability(1, 'available');

    await dialerEngine.startSession(campaign.id);
    // The pending contact (lower id) should be dialed first when priority is off
    expect(dialedToNumbers[0]).toBe(a.phone);
    await dialerEngine.stopSession();
  });
});

describe('dialer retry: campaign defaults', () => {
  it('new campaigns default to maxAttempts=1 (no retry behavior change)', async () => {
    const [c] = await db
      .insert(campaigns)
      .values({ name: 'Default Test', callerId: '+15555550000' })
      .returning();
    const refreshed = await db.select().from(campaigns).where(eq(campaigns.id, c.id)).get();
    expect(refreshed?.maxAttempts).toBe(1);
    expect(refreshed?.retryAfterMinutes).toBe(60);
    expect(refreshed?.prioritizeVoicemails).toBe(true);
  });
});
