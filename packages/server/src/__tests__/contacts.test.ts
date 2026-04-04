import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../app.js';
import type { FastifyInstance } from 'fastify';

let app: FastifyInstance;
let campaignId: number;

beforeAll(async () => {
  app = await buildApp();
  await app.ready();

  // Create a campaign for contacts to belong to
  const res = await app.inject({
    method: 'POST',
    url: '/api/campaigns',
    payload: { name: 'Contact Test Campaign', callerId: '+15559999999' },
  });
  campaignId = res.json().id;
});

afterAll(async () => {
  await app.close();
});

describe('Contacts API', () => {
  let contactId: number;

  it('POST /api/contacts creates a contact', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/contacts',
      payload: {
        campaignId,
        name: 'John Doe',
        phone: '+15550001111',
        company: 'Acme Inc',
        email: 'john@acme.com',
      },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.name).toBe('John Doe');
    expect(body.phone).toBe('+15550001111');
    expect(body.status).toBe('pending');
    contactId = body.id;
  });

  it('POST /api/contacts/bulk imports multiple contacts', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/contacts/bulk',
      payload: {
        campaignId,
        contacts: [
          { name: 'Jane Smith', phone: '+15550002222' },
          { name: 'Bob Wilson', phone: '+15550003333' },
        ],
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().imported).toBe(2);
  });

  it('POST /api/contacts/bulk rejects empty array', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/contacts/bulk',
      payload: { campaignId, contacts: [] },
    });
    expect(res.statusCode).toBe(400);
  });

  it('GET /api/contacts lists all contacts', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/contacts' });
    expect(res.statusCode).toBe(200);
    expect(res.json().length).toBeGreaterThanOrEqual(3);
  });

  it('GET /api/contacts?campaignId filters by campaign', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/contacts?campaignId=${campaignId}`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.length).toBe(3);
    expect(body.every((c: any) => c.campaignId === campaignId)).toBe(true);
  });

  it('GET /api/contacts/:id returns a single contact', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/contacts/${contactId}` });
    expect(res.statusCode).toBe(200);
    expect(res.json().name).toBe('John Doe');
  });

  it('PUT /api/contacts/:id updates a contact', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `/api/contacts/${contactId}`,
      payload: { name: 'John Updated' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().name).toBe('John Updated');
  });

  it('DELETE /api/contacts/:id deletes a contact', async () => {
    const res = await app.inject({ method: 'DELETE', url: `/api/contacts/${contactId}` });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });

  it('DELETE /api/contacts/:id returns 404 for missing contact', async () => {
    const res = await app.inject({ method: 'DELETE', url: `/api/contacts/${contactId}` });
    expect(res.statusCode).toBe(404);
  });
});
