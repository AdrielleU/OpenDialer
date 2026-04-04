# Call Transcription

OpenDialer supports two approaches to transcribing calls: **Telnyx Built-in Transcription** (zero infrastructure) and **Bring Your Own STT** via media streaming. Both are optional and can be enabled per campaign.

> **Status:** This feature is planned but not yet implemented. This document outlines the architecture and integration path for contributors and self-hosters.

---

## Option 1: Telnyx Built-in Transcription

Telnyx offers real-time transcription directly through their Call Control API. No external services needed — just API calls and webhook events.

### How It Works

1. When the operator bridges into a call ("Jump In"), the server sends a `transcription_start` command
2. Telnyx streams audio through one of four STT engines and sends `call.transcription` webhook events with the text
3. When the call ends, the server sends `transcription_stop` (or it stops automatically on hangup)
4. Transcripts are stored in the database and viewable in the UI

### API Commands

**Start transcription:**
```
POST https://api.telnyx.com/v2/calls/{call_control_id}/actions/transcription_start
```

```json
{
  "language": "en",
  "transcription_engine": "B",
  "transcription_tracks": "both"
}
```

**Stop transcription:**
```
POST https://api.telnyx.com/v2/calls/{call_control_id}/actions/transcription_stop
```

### Webhook Event

Telnyx sends `call.transcription` events as speech is detected:

```json
{
  "data": {
    "event_type": "call.transcription",
    "payload": {
      "call_control_id": "v3:abc123",
      "transcription_data": {
        "transcript": "Hi, I'm calling about your demo request.",
        "confidence": 0.95,
        "is_final": true
      }
    }
  }
}
```

- `is_final: false` = interim/partial result (faster but may change)
- `is_final: true` = final result (stable, use this for storage)

### Available Engines

| Engine | ID | Cost | Notes |
|--------|----|------|-------|
| **Telnyx** | `B` | ~$0.025/min | Best value. Lower latency, good accuracy |
| **Google** | `A` | ~$0.05/min | Supports interim results. Default engine |
| **Deepgram** | `Deepgram` | Varies | Models: `nova-2`, `nova-3`, `flux` |
| **Azure** | `Azure` | Varies | Strong multi-language and accent support |

### Transcription Tracks

| Value | What's transcribed |
|-------|--------------------|
| `inbound` | Only the contact's audio (what they say) |
| `outbound` | Only the operator's audio (what you say) |
| `both` | Both sides of the conversation |

### When to Start/Stop

| Trigger | Action |
|---------|--------|
| Operator clicks "Jump In" | `transcription_start` — transcribe the live conversation |
| Call hangs up | `transcription_stop` (automatic) |
| Voicemail detected | Don't transcribe — no value in transcribing a voicemail greeting |

### Implementation Path

The changes needed in the OpenDialer codebase:

**1. Provider interface** (`packages/server/src/providers/types.ts`):
```typescript
startTranscription(callControlId: string, options?: {
  language?: string;
  engine?: 'A' | 'B' | 'Deepgram' | 'Azure';
  tracks?: 'inbound' | 'outbound' | 'both';
}): Promise<void>;

stopTranscription(callControlId: string): Promise<void>;
```

**2. Telnyx provider** (`packages/server/src/providers/telnyx.ts`):
```typescript
async startTranscription(callControlId: string, options = {}) {
  await this.client.calls.actions.transcriptionStart(callControlId, {
    language: options.language || 'en',
    transcription_engine: options.engine || 'B',
    transcription_tracks: options.tracks || 'both',
  });
}
```

**3. Webhook handler** (`packages/server/src/webhooks/telnyx.ts`):
```typescript
case 'call.transcription': {
  const { transcript, confidence, is_final } = payload.transcription_data;
  if (is_final) {
    // Store in database
    // Broadcast to UI via SSE
  }
  break;
}
```

**4. Database** — new `transcripts` table:
```typescript
export const transcripts = sqliteTable('transcripts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  callLogId: integer('call_log_id').references(() => callLogs.id),
  speaker: text('speaker'), // 'inbound' | 'outbound'
  content: text('content').notNull(),
  confidence: real('confidence'),
  timestamp: text('timestamp').notNull(),
});
```

**5. Campaign settings** — optional transcription toggle:
```typescript
enableTranscription: integer('enable_transcription', { mode: 'boolean' }).default(false),
transcriptionEngine: text('transcription_engine').default('B'),
```

---

## Option 2: Bring Your Own STT (Media Streaming)

For users who want to use their own speech-to-text provider (Deepgram, OpenAI Whisper, AssemblyAI, Google Cloud Speech, etc.), Telnyx supports streaming raw call audio over WebSocket to any endpoint.

### How It Works

1. When the operator bridges in, the server sends a `streaming_start` command with a WebSocket URL
2. Telnyx streams raw audio packets to your WebSocket endpoint
3. Your endpoint forwards the audio to your chosen STT provider
4. Transcripts come back from your provider and get stored/displayed

### API Commands

**Start streaming:**
```
POST https://api.telnyx.com/v2/calls/{call_control_id}/actions/streaming_start
```

```json
{
  "stream_url": "wss://your-server.com/audio-stream",
  "stream_track": "both_tracks"
}
```

**Stop streaming:**
```
POST https://api.telnyx.com/v2/calls/{call_control_id}/actions/streaming_stop
```

### WebSocket Message Flow

Your WebSocket server receives these messages from Telnyx:

**1. Connected:**
```json
{ "event": "connected" }
```

**2. Start (metadata):**
```json
{
  "event": "start",
  "stream_id": "abc-123",
  "start": {
    "call_control_id": "v3:xyz",
    "media_format": {
      "encoding": "audio/x-mulaw",
      "sample_rate": 8000,
      "channels": 1
    }
  }
}
```

**3. Media (audio chunks):**
```json
{
  "event": "media",
  "media": {
    "track": "inbound",
    "payload": "base64-encoded-audio-data",
    "sequence_number": 1
  }
}
```

**4. Stop:**
```json
{ "event": "stop" }
```

### Supported Audio Codecs

| Codec | Sample Rate | Best For |
|-------|-------------|----------|
| PCMU (G.711 mu-law) | 8 kHz | Default, widely supported |
| PCMA (G.711 A-law) | 8 kHz | European telephony |
| G722 | 8 kHz | Higher quality narrowband |
| OPUS | 8/16 kHz | Modern, efficient |
| L16 (Linear PCM) | 16 kHz | Best for AI/STT (lowest latency, highest quality) |

**Recommendation:** Use `L16` at 16 kHz for the best transcription accuracy.

### Example: Piping to Deepgram

```typescript
import WebSocket from 'ws';

const wss = new WebSocket.Server({ port: 8765 });

wss.on('connection', (telnyxWs) => {
  // Open a connection to Deepgram
  const deepgramWs = new WebSocket('wss://api.deepgram.com/v1/listen', {
    headers: { Authorization: `Token ${DEEPGRAM_API_KEY}` },
  });

  telnyxWs.on('message', (data) => {
    const msg = JSON.parse(data.toString());
    if (msg.event === 'media') {
      // Forward raw audio to Deepgram
      const audioBuffer = Buffer.from(msg.media.payload, 'base64');
      deepgramWs.send(audioBuffer);
    }
  });

  deepgramWs.on('message', (data) => {
    const result = JSON.parse(data.toString());
    const transcript = result.channel?.alternatives?.[0]?.transcript;
    if (transcript) {
      // Store transcript, broadcast to UI via SSE
      console.log(`[${result.is_final ? 'FINAL' : 'INTERIM'}] ${transcript}`);
    }
  });
});
```

### Example: Post-Call with OpenAI Whisper

Instead of real-time streaming, you can transcribe after the call ends using the call recording:

```typescript
import OpenAI from 'openai';
import fs from 'fs';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function transcribeRecording(filePath: string) {
  const transcription = await openai.audio.transcriptions.create({
    model: 'whisper-1',
    file: fs.createReadStream(filePath),
    response_format: 'verbose_json',
    timestamp_granularities: ['segment'],
  });
  return transcription;
}
```

### Implementation Path

**1. Provider interface** — add streaming methods:
```typescript
startStreaming(callControlId: string, streamUrl: string, track?: string): Promise<void>;
stopStreaming(callControlId: string): Promise<void>;
```

**2. New WebSocket server** — receives audio from Telnyx and forwards to the user's STT provider

**3. Campaign settings** — configure STT provider:
```typescript
sttProvider: text('stt_provider'), // 'telnyx' | 'deepgram' | 'openai' | 'assemblyai' | null
sttApiKey: text('stt_api_key'),    // User's API key for their chosen provider
```

**4. Settings page** — UI for entering STT provider credentials

---

## Comparison

| | Telnyx Built-in | Bring Your Own STT |
|---|---|---|
| **Setup** | Zero — just enable per campaign | Need STT provider account + API key |
| **Infrastructure** | None — Telnyx handles everything | WebSocket relay server (or post-call processing) |
| **Real-time** | Yes | Yes (streaming) or No (post-call Whisper) |
| **Cost** | $0.025-0.05/min (included in Telnyx bill) | Varies by provider ($0.01-0.05/min typical) |
| **Accuracy** | Good (Telnyx/Google/Deepgram engines) | Depends on provider |
| **Languages** | Depends on engine (Google/Azure best for multilingual) | Depends on provider |
| **Customization** | Limited to Telnyx's config options | Full control over model, prompts, vocabulary |
| **Best for** | Most users — simple and effective | Power users who need specific models or have existing STT contracts |

---

## Post-Call Recording Transcription

Telnyx can also automatically transcribe call recordings after a call ends. This is a simpler alternative to real-time transcription:

1. Recordings are already captured when the operator bridges in (if recording is enabled)
2. Telnyx generates a transcription automatically
3. Retrieve it via `GET /v2/recording_transcriptions/{recording_transcription_id}`

This is useful for compliance, call review, and CRM logging where real-time display isn't needed.

---

## Roadmap

- [ ] Telnyx built-in transcription (real-time during calls)
- [ ] Transcript storage in database + display in call log UI
- [ ] Per-campaign transcription toggle and engine selection
- [ ] Media streaming WebSocket relay for BYO STT
- [ ] Deepgram integration (real-time via media streaming)
- [ ] OpenAI Whisper integration (post-call via recording)
- [ ] Transcript search and export (CSV)
- [ ] Live transcript display in Dialer UI during calls
