import type { FastifyPluginAsync } from 'fastify';
import { fireWebhook } from '../integrations/webhooks.js';
import { db } from '../db/index.js';
import { settings } from '../db/schema.js';
import { eq } from 'drizzle-orm';

export const integrationRoutes: FastifyPluginAsync = async (fastify) => {
  // --- Webhook Test ---

  fastify.post('/webhook/test', async (_request, reply) => {
    const row = await db.select().from(settings).where(eq(settings.key, 'WEBHOOK_CRM_URL')).get();
    if (!row?.value) {
      return reply.code(400).send({ error: 'No WEBHOOK_CRM_URL configured.' });
    }

    try {
      await fireWebhook('call.completed', {
        test: true,
        message: 'This is a test webhook from OpenDialer.',
        timestamp: new Date().toISOString(),
      });
      return { ok: true, message: 'Test webhook sent.' };
    } catch (err: any) {
      return reply.code(400).send({ error: err.message });
    }
  });
};
