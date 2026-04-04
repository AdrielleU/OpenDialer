import type { FastifyPluginAsync } from 'fastify';
import { db } from '../db/index.js';
import { campaigns, contacts } from '../db/schema.js';
import { eq, sql } from 'drizzle-orm';

export const campaignRoutes: FastifyPluginAsync = async (fastify) => {
  // List all campaigns with contact counts
  fastify.get('/', async () => {
    const rows = await db
      .select({
        id: campaigns.id,
        name: campaigns.name,
        callerId: campaigns.callerId,
        openerRecordingId: campaigns.openerRecordingId,
        voicemailRecordingId: campaigns.voicemailRecordingId,
        status: campaigns.status,
        createdAt: campaigns.createdAt,
        updatedAt: campaigns.updatedAt,
        contactCount: sql<number>`(SELECT COUNT(*) FROM contacts WHERE campaign_id = ${campaigns.id})`,
      })
      .from(campaigns)
      .orderBy(campaigns.createdAt);
    return rows;
  });

  // Get single campaign
  fastify.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const id = Number(request.params.id);
    const campaign = await db.select().from(campaigns).where(eq(campaigns.id, id)).get();
    if (!campaign) return reply.code(404).send({ error: 'Campaign not found' });
    return campaign;
  });

  // Create campaign
  fastify.post<{
    Body: { name: string; callerId: string; openerRecordingId?: number; voicemailRecordingId?: number };
  }>('/', async (request, reply) => {
    const { name, callerId, openerRecordingId, voicemailRecordingId } = request.body;
    const result = await db
      .insert(campaigns)
      .values({ name, callerId, openerRecordingId, voicemailRecordingId })
      .returning();
    return reply.code(201).send(result[0]);
  });

  // Update campaign
  fastify.put<{
    Params: { id: string };
    Body: Partial<{
      name: string;
      callerId: string;
      openerRecordingId: number;
      voicemailRecordingId: number;
      status: 'draft' | 'active' | 'paused' | 'completed';
    }>;
  }>('/:id', async (request, reply) => {
    const id = Number(request.params.id);
    const result = await db
      .update(campaigns)
      .set({ ...request.body, updatedAt: new Date().toISOString() })
      .where(eq(campaigns.id, id))
      .returning();
    if (result.length === 0) return reply.code(404).send({ error: 'Campaign not found' });
    return result[0];
  });

  // Delete campaign (cascades to contacts)
  fastify.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const id = Number(request.params.id);
    await db.delete(contacts).where(eq(contacts.campaignId, id));
    const result = await db.delete(campaigns).where(eq(campaigns.id, id)).returning();
    if (result.length === 0) return reply.code(404).send({ error: 'Campaign not found' });
    return { success: true };
  });
};
