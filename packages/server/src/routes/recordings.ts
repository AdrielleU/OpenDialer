import type { FastifyPluginAsync } from 'fastify';
import { db } from '../db/index.js';
import { recordings } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { resolve } from 'node:path';
import { createWriteStream, unlinkSync, existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { pipeline } from 'node:stream/promises';

const uploadsDir = resolve('uploads');

export const recordingRoutes: FastifyPluginAsync = async (fastify) => {
  // List recordings
  fastify.get<{ Querystring: { type?: 'opener' | 'voicemail' | 'failover' } }>(
    '/',
    async (request) => {
      const { type } = request.query;
      if (type) {
        return db.select().from(recordings).where(eq(recordings.type, type));
      }
      return db.select().from(recordings);
    },
  );

  // Upload recording
  fastify.post('/', async (request, reply) => {
    const data = await request.file();
    if (!data) return reply.code(400).send({ error: 'No file uploaded' });

    const name = (data.fields.name as any)?.value || data.filename;
    const type = (data.fields.type as any)?.value;

    if (!type || !['opener', 'voicemail', 'failover'].includes(type)) {
      return reply
        .code(400)
        .send({ error: 'Type must be "opener", "voicemail", or "failover"' });
    }

    const ext = data.filename.split('.').pop() || 'wav';
    const fileName = `${randomUUID()}.${ext}`;
    const filePath = resolve(uploadsDir, fileName);

    await pipeline(data.file, createWriteStream(filePath));

    const result = await db
      .insert(recordings)
      .values({
        name,
        type: type as 'opener' | 'voicemail' | 'failover',
        filePath: `/uploads/${fileName}`,
      })
      .returning();

    return reply.code(201).send(result[0]);
  });

  // Delete recording
  fastify.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const id = Number(request.params.id);
    const recording = await db.select().from(recordings).where(eq(recordings.id, id)).get();
    if (!recording) return reply.code(404).send({ error: 'Recording not found' });

    // Delete file from disk
    const fullPath = resolve(uploadsDir, recording.filePath.replace('/uploads/', ''));
    if (existsSync(fullPath)) {
      unlinkSync(fullPath);
    }

    await db.delete(recordings).where(eq(recordings.id, id));
    return { success: true };
  });
};
