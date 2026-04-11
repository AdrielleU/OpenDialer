import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { db } from '../db/index.js';
import { contacts } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { validate, phoneE164 } from '../lib/validate.js';

const ContactStatus = z.enum([
  'pending',
  'voicemail',
  'connected',
  'no_answer',
  'callback',
  'not_interested',
  'dnc',
]);

const ContactBaseSchema = z.object({
  name: z.string().max(200).optional(),
  phone: z.string().regex(phoneE164, 'phone must be E.164 (e.g. +15551234567)'),
  company: z.string().max(200).optional(),
  email: z.string().email().max(254).optional(),
  notes: z.string().max(2000).optional(),
  ivrSequence: z.string().max(100).optional(),
});

const CreateContactSchema = ContactBaseSchema.extend({
  campaignId: z.number().int().positive(),
});

const BulkContactsSchema = z.object({
  campaignId: z.number().int().positive(),
  contacts: z.array(ContactBaseSchema),
});

const UpdateContactSchema = z
  .object({
    name: z.string().max(200).optional(),
    phone: z.string().regex(phoneE164, 'phone must be E.164').optional(),
    company: z.string().max(200).optional(),
    email: z.string().email().max(254).optional(),
    notes: z.string().max(2000).optional(),
    ivrSequence: z.string().max(100).optional(),
    status: ContactStatus.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update.' });

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
  fastify.post('/', async (request, reply) => {
    const body = validate(CreateContactSchema, request.body, reply);
    if (!body) return;
    const result = await db.insert(contacts).values(body).returning();
    return reply.code(201).send(result[0]);
  });

  // Bulk import contacts (from CSV parsed on frontend)
  fastify.post('/bulk', async (request, reply) => {
    const body = validate(BulkContactsSchema, request.body, reply);
    if (!body) return;
    const { campaignId, contacts: contactList } = body;
    if (contactList.length === 0) return reply.code(400).send({ error: 'No contacts provided' });
    const values = contactList.map((c) => ({ ...c, campaignId }));
    const result = await db.insert(contacts).values(values).returning();
    return reply.code(201).send({ imported: result.length });
  });

  // Update contact
  fastify.put<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const id = Number(request.params.id);
    const body = validate(UpdateContactSchema, request.body, reply);
    if (!body) return;
    const result = await db
      .update(contacts)
      .set(body)
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
