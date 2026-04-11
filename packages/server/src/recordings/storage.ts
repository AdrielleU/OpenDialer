import { resolve, join } from 'node:path';
import { createWriteStream, existsSync, mkdirSync } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { db } from '../db/index.js';
import { settings } from '../db/schema.js';
import { eq } from 'drizzle-orm';

// Recordings live under the same uploads/ directory that fastify-static
// already serves at /uploads/. The uploads volume in docker-compose.yml
// persists this across container restarts, so no extra config is needed.
const recordingsDir = resolve('uploads/recordings');

if (!existsSync(recordingsDir)) {
  mkdirSync(recordingsDir, { recursive: true });
}

/**
 * Where the call recording is stored.
 *   'telnyx' (default) — leave the recording on Telnyx's CDN, store the
 *                        signed URL on the call log. Free disk; recordings
 *                        eventually expire on Telnyx side.
 *   'local'            — download the file once into uploads/recordings/
 *                        and serve it from /uploads/recordings/. Best for
 *                        HIPAA workflows where you want PHI on your own infra.
 */
export type RecordingStorageMode = 'telnyx' | 'local';

async function getStorageMode(): Promise<RecordingStorageMode> {
  const row = await db
    .select()
    .from(settings)
    .where(eq(settings.key, 'RECORDING_STORAGE'))
    .get();
  const value = row?.value || process.env.RECORDING_STORAGE || 'telnyx';
  return value === 'local' ? 'local' : 'telnyx';
}

/**
 * Download a Telnyx-hosted recording to local storage and return the local
 * URL path (e.g., `/uploads/recordings/123.mp3`). The caller is responsible
 * for storing this URL on the call log.
 *
 * Streams to disk — never loads the whole file into memory.
 */
async function downloadAndStoreLocally(
  remoteUrl: string,
  callLogId: number,
): Promise<string> {
  const res = await fetch(remoteUrl);
  if (!res.ok) {
    throw new Error(`Failed to download recording (${res.status})`);
  }
  if (!res.body) {
    throw new Error('Recording response had no body');
  }

  // Pick the file extension from the URL or default to mp3
  const ext = remoteUrl.match(/\.(mp3|wav|ogg|m4a)(\?|$)/i)?.[1]?.toLowerCase() || 'mp3';
  const fileName = `${callLogId}.${ext}`;
  const filePath = join(recordingsDir, fileName);

  // Stream the response body straight to disk
  await pipeline(Readable.fromWeb(res.body as any), createWriteStream(filePath));

  return `/uploads/recordings/${fileName}`;
}

/**
 * Decide where to keep the recording based on the global RECORDING_STORAGE
 * setting and return the URL to persist on the call log.
 *
 * - In 'telnyx' mode: returns the Telnyx URL unchanged (no download).
 * - In 'local' mode: downloads the file and returns the local /uploads URL.
 *   On any download failure, falls back to the Telnyx URL so the call log
 *   always has *something* — never crashes the dialer.
 */
export async function persistRecording(
  telnyxUrl: string,
  callLogId: number,
): Promise<string> {
  const mode = await getStorageMode();
  if (mode !== 'local') return telnyxUrl;

  try {
    const localUrl = await downloadAndStoreLocally(telnyxUrl, callLogId);
    console.log(`[recordings] stored locally for callLog #${callLogId} → ${localUrl}`);
    return localUrl;
  } catch (err: any) {
    console.error(
      `[recordings] local store failed for callLog #${callLogId}, falling back to Telnyx URL:`,
      err?.message ?? err,
    );
    return telnyxUrl;
  }
}
