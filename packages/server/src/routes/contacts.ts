import type { FastifyPluginAsync } from 'fastify';
import { db } from '../db/index.js';
import { contacts } from '../db/schema.js';
import { eq } from 'drizzle-orm';

export const contactRoutes: FastifyPluginAsync = async (fastify) => {
  // List contacts (optionally filtered by campaign)
  fastify.get<{ Querystring: { campaignId?: string } }>('/', async (request) => {
    const campaignId = request.query.campaignId ? Number(request.query.campaignId) : undefined;
    if (campaignId) {
      return db.select().from(contacts).where(eq(contacts.campaignId, campaignId));
    }
    return db.select().from(contacts);
  });

  // Get single contact
  fastify.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const id = Number(request.params.id);
    const contact = await db.select().from(contacts).where(eq(contacts.id, id)).get();
    if (!contact) return reply.code(404).send({ error: 'Contact not found' });
    return contact;
  });

  // Create single contact
  fastify.post<{
    Body: {
      campaignId: number;
      name?: string;
      phone: string;
      company?: string;
      email?: string;
      notes?: string;
    };
  }>('/', async (request, reply) => {
    const result = await db.insert(contacts).values(request.body).returning();
    return reply.code(201).send(result[0]);
  });

  // Bulk import contacts (from CSV parsed on frontend)
  fastify.post<{
    Body: {
      campaignId: number;
      contacts: Array<{
        name?: string;
        phone: string;
        company?: string;
        email?: string;
        notes?: string;
      }>;
    };
  }>('/bulk', async (request, reply) => {
    const { campaignId, contacts: contactList } = request.body;
    const values = contactList.map((c) => ({ ...c, campaignId }));
    if (values.length === 0) return reply.code(400).send({ error: 'No contacts provided' });
    const result = await db.insert(contacts).values(values).returning();
    return reply.code(201).send({ imported: result.length });
  });

  // Update contact
  fastify.put<{
    Params: { id: string };
    Body: Partial<{ name: string; phone: string; company: string; email: string; notes: string; status: string }>;
  }>('/:id', async (request, reply) => {
    const id = Number(request.params.id);
    const result = await db
      .update(contacts)
      .set(request.body)
      .where(eq(contacts.id, id))
      .returning();
    if (result.length === 0) return reply.code(404).send({ error: 'Contact not found' });
    return result[0];
  });

  // Delete contact
  fastify.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const id = Number(request.params.id);
    const result = await db.delete(contacts).where(eq(contacts.id, id)).returning();
    if (result.length === 0) return reply.code(404).send({ error: 'Contact not found' });
    return { success: true };
  });
};
