import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import { campaignRoutes } from './routes/campaigns.js';
import { contactRoutes } from './routes/contacts.js';
import { recordingRoutes } from './routes/recordings.js';
import { settingRoutes } from './routes/settings.js';
import { dialerRoutes } from './routes/dialer.js';
import { authRoutes, getSessionData } from './routes/auth.js';
import { telnyxWebhookRoutes } from './webhooks/telnyx.js';
import { analyticsRoutes } from './routes/analytics.js';
import { transcriptRoutes } from './routes/transcripts.js';
import { userRoutes } from './routes/users.js';
import { recordingProfileRoutes } from './routes/recording-profiles.js';
import { integrationRoutes } from './routes/integrations.js';
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

  // CORS — defense-in-depth on top of SameSite=Strict session cookies.
  //
  // The cookie's SameSite=Strict attribute is the actual CSRF protection
  // (browser never sends the session cookie on cross-site requests). CORS
  // here is for users who DO have a fixed front-end origin and want extra
  // hardening — set ALLOWED_ORIGINS=https://app.example.com,https://x.com
  // to restrict. Cloudflare Tunnel users with rotating subdomains can leave
  // it unset; the SameSite cookie still protects them.
  const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',').map((o) => o.trim()).filter(Boolean);
  await app.register(cors, {
    origin: allowedOrigins && allowedOrigins.length > 0 ? allowedOrigins : true,
    credentials: true,
  });
  await app.register(cookie);
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

  // Auth routes (unprotected)
  await app.register(authRoutes, { prefix: '/api/auth' });

  // Decorate request with user context
  app.decorateRequest('userId', 0);
  app.decorateRequest('userRole', 'operator');

  // Auth middleware — protect /api/* (except /api/auth/*) and /events
  app.addHook('onRequest', async (request, reply) => {
    const url = request.url;

    // Skip auth for: auth routes, webhooks, health check, static files
    if (
      url.startsWith('/api/auth') ||
      url.startsWith('/webhooks/') ||
      url === '/api/health' ||
      url.startsWith('/uploads/') ||
      (!url.startsWith('/api/') && !url.startsWith('/events'))
    ) {
      return;
    }

    const session = getSessionData(request);
    if (!session) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }
    (request as any).userId = session.userId;
    (request as any).userRole = session.role;
  });

  // REST routes
  await app.register(campaignRoutes, { prefix: '/api/campaigns' });
  await app.register(contactRoutes, { prefix: '/api/contacts' });
  await app.register(recordingRoutes, { prefix: '/api/recordings' });
  await app.register(settingRoutes, { prefix: '/api/settings' });
  await app.register(dialerRoutes, { prefix: '/api/dialer' });
  await app.register(analyticsRoutes, { prefix: '/api/analytics' });
  await app.register(transcriptRoutes, { prefix: '/api/transcripts' });
  await app.register(userRoutes, { prefix: '/api/users' });
  await app.register(recordingProfileRoutes, { prefix: '/api/recording-profiles' });
  await app.register(integrationRoutes, { prefix: '/api/integrations' });

  // Webhooks (no auth — verified by signature)
  await app.register(telnyxWebhookRoutes, { prefix: '/webhooks' });

  // SSE (Server-Sent Events) — protected by auth middleware above
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
