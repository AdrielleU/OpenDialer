import { db } from '../db/index.js';
import { settings } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import type { BatchSTTProvider, TranscriptResult } from './types.js';

/**
 * OpenAI Whisper API — cloud batch STT.
 *
 * Pricing as of 2026: ~$0.006/min ($0.36/hour). Best price/quality if you can
 * accept that audio leaves your infrastructure.
 *
 * NOT HIPAA-compliant on the standard API tier (no BAA). For PHI workflows
 * use SelfHostedWhisperProvider instead.
 */
export class OpenAIWhisperProvider implements BatchSTTProvider {
  name = 'openai-whisper';

  constructor(private apiKey: string) {}

  async transcribe(audio: Blob): Promise<TranscriptResult> {
    const form = new FormData();
    form.append('file', audio, 'recording.mp3');
    form.append('model', 'whisper-1');
    form.append('response_format', 'json');

    const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}` },
      body: form,
    });

    if (!res.ok) {
      const err = await res.text().catch(() => '');
      throw new Error(`OpenAI Whisper API ${res.status}: ${err}`);
    }

    const data = (await res.json()) as { text?: string };
    if (!data.text) {
      throw new Error('OpenAI Whisper returned no text');
    }

    return { text: data.text, confidence: null };
  }
}

/**
 * Self-hosted Whisper — runs whisper.cpp / openai-whisper-asr-webservice on
 * your own infrastructure. PHI-safe (audio never leaves your network).
 *
 * Compatible with the popular `onerahmet/openai-whisper-asr-webservice`
 * Docker image and whisper.cpp's HTTP server. Both accept multipart uploads
 * at /asr and return JSON with a `text` field.
 */
export class SelfHostedWhisperProvider implements BatchSTTProvider {
  name = 'self-hosted-whisper';

  constructor(private endpoint: string) {}

  async transcribe(audio: Blob): Promise<TranscriptResult> {
    const form = new FormData();
    form.append('audio_file', audio, 'recording.mp3');

    const res = await fetch(this.endpoint, {
      method: 'POST',
      body: form,
    });

    if (!res.ok) {
      const err = await res.text().catch(() => '');
      throw new Error(`Self-hosted Whisper ${res.status}: ${err}`);
    }

    // whisper-asr-webservice returns { text: "..." }; whisper.cpp returns the same.
    const data = (await res.json()) as { text?: string };
    if (!data.text) {
      throw new Error('Self-hosted Whisper returned no text');
    }

    return { text: data.text, confidence: null };
  }
}

async function getSetting(key: string): Promise<string | null> {
  const row = await db.select().from(settings).where(eq(settings.key, key)).get();
  return row?.value ?? null;
}

/**
 * Pick the right batch STT provider based on configuration.
 *
 * Preference order:
 *   1. Self-hosted Whisper (free + HIPAA-safe)  if WHISPER_BATCH_URL is set
 *   2. OpenAI Whisper API (cheap, cloud)         if OPENAI_API_KEY is set
 *   3. Throw — caller should mark transcription as failed for this call
 */
export async function getBatchSTTProvider(): Promise<BatchSTTProvider> {
  const whisperUrl = (await getSetting('WHISPER_BATCH_URL')) || process.env.WHISPER_BATCH_URL;
  if (whisperUrl) return new SelfHostedWhisperProvider(whisperUrl);

  const openaiKey = (await getSetting('OPENAI_API_KEY')) || process.env.OPENAI_API_KEY;
  if (openaiKey) return new OpenAIWhisperProvider(openaiKey);

  throw new Error(
    'No batch STT provider configured. Set WHISPER_BATCH_URL (self-hosted) or OPENAI_API_KEY in Settings.',
  );
}
