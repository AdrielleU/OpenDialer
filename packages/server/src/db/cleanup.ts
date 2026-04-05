import { db } from './index.js';
import { transcripts } from './schema.js';
import { lt } from 'drizzle-orm';
import { config } from '../config.js';

export async function cleanupOldTranscripts(): Promise<void> {
  const days = config.TRANSCRIPT_RETENTION_DAYS;
  if (days <= 0) return; // 0 = keep forever

  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const result = await db.delete(transcripts).where(lt(transcripts.createdAt, cutoff));
  const deleted = (result as any).changes ?? 0;

  if (deleted > 0) {
    console.log(`[cleanup] Deleted ${deleted} transcript(s) older than ${days} days`);
  }
}
