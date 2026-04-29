import type { TelephonyProvider } from './types.js';
import { TelnyxProvider } from './telnyx.js';
import { db } from '../db/index.js';
import { settings } from '../db/schema.js';
import { eq } from 'drizzle-orm';

let cachedProvider: TelephonyProvider | null = null;

async function getSetting(key: string): Promise<string | undefined> {
  const row = await db.select().from(settings).where(eq(settings.key, key)).get();
  return row?.value;
}

export async function getProvider(): Promise<TelephonyProvider> {
  const apiKey = (await getSetting('TELNYX_API_KEY')) || process.env.TELNYX_API_KEY;
  if (!apiKey) {
    throw new Error('Telnyx API key not configured. Set it in Settings.');
  }
  cachedProvider = new TelnyxProvider(apiKey);
  return cachedProvider;
}

export function clearProviderCache() {
  cachedProvider = null;
}

export type { TelephonyProvider } from './types.js';
