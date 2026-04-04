import type { FastifyPluginAsync } from 'fastify';
import { db } from '../db/index.js';
import { recordingProfiles, recordings } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';

export const recordingProfileRoutes: FastifyPluginAsync = async (fastify) => {
  // List current user's profiles
  fastify.get('/', async (request) => {
    const userId = (request as any).userId as number;
    const profiles = await db
      .select({
        id: recordingProfiles.id,
        name: recordingProfiles.name,
        openerRecordingId: recordingProfiles.openerRecordingId,
        voicemailRecordingId: recordingProfiles.voicemailRecordingId,
        isDefault: recordingProfiles.isDefault,
        createdAt: recordingProfiles.createdAt,
      })
      .from(recordingProfiles)
      .where(eq(recordingProfiles.userId, userId));

    return profiles;
  });

  // Create a profile
  fastify.post<{
    Body: {
      name: string;
      openerRecordingId?: number;
      voicemailRecordingId?: number;
      isDefault?: boolean;
    };
  }>('/', async (request, reply) => {
    const userId = (request as any).userId as number;
    const body = request.body as {
      name: string;
      openerRecordingId?: number;
      voicemailRecordingId?: number;
      isDefault?: boolean;
    };

    if (!body.name) {
      return reply.code(400).send({ error: 'Profile name is required.' });
    }

    // If this is the default, unset other defaults
    if (body.isDefault) {
      await db
        .update(recordingProfiles)
        .set({ isDefault: false })
        .where(eq(recordingProfiles.userId, userId));
    }

    const [profile] = await db
      .insert(recordingProfiles)
      .values({
        userId,
        name: body.name,
        openerRecordingId: body.openerRecordingId || null,
        voicemailRecordingId: body.voicemailRecordingId || null,
        isDefault: body.isDefault ?? false,
      })
      .returning();

    return reply.code(201).send(profile);
  });

  // Update a profile
  fastify.put<{
    Params: { id: string };
    Body: {
      name?: string;
      openerRecordingId?: number | null;
      voicemailRecordingId?: number | null;
    };
  }>('/:id', async (request, reply) => {
    const userId = (request as any).userId as number;
    const id = Number(request.params.id);
    const body = request.body as Record<string, unknown>;

    const profile = await db
      .select()
      .from(recordingProfiles)
      .where(and(eq(recordingProfiles.id, id), eq(recordingProfiles.userId, userId)))
      .get();

    if (!profile) return reply.code(404).send({ error: 'Profile not found.' });

    const updates: Record<string, unknown> = {};
    if (body.name !== undefined) updates.name = body.name;
    if (body.openerRecordingId !== undefined) updates.openerRecordingId = body.openerRecordingId;
    if (body.voicemailRecordingId !== undefined)
      updates.voicemailRecordingId = body.voicemailRecordingId;

    if (Object.keys(updates).length === 0) {
      return reply.code(400).send({ error: 'Nothing to update.' });
    }

    await db
      .update(recordingProfiles)
      .set(updates)
      .where(eq(recordingProfiles.id, id));

    return db.select().from(recordingProfiles).where(eq(recordingProfiles.id, id)).get();
  });

  // Set as active/default profile
  fastify.put<{ Params: { id: string } }>('/:id/activate', async (request, reply) => {
    const userId = (request as any).userId as number;
    const id = Number(request.params.id);

    const profile = await db
      .select()
      .from(recordingProfiles)
      .where(and(eq(recordingProfiles.id, id), eq(recordingProfiles.userId, userId)))
      .get();

    if (!profile) return reply.code(404).send({ error: 'Profile not found.' });

    // Unset all other defaults for this user
    await db
      .update(recordingProfiles)
      .set({ isDefault: false })
      .where(eq(recordingProfiles.userId, userId));

    // Set this one as default
    await db
      .update(recordingProfiles)
      .set({ isDefault: true })
      .where(eq(recordingProfiles.id, id));

    return { message: 'Profile activated.', id };
  });

  // Delete a profile
  fastify.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const userId = (request as any).userId as number;
    const id = Number(request.params.id);

    const profile = await db
      .select()
      .from(recordingProfiles)
      .where(and(eq(recordingProfiles.id, id), eq(recordingProfiles.userId, userId)))
      .get();

    if (!profile) return reply.code(404).send({ error: 'Profile not found.' });

    await db.delete(recordingProfiles).where(eq(recordingProfiles.id, id));
    return reply.code(204).send();
  });
};
