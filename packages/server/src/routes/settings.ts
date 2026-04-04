import type { FastifyPluginAsync } from 'fastify';
import { db } from '../db/index.js';
import { settings } from '../db/schema.js';
import { eq } from 'drizzle-orm';

export const settingRoutes: FastifyPluginAsync = async (fastify) => {
  // Get all settings as key-value object
  fastify.get('/', async () => {
    const rows = await db.select().from(settings);
    const obj: Record<string, string> = {};
    for (const row of rows) {
      obj[row.key] = row.value;
    }
    return obj;
  });

  // Upsert settings
  fastify.put<{ Body: Record<string, string> }>('/', async (request) => {
    const entries = Object.entries(request.body);
    for (const [key, value] of entries) {
      await db
        .insert(settings)
        .values({ key, value })
        .onConflictDoUpdate({ target: settings.key, set: { value } });
    }
    return { success: true };
  });

  // Health check — verifies provider connectivity
  fastify.get('/health', async (_request, reply) => {
    try {
      const apiKeyRow = await db
        .select()
        .from(settings)
        .where(eq(settings.key, 'TELNYX_API_KEY'))
        .get();
      if (!apiKeyRow || !apiKeyRow.value) {
        return reply.code(200).send({ status: 'unconfigured', message: 'No API key set' });
      }
      return { status: 'configured', message: 'API key is set' };
    } catch {
      return reply.code(500).send({ status: 'error', message: 'Database error' });
    }
  });
};
