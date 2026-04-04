import type { FastifyPluginAsync } from 'fastify';
import { db } from '../db/index.js';
import { transcripts, callLogs, contacts } from '../db/schema.js';
import { eq } from 'drizzle-orm';

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
};
