import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../app.js';
import { authCookie, operatorAuthCookie } from './setup.js';
import type { FastifyInstance } from 'fastify';

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp();
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

// These tests guard against authorization regressions: operators must NOT be
// able to call admin-only endpoints. Each test asserts a 403 from an operator
// session and (where reasonable) a non-403 from an admin session to prove the
// guard is the only thing blocking the call.

describe('RBAC — admin-only endpoints reject operator sessions', () => {
  describe('Dialer session control', () => {
    it('POST /api/dialer/start returns 403 for operator', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/dialer/start',
        headers: { cookie: operatorAuthCookie() },
        payload: { campaignId: 1 },
      });
      expect(res.statusCode).toBe(403);
    });

    it('POST /api/dialer/stop returns 403 for operator', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/dialer/stop',
        headers: { cookie: operatorAuthCookie() },
      });
      expect(res.statusCode).toBe(403);
    });

    it('POST /api/dialer/pause returns 403 for operator', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/dialer/pause',
        headers: { cookie: operatorAuthCookie() },
      });
      expect(res.statusCode).toBe(403);
    });

    it('POST /api/dialer/resume returns 403 for operator', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/dialer/resume',
        headers: { cookie: operatorAuthCookie() },
      });
      expect(res.statusCode).toBe(403);
    });

    it('GET /api/dialer/status is allowed for operator', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/dialer/status',
        headers: { cookie: operatorAuthCookie() },
      });
      expect(res.statusCode).toBe(200);
    });
  });

  describe('Settings (contains API keys)', () => {
    it('GET /api/settings returns 403 for operator', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/settings',
        headers: { cookie: operatorAuthCookie() },
      });
      expect(res.statusCode).toBe(403);
    });

    it('PUT /api/settings returns 403 for operator', async () => {
      const res = await app.inject({
        method: 'PUT',
        url: '/api/settings',
        headers: { cookie: operatorAuthCookie() },
        payload: { TELNYX_API_KEY: 'stolen' },
      });
      expect(res.statusCode).toBe(403);
    });

    it('GET /api/settings/health returns 403 for operator', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/settings/health',
        headers: { cookie: operatorAuthCookie() },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  describe('Users (admin team management)', () => {
    it('GET /api/users returns 403 for operator', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/users',
        headers: { cookie: operatorAuthCookie() },
      });
      expect(res.statusCode).toBe(403);
    });

    it('POST /api/users returns 403 for operator', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/users',
        headers: { cookie: operatorAuthCookie() },
        payload: {
          email: 'newop@example.com',
          name: 'New Op',
          password: 'temppass123',
        },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  describe('Settings rejects non-whitelisted keys', () => {
    it('PUT /api/settings rejects unknown key with 400', async () => {
      const res = await app.inject({
        method: 'PUT',
        url: '/api/settings',
        headers: { cookie: authCookie() },
        payload: { ARBITRARY_INJECTED_KEY: 'oops' },
      });
      expect(res.statusCode).toBe(400);
    });
  });
});

describe('RBAC — operator-accessible endpoints', () => {
  it('GET /api/users/me works for operator', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/users/me',
      headers: { cookie: operatorAuthCookie() },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.email).toBe('testoperator@test.com');
    expect(body.role).toBe('operator');
  });

  it('GET /api/users/me works for admin', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/users/me',
      headers: { cookie: authCookie() },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.email).toBe('testadmin@test.com');
    expect(body.role).toBe('admin');
  });
});
