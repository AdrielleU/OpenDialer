import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../app.js';
import type { FastifyInstance } from 'fastify';

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp();
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

// Endpoints that MUST require auth — sweep for 401 without a session cookie.
// We don't care about the actual handler behavior, just that the auth
// middleware blocks unauthenticated requests *before* the handler runs.
const PROTECTED_ROUTES: Array<{ method: 'GET' | 'POST' | 'PUT' | 'DELETE'; url: string }> = [
  // Dialer
  { method: 'GET', url: '/api/dialer/status' },
  { method: 'POST', url: '/api/dialer/start' },
  { method: 'POST', url: '/api/dialer/stop' },
  { method: 'POST', url: '/api/dialer/pause' },
  { method: 'POST', url: '/api/dialer/resume' },
  { method: 'POST', url: '/api/dialer/join' },
  { method: 'POST', url: '/api/dialer/leave' },
  { method: 'POST', url: '/api/dialer/jump-in' },
  { method: 'POST', url: '/api/dialer/skip' },
  { method: 'POST', url: '/api/dialer/set-available' },
  { method: 'POST', url: '/api/dialer/set-wrap-up' },
  { method: 'POST', url: '/api/dialer/play-recording' },
  { method: 'POST', url: '/api/dialer/speak' },
  { method: 'POST', url: '/api/dialer/stop-and-talk' },
  { method: 'GET', url: '/api/dialer/webrtc-credentials' },
  { method: 'POST', url: '/api/dialer/register-webrtc' },
  // Campaigns
  { method: 'GET', url: '/api/campaigns' },
  { method: 'POST', url: '/api/campaigns' },
  { method: 'GET', url: '/api/campaigns/1' },
  { method: 'PUT', url: '/api/campaigns/1' },
  { method: 'DELETE', url: '/api/campaigns/1' },
  // Contacts
  { method: 'GET', url: '/api/contacts' },
  { method: 'POST', url: '/api/contacts' },
  { method: 'POST', url: '/api/contacts/bulk' },
  { method: 'GET', url: '/api/contacts/1' },
  { method: 'PUT', url: '/api/contacts/1' },
  { method: 'DELETE', url: '/api/contacts/1' },
  // Recordings
  { method: 'GET', url: '/api/recordings' },
  { method: 'POST', url: '/api/recordings' },
  { method: 'DELETE', url: '/api/recordings/1' },
  // Recording profiles
  { method: 'GET', url: '/api/recording-profiles' },
  { method: 'POST', url: '/api/recording-profiles' },
  { method: 'PUT', url: '/api/recording-profiles/1' },
  { method: 'PUT', url: '/api/recording-profiles/1/activate' },
  { method: 'DELETE', url: '/api/recording-profiles/1' },
  // Settings
  { method: 'GET', url: '/api/settings' },
  { method: 'PUT', url: '/api/settings' },
  { method: 'GET', url: '/api/settings/health' },
  // Users
  { method: 'GET', url: '/api/users' },
  { method: 'POST', url: '/api/users' },
  { method: 'GET', url: '/api/users/me' },
  { method: 'PUT', url: '/api/users/1' },
  { method: 'DELETE', url: '/api/users/1' },
  { method: 'POST', url: '/api/users/1/reset-password' },
  // Analytics
  { method: 'GET', url: '/api/analytics/campaigns/1/stats' },
  { method: 'GET', url: '/api/analytics/campaigns/1/export/contacts' },
  { method: 'GET', url: '/api/analytics/campaigns/1/export/calls' },
  { method: 'GET', url: '/api/analytics/export/summary' },
  // Transcripts
  { method: 'GET', url: '/api/transcripts' },
  { method: 'GET', url: '/api/transcripts/campaign/1' },
  { method: 'DELETE', url: '/api/transcripts/1' },
  { method: 'POST', url: '/api/transcripts/retranscribe' },
  // Integrations
  { method: 'GET', url: '/api/integrations/hubspot/test' },
  { method: 'POST', url: '/api/integrations/hubspot/import' },
  { method: 'POST', url: '/api/integrations/hubspot/log-call' },
  { method: 'POST', url: '/api/integrations/webhook/test' },
];

// Endpoints that MUST be reachable without auth — sweep for non-401.
// (They may return 200, 400, 403, 404, 405, etc — anything but 401.)
const PUBLIC_ROUTES: Array<{ method: 'GET' | 'POST' | 'PUT' | 'DELETE'; url: string }> = [
  { method: 'GET', url: '/api/health' },
  { method: 'GET', url: '/api/auth/status' },
  // /webhooks/* is exempt; the route doesn't exist for GET but should
  // not return 401 either.
  { method: 'POST', url: '/webhooks/telnyx' },
];

describe('Auth middleware — protected routes return 401 without session cookie', () => {
  for (const route of PROTECTED_ROUTES) {
    it(`${route.method} ${route.url} → 401`, async () => {
      const res = await app.inject({
        method: route.method,
        url: route.url,
        // No cookie header — unauthenticated
      });
      expect(res.statusCode).toBe(401);
    });
  }
});

describe('Auth middleware — public routes do NOT return 401', () => {
  for (const route of PUBLIC_ROUTES) {
    it(`${route.method} ${route.url} → not 401`, async () => {
      const res = await app.inject({
        method: route.method,
        url: route.url,
      });
      expect(res.statusCode).not.toBe(401);
    });
  }
});
