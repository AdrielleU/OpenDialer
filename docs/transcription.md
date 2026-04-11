# Call Transcription

OpenDialer supports **three transcription modes** per campaign, configurable on the Transcription page:

| Mode | Cost (300 calls/wk @ ~25 min ea.) | When to use |
|---|---|---|
| **Off** | $0 | Recordings still saved; no transcripts generated |
| **Live (real-time)** | ~$9,744/yr ($0.025/min via Telnyx) | Live coaching, supervisor monitoring, in-call note-taking |
| **After call (batch)** — OpenAI Whisper API | ~$2,338/yr ($0.006/min) | **Default recommendation.** 76% cheaper. Slight delay (~30s post-hangup). Not HIPAA-eligible without OpenAI Enterprise + BAA. |
| **After call (batch)** — Self-hosted Whisper | **~$0/yr** + compute | **HIPAA-safe.** Audio never leaves your network. Slight delay. |

The cheapest path that's HIPAA-safe is **self-hosted Whisper in batch mode** — see "Option 3" below.

> **Status:** All three modes are implemented. Real-time uses `provider.startTranscription` (Telnyx) or the WebSocket relay at `packages/server/src/ws/audio-stream.ts` (BYO STT). Batch uses the orchestrator at `packages/server/src/transcription/post-call.ts`, triggered by the `call.recording.saved` webhook.

---

## Option 1: Telnyx Built-in Transcription (Real-time)

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

## Option 3: Post-Call (Batch) Transcription — Recommended

This is the **default recommended path**. It transcribes the call recording *after* hangup using a single batch API request, which is dramatically cheaper than real-time streaming and works just as well for review/audit use cases.

### How it works

1. **Operator bridges into call.** Existing logic in `packages/server/src/dialer/engine.ts:303` calls `provider.startRecording(callControlId)`. Recording was already happening regardless of transcription mode.
2. **Call ends.** Telnyx finalizes the recording and fires `call.recording.saved` to the webhook handler.
3. **Webhook handler** (`packages/server/src/webhooks/telnyx.ts`) checks `campaign.transcriptionMode`. If it's `post_call`, fires `transcribeCallRecording(callLogId, recordingUrl)` as a fire-and-forget background job.
4. **Orchestrator** (`packages/server/src/transcription/post-call.ts`) picks an STT provider via `getBatchSTTProvider()`, downloads the recording from Telnyx, and posts it to the STT endpoint.
5. **Transcript stored** in the `transcripts` table with `speaker: 'inbound'`.
6. **SSE event** `transcription` broadcast with `mode: 'post_call'` so any open Transcription page refreshes within ~30 seconds.

The whole flow takes 5-30 seconds after hangup (depending on call length and STT provider), and the operator never has to wait for it.

### Provider preference order

The orchestrator picks providers in this order (`packages/server/src/transcription/providers.ts:getBatchSTTProvider`):

1. **Self-hosted Whisper** if `WHISPER_BATCH_URL` is configured in Settings — free, HIPAA-safe.
2. **OpenAI Whisper API** if `OPENAI_API_KEY` is configured — cheap, cloud, NOT HIPAA-eligible.
3. **Throws an error** if neither is set. The error is caught by the orchestrator and logged; the dialer keeps running.

### Provider 3a: OpenAI Whisper API (cloud)

The cheapest commercial option. ~$0.006/min ($0.36/hour).

**Setup:**
1. Get an API key from https://platform.openai.com/api-keys
2. Settings page → "Transcription (Post-Call Batch)" → paste into "OpenAI API Key"
3. Edit a campaign → Transcription Mode → "After call (batch)" → save
4. Make a call. After it ends, watch the server logs for `[transcription] post-call complete`

**HIPAA warning:** OpenAI does **not** sign Business Associate Agreements on the standard API tier. If your calls contain Protected Health Information, do not use this provider — use self-hosted Whisper instead. OpenAI Enterprise tier does sign BAAs but requires sales contact and minimum spend.

### Provider 3b: Self-hosted Whisper (HIPAA-safe)

Run your own Whisper instance via Docker. Audio never leaves your infrastructure. **The right choice for medical billing, healthcare, finance, and any workflow handling regulated data.**

**Compatible servers:**
- [`onerahmet/openai-whisper-asr-webservice`](https://github.com/ahmetoner/whisper-asr-webservice) — most popular, Docker image on Docker Hub
- [`whisper.cpp`](https://github.com/ggerganov/whisper.cpp) HTTP server — lighter, runs on CPU
- Any service that exposes `POST /asr` with multipart `audio_file` upload and returns JSON `{ "text": "..." }`

**Quick setup with whisper-asr-webservice (CPU, small model):**
```bash
docker run -d --name whisper -p 9000:9000 \
  -e ASR_MODEL=base \
  -e ASR_ENGINE=openai_whisper \
  onerahmet/openai-whisper-asr-webservice:latest-cpu
```

For better accuracy + GPU acceleration, use `:latest-gpu` and a larger model (`small`, `medium`, `large-v3`). On a 2 vCPU box with the `base` model, you'll get roughly 5-10x real-time — a 10-minute call transcribes in 1-2 minutes.

**Configure in OpenDialer:**
1. Settings page → "Self-hosted Whisper URL" → `http://whisper:9000/asr` (Docker) or `http://localhost:9000/asr` (local)
2. Edit a campaign → Transcription Mode → "After call (batch)" → save
3. The orchestrator will prefer self-hosted over OpenAI automatically once the URL is set

### Cost comparison (300 calls/week, 25 min avg)

| Mode | Per-minute | Annual cost |
|---|---|---|
| Real-time via Telnyx (Option 1) | $0.025 | ~$9,744 |
| Real-time via Deepgram BYO (Option 2) | $0.0043 | ~$1,676 |
| **Batch via OpenAI Whisper API (Option 3a)** | **$0.006** | **~$2,338** |
| **Batch via self-hosted Whisper (Option 3b)** | **~$0** (compute only) | **~$0–$960** |

Self-hosted Whisper batch is the cheapest and only HIPAA-safe option. OpenAI Whisper API is the cheapest *cloud* option.

### Limitations of post-call batch mode

- **No live transcript** during the call. If you need supervisors watching transcripts in real time, use Option 1 instead.
- **No speaker diarization** yet. Both sides of the conversation are stored as a single `inbound` track. Adding speaker labels is planned.
- **Server restart loses in-flight transcription jobs.** If the OpenDialer server restarts during the ~30s window between call end and transcription complete, that one transcript is lost. **Use the Re-transcribe button** (see below) to manually re-run STT against the recording — this is the recommended recovery path instead of a heavyweight job queue.

---

## Local Recording Storage (HIPAA-recommended)

By default, OpenDialer leaves call recordings on Telnyx's CDN — the call log stores a Telnyx-hosted URL. For HIPAA workflows or any case where you don't want PHI on a third-party CDN, switch to **local storage**: when `call.recording.saved` fires, OpenDialer downloads the file once and stores it in the `uploads/recordings/` directory, which is already mounted as a persistent Docker volume.

### Configuration

Settings page → set the `RECORDING_STORAGE` value:

| Value | Behavior |
|---|---|
| `telnyx` (default) | Recording stays on Telnyx; the call log stores the Telnyx URL. Free disk space, but recordings expire on Telnyx's side. |
| `local` | OpenDialer downloads each recording once and serves it from `/uploads/recordings/{callLogId}.mp3`. Audio never leaves your infrastructure. |

The `RECORDING_STORAGE` setting is per-installation, not per-campaign — it applies to all calls.

### Disk and persistence

Recordings live under `packages/server/uploads/recordings/` which is bind-mounted into the `uploads` named volume in `docker-compose.yml`. **No new volume configuration is needed.** The volume persists across container restarts and across `docker compose down` / `up` cycles.

Approximate disk usage:
- A 10-minute mono MP3 at 64 kbps ≈ **5 MB**
- 100 calls/week ≈ **2 GB/month**
- 1,000 calls/week ≈ **20 GB/month**

For mid-team workloads (1k+ calls/week), consider mounting a host directory with more space:

```yaml
# docker-compose.override.yml
services:
  app:
    volumes:
      - ./data/uploads:/app/packages/server/uploads
```

### Failure mode

If the local download fails for any reason (Telnyx URL expired, network issue, disk full), the call log falls back to storing the Telnyx URL. The dialer never crashes from a storage problem.

### HIPAA loop, complete

For the full HIPAA-safe loop:

1. Sign a Business Associate Agreement with your call carrier (Twilio offers BAAs; Telnyx claims the conduit exception)
2. Set `RECORDING_STORAGE=local` so audio is on your infrastructure
3. Set `WHISPER_BATCH_URL` and use Option 3b above (self-hosted Whisper) for transcription
4. Set `transcriptionMode='post_call'` on every campaign that handles PHI

With this configuration, audio:
- Originates on your operator's browser via WebRTC
- Travels to Telnyx for switching (carrier conduit)
- Comes back to your server via signed URL
- Is downloaded once and stored on your disk
- Is read from disk by the orchestrator and sent to your local Whisper container
- Never touches a third-party AI provider

---

## Re-transcribe Button

Every call entry on the Transcription page has a **Re-transcribe** button inside its expanded panel. Clicking it:

1. Calls `POST /api/transcripts/retranscribe` with `{ callLogId, force: true }`
2. The endpoint deletes any existing transcript lines for that call
3. Loads the recording (from disk if local, via fetch if Telnyx-hosted)
4. Sends it to whichever batch STT provider is configured (`getBatchSTTProvider()`)
5. Stores the new transcript and broadcasts a `transcription` SSE event so other open tabs refresh
6. Returns `{ status: 'transcribed', lines: N }` to the UI

This is the recommended recovery path for any of these situations:

- **The original transcription failed** (network blip, OpenAI outage, Whisper crashed)
- **The server restarted mid-job** between call end and transcription complete
- **The campaign was set to `transcriptionMode='off'`** at call time and you only later decided you wanted the transcript
- **You upgraded to a better Whisper model** (e.g., switched from `base.en` to `medium.en`) and want to re-run old calls
- **You're testing a new STT provider** and want to compare its output against the same audio

The endpoint also supports first-time transcription on calls that have never been transcribed — just send `{ callLogId }` without `force` and it returns 200 with a fresh transcript (or 409 if a transcript already exists, in which case set `force: true`).

**Why this replaces a job queue:** when transcription is fire-and-forget on a webhook, server restarts can lose in-flight jobs. A persistent job queue (BullMQ + Redis) would solve that but adds operational complexity. The combination of `RECORDING_STORAGE=local` + the Re-transcribe button is functionally equivalent: the recording is always on disk, so any failed or lost job can be retried with a single click.

---

## Roadmap

- [x] Telnyx built-in transcription (real-time during calls)
- [x] Transcript storage in database + display in call log UI
- [x] Per-campaign transcription mode (off / realtime / post_call)
- [x] Media streaming WebSocket relay for BYO STT
- [x] Deepgram integration (real-time via media streaming)
- [x] **OpenAI Whisper API integration (post-call batch)**
- [x] **Self-hosted Whisper (post-call batch, HIPAA-safe)**
- [x] Live transcript display in Dialer UI during calls (real-time mode)
- [ ] Speaker diarization (currently all transcripts get `speaker: 'inbound'`)
- [ ] Transcript search and export (CSV)
- [ ] Persistent job queue for transcription (survives server restart)
- [ ] Retroactive batch transcription of historical recordings
