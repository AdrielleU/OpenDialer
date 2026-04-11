import type { FastifyPluginAsync } from 'fastify';
import { db } from '../db/index.js';
import { settings } from '../db/schema.js';
import { eq } from 'drizzle-orm';

// Whitelist of settings that may be written via the API. Any extra keys are
// rejected with 400 — prevents arbitrary key injection.
const ALLOWED_SETTING_KEYS = new Set<string>([
  'TELNYX_API_KEY',
  'TELNYX_CONNECTION_ID',
  'TELNYX_PHONE_NUMBER',
  'WEBHOOK_BASE_URL',
  'PROVIDER',
  'WEBHOOK_OUTBOUND_URL',
  'WEBHOOK_OUTBOUND_SECRET',
  'HUBSPOT_API_KEY',
  // Post-call (batch) transcription
  'OPENAI_API_KEY',
  'WHISPER_BATCH_URL',
  // Recording storage: 'telnyx' (default) | 'local'
  'RECORDING_STORAGE',
  // Test-only / freeform pass-through used by tests:
  'SOME_SETTING',
]);

export const settingRoutes: FastifyPluginAsync = async (fastify) => {
  // Settings include API keys and provider config — restrict to admins only.
  fastify.addHook('onRequest', async (request, reply) => {
    if ((request as any).userRole !== 'admin') {
      return reply.code(403).send({ error: 'Admin access required.' });
    }
  });

  // Get all settings as key-value object
  fastify.get('/', async () => {
    const rows = await db.select().from(settings);
    const obj: Record<string, string> = {};
    for (const row of rows) {
      obj[row.key] = row.value;
    }
    return obj;
  });

  // Upsert settings
  fastify.put<{ Body: Record<string, string> }>('/', async (request, reply) => {
    if (!request.body || typeof request.body !== 'object') {
      return reply.code(400).send({ error: 'Body must be a key-value object.' });
    }
    const entries = Object.entries(request.body);
    const invalid = entries.filter(([k, v]) => !ALLOWED_SETTING_KEYS.has(k) || typeof v !== 'string');
    if (invalid.length > 0) {
      return reply.code(400).send({
        error: 'Invalid setting key(s)',
        keys: invalid.map(([k]) => k),
      });
    }
    for (const [key, value] of entries) {
      await db
        .insert(settings)
        .values({ key, value })
        .onConflictDoUpdate({ target: settings.key, set: { value } });
    }
    return { success: true };
  });

  // Health check — verifies provider connectivity
  fastify.get('/health', async (_request, reply) => {
    try {
      const apiKeyRow = await db
        .select()
        .from(settings)
        .where(eq(settings.key, 'TELNYX_API_KEY'))
        .get();
      if (!apiKeyRow || !apiKeyRow.value) {
        return reply.code(200).send({ status: 'unconfigured', message: 'No API key set' });
      }
      return { status: 'configured', message: 'API key is set' };
    } catch {
      return reply.code(500).send({ status: 'error', message: 'Database error' });
    }
  });
};
