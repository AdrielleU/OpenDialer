import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import { campaignRoutes } from './routes/campaigns.js';
import { contactRoutes } from './routes/contacts.js';
import { recordingRoutes } from './routes/recordings.js';
import { settingRoutes } from './routes/settings.js';
import { dialerRoutes } from './routes/dialer.js';
import { telnyxWebhookRoutes } from './webhooks/telnyx.js';
import { analyticsRoutes } from './routes/analytics.js';
import { sseHandler } from './ws/index.js';
import { resolve, dirname } from 'node:path';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const uploadsDir = resolve('uploads');
if (!existsSync(uploadsDir)) {
  mkdirSync(uploadsDir, { recursive: true });
}

export async function buildApp() {
  const app = Fastify({ logger: false });

  // Plugins
  await app.register(cors, { origin: true });
  await app.register(multipart, { limits: { fileSize: 50 * 1024 * 1024 } }); // 50MB
  await app.register(fastifyStatic, {
    root: uploadsDir,
    prefix: '/uploads/',
    decorateReply: false,
  });

  // Serve frontend static files in production
  const webDistDir = resolve(__dirname, '../../web/dist');
  const serveFrontend = existsSync(webDistDir);
  if (serveFrontend) {
    await app.register(fastifyStatic, {
      root: webDistDir,
      prefix: '/',
      decorateReply: false,
      wildcard: false,
    });
  }

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

  // SPA fallback — serve index.html for unmatched routes (must be last)
  if (serveFrontend) {
    const indexHtml = readFileSync(resolve(webDistDir, 'index.html'), 'utf-8');
    app.setNotFoundHandler((req, reply) => {
      if (req.method === 'GET' && !req.url.startsWith('/api/') && !req.url.startsWith('/webhooks/') && !req.url.startsWith('/events') && !req.url.startsWith('/uploads/')) {
        reply.type('text/html').send(indexHtml);
      } else {
        reply.status(404).send({ error: 'Not found' });
      }
    });
  }

  return app;
}
