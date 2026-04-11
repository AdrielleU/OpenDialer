import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '../db/index.js';
import { campaigns } from '../db/schema.js';
import { eq, sql } from 'drizzle-orm';
import { buildApp } from '../app.js';
import type { FastifyInstance } from 'fastify';

let app: FastifyInstance;
let testCampaignId: number;

beforeAll(async () => {
  app = await buildApp();
  await app.ready();
});

afterAll(async () => {
  // Clean up the test row
  if (testCampaignId) {
    await db.delete(campaigns).where(eq(campaigns.id, testCampaignId));
  }
  await app.close();
});

// The 0002_acoustic_zuras.sql migration includes a backfill UPDATE that
// converts campaigns with the legacy `enable_transcription = 1` boolean to
// the new `transcription_mode = 'realtime'` enum. We can't re-run the
// migration in the test environment (setup.ts ran it once at import time),
// but we CAN simulate the legacy state and run the backfill SQL manually
// to verify the SQL is correct.
describe('0002 migration — transcriptionMode backfill SQL', () => {
  it('UPDATE sets transcription_mode=realtime where enable_transcription=1', async () => {
    // Insert a campaign with the legacy boolean true and the default mode 'off',
    // simulating a row that was created by the *previous* schema version.
    const [seeded] = await db
      .insert(campaigns)
      .values({
        name: 'Legacy Realtime Campaign',
        callerId: '+15551110000',
        enableTranscription: true,
        transcriptionMode: 'off', // simulating the pre-backfill state
      })
      .returning();
    testCampaignId = seeded.id;

    // Sanity check the seed
    expect(seeded.enableTranscription).toBe(true);
    expect(seeded.transcriptionMode).toBe('off');

    // Run the exact backfill SQL from drizzle/0002_acoustic_zuras.sql
    await db.run(
      sql`UPDATE campaigns SET transcription_mode = 'realtime' WHERE enable_transcription = 1`,
    );

    // Verify our row was updated
    const after = await db.select().from(campaigns).where(eq(campaigns.id, seeded.id)).get();
    expect(after?.transcriptionMode).toBe('realtime');
  });

  it('does NOT touch rows where enable_transcription=0', async () => {
    const [unaffected] = await db
      .insert(campaigns)
      .values({
        name: 'Legacy Off Campaign',
        callerId: '+15551110001',
        enableTranscription: false,
        transcriptionMode: 'off',
      })
      .returning();

    // Run the same backfill
    await db.run(
      sql`UPDATE campaigns SET transcription_mode = 'realtime' WHERE enable_transcription = 1`,
    );

    const after = await db.select().from(campaigns).where(eq(campaigns.id, unaffected.id)).get();
    expect(after?.transcriptionMode).toBe('off');

    // Clean up this extra row
    await db.delete(campaigns).where(eq(campaigns.id, unaffected.id));
  });
});
