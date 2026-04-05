import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../app.js';
import { authCookie } from './setup.js';
import type { FastifyInstance } from 'fastify';

let app: FastifyInstance;
let campaignId: number;

beforeAll(async () => {
  app = await buildApp();
  await app.ready();

  const res = await app.inject({
    method: 'POST',
    url: '/api/campaigns',
    headers: { cookie: authCookie() },
    payload: { name: 'IVR Contact Campaign', callerId: '+15558887777' },
  });
  campaignId = res.json().id;
});

afterAll(async () => {
  await app.close();
});

describe('Contact IVR Sequence', () => {
  let contactId: number;

  it('creates a contact with ivrSequence', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/contacts',
      headers: { cookie: authCookie() },
      payload: {
        campaignId,
        name: 'IVR Contact',
        phone: '+15551112222',
        ivrSequence: 'WWW1WW2W0',
        notes: 'Claim #12345',
      },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    contactId = body.id;
    expect(body.ivrSequence).toBe('WWW1WW2W0');
  });

  it('GET returns ivrSequence', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/contacts/${contactId}`,
      headers: { cookie: authCookie() },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().ivrSequence).toBe('WWW1WW2W0');
  });

  it('creates a contact without ivrSequence', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/contacts',
      headers: { cookie: authCookie() },
      payload: {
        campaignId,
        name: 'Normal Contact',
        phone: '+15553334444',
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().ivrSequence).toBeNull();
  });

  it('bulk import supports ivrSequence', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/contacts/bulk',
      headers: { cookie: authCookie() },
      payload: {
        campaignId,
        contacts: [
          { name: 'Bulk IVR 1', phone: '+15555556666', ivrSequence: 'WW1' },
          { name: 'Bulk IVR 2', phone: '+15555557777', ivrSequence: 'WW2WW3' },
          { name: 'Bulk Normal', phone: '+15555558888' },
        ],
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().imported).toBe(3);
  });

  it('update contact ivrSequence', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `/api/contacts/${contactId}`,
      headers: { cookie: authCookie() },
      payload: { ivrSequence: 'WW9' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().ivrSequence).toBe('WW9');
  });
});
