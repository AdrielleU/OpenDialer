import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { db } from '../db/index.js';
import { campaigns, contacts } from '../db/schema.js';
import { eq, sql } from 'drizzle-orm';
import { validate, phoneE164 } from '../lib/validate.js';

const TranscriptionMode = z.enum(['off', 'realtime', 'post_call']);
const IvrGreetingType = z.enum(['none', 'recording', 'tts']);
const CampaignStatus = z.enum(['draft', 'active', 'paused', 'completed']);

const CreateCampaignSchema = z.object({
  name: z.string().min(1).max(200),
  callerId: z.string().regex(phoneE164, 'callerId must be E.164 (e.g. +15551234567)'),
  openerRecordingId: z.number().int().positive().nullable().optional(),
  voicemailRecordingId: z.number().int().positive().nullable().optional(),
  dropIfNoOperator: z.boolean().optional(),
  maxAttempts: z.number().int().min(1).max(10).optional(),
  retryAfterMinutes: z.number().int().min(0).max(10080).optional(),
  prioritizeVoicemails: z.boolean().optional(),
  ivrSequence: z.string().max(100).nullable().optional(),
  ivrGreetingType: IvrGreetingType.optional(),
  ivrGreetingTemplate: z.string().max(2000).nullable().optional(),
  enableTranscription: z.boolean().optional(),
  transcriptionMode: TranscriptionMode.optional(),
});

const UpdateCampaignSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    callerId: z.string().regex(phoneE164, 'callerId must be E.164').optional(),
    openerRecordingId: z.number().int().positive().nullable().optional(),
    voicemailRecordingId: z.number().int().positive().nullable().optional(),
    status: CampaignStatus.optional(),
    dropIfNoOperator: z.boolean().optional(),
    maxAttempts: z.number().int().min(1).max(10).optional(),
    retryAfterMinutes: z.number().int().min(0).max(10080).optional(),
    prioritizeVoicemails: z.boolean().optional(),
    ivrSequence: z.string().max(100).nullable().optional(),
    ivrGreetingType: IvrGreetingType.optional(),
    ivrGreetingTemplate: z.string().max(2000).nullable().optional(),
    enableTranscription: z.boolean().optional(),
    transcriptionMode: TranscriptionMode.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update.' });

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
        enableTranscription: campaigns.enableTranscription,
        transcriptionMode: campaigns.transcriptionMode,
        dropIfNoOperator: campaigns.dropIfNoOperator,
        maxAttempts: campaigns.maxAttempts,
        retryAfterMinutes: campaigns.retryAfterMinutes,
        prioritizeVoicemails: campaigns.prioritizeVoicemails,
        ivrSequence: campaigns.ivrSequence,
        ivrGreetingType: campaigns.ivrGreetingType,
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
  fastify.post('/', async (request, reply) => {
    const body = validate(CreateCampaignSchema, request.body, reply);
    if (!body) return;
    const result = await db
      .insert(campaigns)
      .values({
        name: body.name,
        callerId: body.callerId,
        openerRecordingId: body.openerRecordingId ?? null,
        voicemailRecordingId: body.voicemailRecordingId ?? null,
        dropIfNoOperator: body.dropIfNoOperator ?? true,
        maxAttempts: body.maxAttempts ?? 1,
        retryAfterMinutes: body.retryAfterMinutes ?? 60,
        prioritizeVoicemails: body.prioritizeVoicemails ?? true,
        ivrSequence: body.ivrSequence ?? null,
        ivrGreetingType: body.ivrGreetingType ?? 'none',
        ivrGreetingTemplate: body.ivrGreetingTemplate ?? null,
        enableTranscription: body.enableTranscription ?? false,
        transcriptionMode: body.transcriptionMode ?? 'off',
      })
      .returning();
    return reply.code(201).send(result[0]);
  });

  // Update campaign
  fastify.put<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const id = Number(request.params.id);
    const body = validate(UpdateCampaignSchema, request.body, reply);
    if (!body) return;
    const result = await db
      .update(campaigns)
      .set({ ...body, updatedAt: new Date().toISOString() })
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
