import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { db } from '../db/index.js';
import { transcripts, callLogs, contacts } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { transcribeCallRecording } from '../transcription/post-call.js';
import { validate } from '../lib/validate.js';

const RetranscribeSchema = z.object({
  callLogId: z.number().int().positive(),
  force: z.boolean().optional(),
});

export const transcriptRoutes: FastifyPluginAsync = async (fastify) => {
  // Get transcripts for a specific call log
  fastify.get<{ Querystring: { callLogId?: string } }>('/', async (request) => {
    const { callLogId } = request.query;
    if (callLogId) {
      return db
        .select()
        .from(transcripts)
        .where(eq(transcripts.callLogId, Number(callLogId)));
    }
    return db.select().from(transcripts);
  });

  // Get all transcripts for a campaign (joined with call log + contact info)
  fastify.get<{ Params: { campaignId: string } }>(
    '/campaign/:campaignId',
    async (request) => {
      const campaignId = Number(request.params.campaignId);

      const rows = await db
        .select({
          id: transcripts.id,
          callLogId: transcripts.callLogId,
          speaker: transcripts.speaker,
          content: transcripts.content,
          confidence: transcripts.confidence,
          createdAt: transcripts.createdAt,
          contactId: callLogs.contactId,
          contactName: contacts.name,
          contactPhone: contacts.phone,
          disposition: callLogs.disposition,
          callStartedAt: callLogs.startedAt,
        })
        .from(transcripts)
        .innerJoin(callLogs, eq(transcripts.callLogId, callLogs.id))
        .innerJoin(contacts, eq(callLogs.contactId, contacts.id))
        .where(eq(callLogs.campaignId, campaignId));

      // Group transcripts by call log
      const grouped = new Map<
        number,
        {
          callLogId: number;
          contactId: number;
          contactName: string | null;
          contactPhone: string;
          disposition: string | null;
          callStartedAt: string | null;
          lines: Array<{
            id: number;
            speaker: string;
            content: string;
            confidence: number | null;
            createdAt: string;
          }>;
        }
      >();

      for (const row of rows) {
        if (!grouped.has(row.callLogId)) {
          grouped.set(row.callLogId, {
            callLogId: row.callLogId,
            contactId: row.contactId,
            contactName: row.contactName,
            contactPhone: row.contactPhone,
            disposition: row.disposition,
            callStartedAt: row.callStartedAt,
            lines: [],
          });
        }
        grouped.get(row.callLogId)!.lines.push({
          id: row.id,
          speaker: row.speaker,
          content: row.content,
          confidence: row.confidence,
          createdAt: row.createdAt,
        });
      }

      return Array.from(grouped.values());
    },
  );

  // Delete a transcript
  fastify.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const id = Number(request.params.id);
    await db.delete(transcripts).where(eq(transcripts.id, id));
    return reply.code(204).send();
  });

  // Retroactively transcribe a call's recording.
  //
  // Works regardless of the campaign's transcriptionMode — the only
  // requirement is that the call has a recordingUrl. Useful for:
  //   - calls that were never transcribed (campaign was 'off' at the time)
  //   - calls where transcription failed mid-job (server crash)
  //   - re-transcribing with a different STT model after upgrading
  //
  // Rate-limited to prevent burning through STT API quota (cloud Whisper
  // bills per minute and a script could spam this endpoint indefinitely).
  fastify.post(
    '/retranscribe',
    {
      config: {
        rateLimit: { max: 30, timeWindow: '1 minute' },
      },
    },
    async (request, reply) => {
    const body = validate(RetranscribeSchema, request.body, reply);
    if (!body) return;
    const { callLogId, force } = body;

    const callLog = await db
      .select()
      .from(callLogs)
      .where(eq(callLogs.id, callLogId))
      .get();
    if (!callLog) return reply.code(404).send({ error: 'Call log not found.' });
    if (!callLog.recordingUrl) {
      return reply.code(400).send({ error: 'No recording exists for this call.' });
    }

    const existing = await db
      .select()
      .from(transcripts)
      .where(eq(transcripts.callLogId, callLogId));
    if (existing.length > 0 && !force) {
      return reply.code(409).send({
        error: 'Transcript already exists. Pass force=true to replace.',
        existingCount: existing.length,
      });
    }

    if (existing.length > 0 && force) {
      await db.delete(transcripts).where(eq(transcripts.callLogId, callLogId));
    }

    // Run the transcription synchronously this time so the caller knows
    // whether it succeeded — this endpoint is interactive (UI button), not
    // fire-and-forget like the webhook path.
    try {
      await transcribeCallRecording(callLogId, callLog.recordingUrl);
    } catch (err: any) {
      return reply.code(500).send({ error: err?.message ?? 'Transcription failed' });
    }

    // Re-fetch to confirm we got something
    const fresh = await db
      .select()
      .from(transcripts)
      .where(eq(transcripts.callLogId, callLogId));
    if (fresh.length === 0) {
      return reply.code(500).send({
        error: 'Transcription completed without producing any text. Check server logs.',
      });
    }

      return { status: 'transcribed', lines: fresh.length };
    },
  );
};
