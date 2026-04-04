import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import { config } from './config.js';
import { campaignRoutes } from './routes/campaigns.js';
import { contactRoutes } from './routes/contacts.js';
import { recordingRoutes } from './routes/recordings.js';
import { settingRoutes } from './routes/settings.js';
import { dialerRoutes } from './routes/dialer.js';
import { telnyxWebhookRoutes } from './webhooks/telnyx.js';
import { analyticsRoutes } from './routes/analytics.js';
import { sseHandler } from './ws/index.js';
import { migrate } from './db/migrate.js';
import { resolve } from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';

const uploadsDir = resolve('uploads');
if (!existsSync(uploadsDir)) {
  mkdirSync(uploadsDir, { recursive: true });
}

const app = Fastify({ logger: true });

async function start() {
  // Run migrations
  await migrate();

  // Plugins
  await app.register(cors, { origin: true });
  await app.register(multipart, { limits: { fileSize: 50 * 1024 * 1024 } }); // 50MB
  await app.register(fastifyStatic, {
    root: uploadsDir,
    prefix: '/uploads/',
    decorateReply: false,
  });
  // REST routes
  await app.register(campaignRoutes, { prefix: '/api/campaigns' });
  await app.register(contactRoutes, { prefix: '/api/contacts' });
  await app.register(recordingRoutes, { prefix: '/api/recordings' });
  await app.register(settingRoutes, { prefix: '/api/settings' });
  await app.register(dialerRoutes, { prefix: '/api/dialer' });
  await app.register(analyticsRoutes, { prefix: '/api/analytics' });

  // Webhooks
  await app.register(telnyxWebhookRoutes, { prefix: '/webhooks' });

  // SSE (Server-Sent Events)
  await app.register(sseHandler, { prefix: '/events' });

  // Health check
  app.get('/api/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

  await app.listen({ port: config.PORT, host: '0.0.0.0' });
}

start().catch((err) => {
  app.log.error(err);
  process.exit(1);
});
