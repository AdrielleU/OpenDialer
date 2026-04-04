import type { FastifyPluginAsync } from 'fastify';
import { testHubspotConnection, importHubspotContacts, logCallToHubspot } from '../integrations/hubspot.js';
import { testApolloConnection, importApolloContacts } from '../integrations/apollo.js';
import { fireWebhook } from '../integrations/webhooks.js';
import { db } from '../db/index.js';
import { settings } from '../db/schema.js';
import { eq } from 'drizzle-orm';

export const integrationRoutes: FastifyPluginAsync = async (fastify) => {
  // --- HubSpot ---

  fastify.get('/hubspot/test', async () => {
    return testHubspotConnection();
  });

  fastify.post<{ Body: { campaignId: number; limit?: number } }>(
    '/hubspot/import',
    async (request, reply) => {
      const { campaignId, limit } = request.body as { campaignId: number; limit?: number };
      if (!campaignId) return reply.code(400).send({ error: 'campaignId required.' });

      try {
        const result = await importHubspotContacts(campaignId, { limit });
        return result;
      } catch (err: any) {
        return reply.code(400).send({ error: err.message });
      }
    },
  );

  fastify.post<{ Body: { callLogId: number } }>('/hubspot/log-call', async (request, reply) => {
    const { callLogId } = request.body as { callLogId: number };
    if (!callLogId) return reply.code(400).send({ error: 'callLogId required.' });

    try {
      await logCallToHubspot(callLogId);
      return { message: 'Call logged to HubSpot.' };
    } catch (err: any) {
      return reply.code(400).send({ error: err.message });
    }
  });

  // --- Apollo ---

  fastify.get('/apollo/test', async () => {
    return testApolloConnection();
  });

  fastify.post<{ Body: { campaignId: number; query?: string; limit?: number } }>(
    '/apollo/import',
    async (request, reply) => {
      const { campaignId, query, limit } = request.body as {
        campaignId: number;
        query?: string;
        limit?: number;
      };
      if (!campaignId) return reply.code(400).send({ error: 'campaignId required.' });

      try {
        const result = await importApolloContacts(campaignId, { query, limit });
        return result;
      } catch (err: any) {
        return reply.code(400).send({ error: err.message });
      }
    },
  );

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
