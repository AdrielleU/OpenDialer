import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '../db/index.js';
import { transcripts, callLogs, campaigns, contacts } from '../db/schema.js';
import { eq } from 'drizzle-orm';

let campaignId: number;
let contactId: number;
let callLogId: number;

beforeAll(async () => {
  // Create test data chain: campaign → contact → call log → transcripts
  const [campaign] = await db
    .insert(campaigns)
    .values({ name: 'Cleanup Test', callerId: '+15550000000' })
    .returning();
  campaignId = campaign.id;

  const [contact] = await db
    .insert(contacts)
    .values({ campaignId, phone: '+15551111111', name: 'Cleanup Contact' })
    .returning();
  contactId = contact.id;

  const [callLog] = await db
    .insert(callLogs)
    .values({ campaignId, contactId, startedAt: new Date().toISOString() })
    .returning();
  callLogId = callLog.id;
});

afterAll(async () => {
  // Clean up test data
  await db.delete(callLogs).where(eq(callLogs.id, callLogId));
  await db.delete(contacts).where(eq(contacts.id, contactId));
  await db.delete(campaigns).where(eq(campaigns.id, campaignId));
});

describe('Transcript Cleanup', () => {
  it('keeps recent transcripts', async () => {
    // Insert a recent transcript
    const [t] = await db
      .insert(transcripts)
      .values({
        callLogId,
        speaker: 'inbound',
        content: 'Recent transcript',
        createdAt: new Date().toISOString(),
      })
      .returning();

    // Run cleanup with 30-day retention
    const { cleanupOldTranscripts } = await import('../db/cleanup.js');

    // Override config temporarily — we can't easily change env, but the function
    // uses config.TRANSCRIPT_RETENTION_DAYS which defaults to 30
    await cleanupOldTranscripts();

    // Recent transcript should still exist
    const remaining = await db
      .select()
      .from(transcripts)
      .where(eq(transcripts.id, t.id))
      .get();
    expect(remaining).toBeDefined();
    expect(remaining!.content).toBe('Recent transcript');

    // Clean up
    await db.delete(transcripts).where(eq(transcripts.id, t.id));
  });

  it('stores transcripts with correct fields', async () => {
    const [t] = await db
      .insert(transcripts)
      .values({
        callLogId,
        speaker: 'outbound',
        content: 'Test outbound transcript',
        confidence: 0.95,
      })
      .returning();

    expect(t.speaker).toBe('outbound');
    expect(t.content).toBe('Test outbound transcript');
    expect(t.confidence).toBe(0.95);
    expect(t.createdAt).toBeDefined();

    await db.delete(transcripts).where(eq(transcripts.id, t.id));
  });

  it('cascade deletes transcripts when call log is deleted', async () => {
    // Create a separate call log + transcript for this test
    const [tempLog] = await db
      .insert(callLogs)
      .values({ campaignId, contactId, startedAt: new Date().toISOString() })
      .returning();

    await db.insert(transcripts).values({
      callLogId: tempLog.id,
      speaker: 'inbound',
      content: 'Will be cascade deleted',
    });

    // Delete the call log — transcript should cascade
    await db.delete(callLogs).where(eq(callLogs.id, tempLog.id));

    const orphaned = await db
      .select()
      .from(transcripts)
      .where(eq(transcripts.callLogId, tempLog.id));
    expect(orphaned.length).toBe(0);
  });
});
