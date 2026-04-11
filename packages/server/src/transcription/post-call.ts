import { resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import { db } from '../db/index.js';
import { transcripts } from '../db/schema.js';
import { broadcast } from '../ws/index.js';
import { getBatchSTTProvider } from './providers.js';

/**
 * Load the recording audio into a Blob, regardless of whether it's stored
 * locally (e.g., `/uploads/recordings/123.mp3` after RECORDING_STORAGE=local
 * downloaded it) or hosted on Telnyx's CDN.
 */
async function loadRecording(recordingUrl: string): Promise<Blob> {
  // Local URLs (relative paths under /uploads/) live on disk — read directly,
  // skip the HTTP roundtrip.
  if (recordingUrl.startsWith('/uploads/')) {
    const localPath = resolve('.' + recordingUrl); // /uploads/x.mp3 → ./uploads/x.mp3
    const buffer = await readFile(localPath);
    return new Blob([new Uint8Array(buffer)], { type: 'audio/mpeg' });
  }

  // Anything else: fetch over HTTP(S)
  const res = await fetch(recordingUrl);
  if (!res.ok) {
    throw new Error(`Failed to fetch recording: ${res.status}`);
  }
  return await res.blob();
}

/**
 * Download a finished call recording, send it to a batch STT provider, and
 * store the resulting transcript. Fire-and-forget from the webhook handler.
 *
 * Errors are caught and logged here — the dialer must never fail because of
 * a transcription problem. The next call's recording will get its own attempt.
 */
export async function transcribeCallRecording(
  callLogId: number,
  recordingUrl: string,
): Promise<void> {
  try {
    const provider = await getBatchSTTProvider();
    console.log(`[transcription] starting post-call transcribe for callLog #${callLogId} via ${provider.name}`);

    const audio = await loadRecording(recordingUrl);
    const result = await provider.transcribe(audio);

    if (!result.text.trim()) {
      console.warn(`[transcription] empty transcript for callLog #${callLogId}`);
      return;
    }

    await db.insert(transcripts).values({
      callLogId,
      speaker: 'inbound', // No diarization yet — single track
      content: result.text,
      confidence: result.confidence,
    });

    broadcast({
      type: 'transcription',
      data: {
        callLogId,
        transcript: result.text,
        confidence: result.confidence,
        mode: 'post_call',
      },
    });

    console.log(`[transcription] post-call complete for callLog #${callLogId} (${result.text.length} chars)`);
  } catch (err: any) {
    console.error(
      `[transcription] post-call failed for callLog #${callLogId}:`,
      err?.message ?? err,
    );
  }
}
