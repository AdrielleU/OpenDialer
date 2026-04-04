import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../app.js';
import { authCookie } from './setup.js';
import type { FastifyInstance } from 'fastify';

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp();
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

describe('Users API', () => {
  let createdUserId: number;

  it('POST /api/users creates a new user', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/users',
      headers: { cookie: authCookie() },
      payload: { email: 'alice@test.com', name: 'Alice', password: 'password123', role: 'operator' },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.email).toBe('alice@test.com');
    expect(body.name).toBe('Alice');
    expect(body.role).toBe('operator');
    expect(body.id).toBeDefined();
    createdUserId = body.id;
  });

  it('GET /api/users lists users', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/users',
      headers: { cookie: authCookie() },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.some((u: any) => u.email === 'alice@test.com')).toBe(true);
  });

  it('POST /api/users rejects duplicate email', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/users',
      headers: { cookie: authCookie() },
      payload: { email: 'alice@test.com', name: 'Alice Dup', password: 'password123' },
    });
    expect(res.statusCode).toBe(409);
  });

  it('POST /api/users rejects short password', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/users',
      headers: { cookie: authCookie() },
      payload: { email: 'short@test.com', name: 'Short', password: 'abc' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('PUT /api/users/:id updates a user', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `/api/users/${createdUserId}`,
      headers: { cookie: authCookie() },
      payload: { name: 'Alice Updated' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().name).toBe('Alice Updated');
  });

  it('POST /api/users/:id/reset-password resets user password', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/users/${createdUserId}/reset-password`,
      headers: { cookie: authCookie() },
      payload: { password: 'newtemp12345' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().message).toContain('Password reset');
  });

  it('DELETE /api/users/:id deletes a user', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/users/${createdUserId}`,
      headers: { cookie: authCookie() },
    });
    expect(res.statusCode).toBe(204);
  });

  it('DELETE /api/users/:id returns 404 for missing user', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/users/99999',
      headers: { cookie: authCookie() },
    });
    expect(res.statusCode).toBe(404);
  });

  it('PUT /api/users/:id returns 404 for missing user', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/api/users/99999',
      headers: { cookie: authCookie() },
      payload: { name: 'Ghost' },
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('Users API — Auth Required', () => {
  it('GET /api/users without auth returns 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/users' });
    expect(res.statusCode).toBe(401);
  });
});
