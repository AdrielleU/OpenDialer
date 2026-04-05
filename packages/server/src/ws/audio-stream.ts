import type { FastifyPluginAsync } from 'fastify';
import { WebSocket, WebSocketServer } from 'ws';
import { db } from '../db/index.js';
import { transcripts, callLogs, campaigns } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { broadcast } from './index.js';

// STT provider WebSocket URLs
// For whisper, the "apiKey" field holds the WebSocket URL (e.g. ws://localhost:8786/v1/listen)
const STT_URLS: Record<string, (apiKey: string) => string> = {
  deepgram: (_apiKey) =>
    `wss://api.deepgram.com/v1/listen?model=nova-2&punctuate=true&encoding=mulaw&sample_rate=8000`,
  assemblyai: (_apiKey) => `wss://api.assemblyai.com/v2/realtime/ws?sample_rate=8000`,
  whisper: (apiKey) => apiKey || 'ws://whisper:8786/v1/listen',
};

const STT_AUTH_HEADERS: Record<string, (apiKey: string) => Record<string, string>> = {
  deepgram: (apiKey) => ({ Authorization: `Token ${apiKey}` }),
  assemblyai: (apiKey) => ({ Authorization: apiKey }),
  whisper: () => ({}),
};

// Track active streams: callControlId → STT WebSocket
const activeStreams = new Map<string, WebSocket>();

export function setupAudioStreamServer(server: any): WebSocketServer {
  const wss = new WebSocketServer({ server, path: '/audio-stream' });

  wss.on('connection', (telnyxWs: WebSocket) => {
    let callControlId: string | null = null;
    let sttWs: WebSocket | null = null;

    telnyxWs.on('message', async (rawData: Buffer | string) => {
      try {
        const msg = JSON.parse(rawData.toString());

        if (msg.event === 'start') {
          callControlId = msg.start?.call_control_id || null;
          if (!callControlId) return;

          // Look up campaign's STT config for this call
          const callLog = await db
            .select()
            .from(callLogs)
            .where(eq(callLogs.telnyxCallControlId, callControlId))
            .get();
          if (!callLog) return;

          const campaign = await db
            .select()
            .from(campaigns)
            .where(eq(campaigns.id, callLog.campaignId))
            .get();
          if (!campaign?.sttProvider) return;
          // Whisper doesn't need an API key (self-hosted); others do
          if (campaign.sttProvider !== 'whisper' && !campaign.sttApiKey) return;

          const provider = campaign.sttProvider;
          const apiKey = campaign.sttApiKey || '';
          const urlFn = STT_URLS[provider];
          const headerFn = STT_AUTH_HEADERS[provider];
          if (!urlFn) return;

          // Connect to STT provider
          sttWs = new WebSocket(urlFn(apiKey), {
            headers: headerFn ? headerFn(apiKey) : {},
          });

          activeStreams.set(callControlId, sttWs);

          sttWs.on('message', async (sttData: Buffer | string) => {
            try {
              const result = JSON.parse(sttData.toString());

              // Handle Deepgram response format
              const transcript =
                result.channel?.alternatives?.[0]?.transcript ||
                result.text ||
                result.transcript;
              const isFinal = result.is_final ?? result.speech_final ?? true;

              if (transcript && isFinal && callLog) {
                // Store transcript
                await db.insert(transcripts).values({
                  callLogId: callLog.id,
                  speaker: 'inbound',
                  content: transcript,
                  confidence: result.channel?.alternatives?.[0]?.confidence ?? null,
                });

                // Broadcast to UI
                broadcast({
                  type: 'transcription',
                  data: {
                    callLogId: callLog.id,
                    transcript,
                    confidence: result.channel?.alternatives?.[0]?.confidence ?? null,
                  },
                });
              }
            } catch {
              // Ignore malformed STT responses
            }
          });

          sttWs.on('error', () => {
            // STT connection failed — don't break the call
          });
        }

        if (msg.event === 'media' && sttWs?.readyState === WebSocket.OPEN) {
          // Forward raw audio to STT provider
          const audioBuffer = Buffer.from(msg.media.payload, 'base64');
          sttWs.send(audioBuffer);
        }

        if (msg.event === 'stop') {
          if (sttWs) {
            sttWs.close();
            sttWs = null;
          }
          if (callControlId) {
            activeStreams.delete(callControlId);
          }
        }
      } catch {
        // Ignore malformed Telnyx messages
      }
    });

    telnyxWs.on('close', () => {
      if (sttWs) {
        sttWs.close();
        sttWs = null;
      }
      if (callControlId) {
        activeStreams.delete(callControlId);
      }
    });
  });

  return wss;
}

export function getActiveStreamCount(): number {
  return activeStreams.size;
}
