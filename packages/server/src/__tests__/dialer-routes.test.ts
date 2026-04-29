import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../app.js';
import { authCookie, TEST_USER_ID } from './setup.js';
import type { FastifyInstance } from 'fastify';

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp();
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

describe('Dialer Routes', () => {
  it('GET /api/dialer/status returns session status', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/dialer/status',
      headers: { cookie: authCookie() },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBeDefined();
    expect(body.operators).toBeDefined();
    expect(Array.isArray(body.operators)).toBe(true);
    expect(body.inFlightCalls).toBeDefined();
  });

  it('POST /api/dialer/join lets an operator join', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/dialer/join',
      headers: { cookie: authCookie() },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe('joined');
    expect(body.operator).toBeDefined();
    expect(body.operator.userId).toBe(TEST_USER_ID);
    expect(body.operator.availability).toBe('available');
  });

  it('POST /api/dialer/set-wrap-up sets operator to wrap-up', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/dialer/set-wrap-up',
      headers: { cookie: authCookie() },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('wrap_up');
  });

  it('POST /api/dialer/set-available sets operator to available', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/dialer/set-available',
      headers: { cookie: authCookie() },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('available');
  });

  it('POST /api/dialer/register-webrtc registers WebRTC leg', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/dialer/register-webrtc',
      headers: { cookie: authCookie() },
      payload: { callControlId: 'test-webrtc-leg-123' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('registered');
  });

  it('POST /api/dialer/register-webrtc rejects missing callControlId', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/dialer/register-webrtc',
      headers: { cookie: authCookie() },
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  it('POST /api/dialer/leave lets an operator leave', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/dialer/leave',
      headers: { cookie: authCookie() },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('left');
  });

  it('GET /api/dialer/status shows empty operators after leave', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/dialer/status',
      headers: { cookie: authCookie() },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.operators.length).toBe(0);
  });
});

describe('Dialer Auth', () => {
  it('rejects unauthenticated requests', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/dialer/status',
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('Dialer Soundboard — play-recording', () => {
  it('rejects invalid body with 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/dialer/play-recording',
      headers: { cookie: authCookie() },
      payload: { callControlId: '', recordingId: -1 },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 404 when call does not exist', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/dialer/play-recording',
      headers: { cookie: authCookie() },
      payload: { callControlId: 'nonexistent-call-id', recordingId: 1 },
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 403 when caller is not the assigned operator', async () => {
    const { addInFlightCall, updateInFlightCall, removeInFlightCall } = await import(
      '../dialer/team-state.js'
    );
    addInFlightCall('test-call-not-mine', 1);
    // Assign a DIFFERENT operator (TEST_USER_ID is the admin we're auth'd as).
    updateInFlightCall('test-call-not-mine', { assignedOperatorId: 99999 });

    const res = await app.inject({
      method: 'POST',
      url: '/api/dialer/play-recording',
      headers: { cookie: authCookie() },
      payload: { callControlId: 'test-call-not-mine', recordingId: 1 },
    });
    expect(res.statusCode).toBe(403);

    removeInFlightCall('test-call-not-mine');
  });

  it('returns 404 when recording does not exist for valid call owner', async () => {
    const { addInFlightCall, updateInFlightCall, removeInFlightCall } = await import(
      '../dialer/team-state.js'
    );
    addInFlightCall('test-call-mine', 1);
    updateInFlightCall('test-call-mine', { assignedOperatorId: TEST_USER_ID });

    const res = await app.inject({
      method: 'POST',
      url: '/api/dialer/play-recording',
      headers: { cookie: authCookie() },
      payload: { callControlId: 'test-call-mine', recordingId: 99999 },
    });
    expect(res.statusCode).toBe(404);

    removeInFlightCall('test-call-mine');
  });
});

