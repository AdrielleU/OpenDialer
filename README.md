<div align="center">

# 📞 OpenDialer

### Open-Source Self-Hosted Power Dialer

**Drop voicemails. Connect with humans. Pay $0.01/min instead of $250/user/month.**

[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?logo=typescript&logoColor=white)](https://typescriptlang.org)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev)
[![Fastify](https://img.shields.io/badge/Fastify-5-000000?logo=fastify&logoColor=white)](https://fastify.dev)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker&logoColor=white)](https://docker.com)
[![Telnyx](https://img.shields.io/badge/Telnyx-Powered-00C08B)](https://telnyx.com)

<br />

[Features](#-features) · [How It Works](#-how-it-works) · [Quick Start](#-quick-start) · [Architecture](#-architecture) · [Deployment](#-deployment) · [Contributing](#-contributing)

<br />

<img src="https://img.shields.io/badge/Status-Alpha-orange" alt="Alpha" />

</div>

---

## 🎯 What is OpenDialer?

OpenDialer is a **browser-based power dialer** you self-host on your own infrastructure. Plug in your [Telnyx](https://telnyx.com) API keys, upload contacts, upload voicemail recordings, and start dialing — all from the browser with a headset.

**This is NOT an AI voice agent.** This is a classic power dialer with:

- 🤖 **Answering Machine Detection (AMD)** — automatically detects voicemail vs. human
- 📬 **Pre-recorded voicemail drops** — drops your message after the beep, no user action needed
- 🎙️ **Pre-recorded opener playback** — plays your intro when a human answers
- 🎧 **Live human takeover (Jump In)** — take over the call from your browser via WebRTC
- ⏭️ **Auto-advance through contact lists** — voicemails are fully automatic
- 📊 **Analytics & CSV export** — export contacts, call logs, and campaign stats

### 💰 Why?

| Product | Price | OpenDialer |
|---------|-------|------------|
| Orum | $250/user/mo | **$0 + ~$0.01/min** |
| Nooks | $200+/user/mo | Self-hosted, BYOK |
| PhoneBurner | $140/user/mo | No subscription |
| Kixie | $95/user/mo | Fraction of cost |
| JustCall | $49/user/mo | Full control |

You bring your own Telnyx account. You pay only for minutes used (~$0.01-0.02/min). No per-seat fees, no vendor lock-in.

---

## ✨ Features

### 📋 Campaign Management
Create calling campaigns with contact lists, opener recordings, and voicemail drops. Set your caller ID, assign recordings, and track campaign progress in real time.

### 👥 Contact Management
- **CSV import** — upload contacts with name, phone, company, email, notes
- **Manual entry** — add contacts one by one
- **Status tracking** — pending, voicemail left, connected, callback, not interested, DNC

### 🎵 Recording Management
Upload MP3/WAV files for opener messages and voicemail drops. Preview recordings in-browser. A/B test different messages across campaigns.

### 📞 Power Dialer
The main screen — sit with your headset on:
- **Voicemails are automatic** — AMD detects, waits for beep, drops recording, hangs up, dials next
- **Humans get your attention** — opener plays, you see "Human Answered", click Jump In to take over
- **Auto-advance** — the dialer moves through your list automatically
- **Pause/Resume/Stop** — full session control

### 📊 Analytics & Export
- Campaign stats: total calls, connects, voicemails, talk time, connect rate
- Contact progress: visual breakdown by status
- Call disposition: breakdown with percentages
- **CSV export**: contacts, call logs, campaign summaries — import into any CRM or spreadsheet

### Call Transcription (Coming Soon)
Two paths for transcribing calls — see [docs/transcription.md](docs/transcription.md) for full details:
- **Telnyx Built-in** — real-time transcription via Telnyx's API ($0.025/min), zero infrastructure, 4 engine choices (Telnyx, Google, Deepgram, Azure)
- **Bring Your Own STT** — stream raw call audio via WebSocket to any provider (Deepgram, OpenAI Whisper, AssemblyAI, etc.)

### ⚙️ Settings
- Enter your Telnyx API key, Connection ID, and phone number
- Test connectivity from the UI
- Configure webhook URL for Telnyx events

---

## 🔄 How It Works

This is the core call flow — understanding this is key to understanding the entire app.

```
User clicks "Start Calling" → System dials Contact #1
                                      │
                              call.answered
                                      │
                         Answering Machine Detection
                              /              \
                        MACHINE               HUMAN
                           │                    │
                   Wait for beep         Play opener recording
                           │                    │
               call.machine.greeting     UI shows "Human Answered!"
                    .ended                      │
                           │              ┌─────┴──────┐
               Play voicemail drop    User clicks    Call ends
                           │          "Jump In"        │
                call.playback.ended      │        Auto-dial
                           │         Bridge WebRTC     next
                       Hang up       into live call
                           │
                    Auto-dial next
                    (user never
                    touched anything)
```

### Event-by-Event Breakdown

| # | What Happens | Telnyx Event | Server Action |
|---|-------------|-------------|---------------|
| 1 | System dials a contact | `call.initiated` | Update UI: "Dialing..." |
| 2 | Someone/something picks up | `call.answered` | AMD starts analyzing |
| 3a | AMD says "machine" | `call.machine.detection.ended` (result=machine) | Wait for the beep |
| 3b | AMD says "human" | `call.machine.detection.ended` (result=human) | Play opener recording, alert user |
| 4 | Voicemail beep detected | `call.machine.greeting.ended` | Play voicemail drop recording |
| 5 | Recording finishes playing | `call.playback.ended` | If voicemail → hang up → dial next. If opener → wait for user |
| 6 | User clicks "Jump In" | REST API call | Bridge user's WebRTC audio into the live call |
| 7 | Call ends (any reason) | `call.hangup` | Log result, update contact status, dial next |

### Key Mechanism: `client_state`

Every outbound call carries a base64-encoded JSON payload called `client_state`. This is how the server tracks which campaign and contact a call belongs to across stateless webhook callbacks:

```
dial() → client_state: { campaignId: 1, contactId: 42 }
  ↓
Telnyx sends webhooks with that client_state echoed back
  ↓
Server decodes it → knows which campaign/contact to update
```

### Real-Time Updates: Server-Sent Events (SSE)

The browser connects to `/events` (SSE endpoint). The server pushes events as they happen:

```
Browser ←──── SSE ──── Server ←──── Telnyx Webhooks
  │                      │
  │  call_status_changed │  call.answered
  │  session_status      │  call.machine.detection.ended
  │  call_log_added      │  call.playback.ended
  │  contact_updated     │  call.hangup
```

No polling. No WebSocket complexity. The browser uses the native `EventSource` API which auto-reconnects on failure.

---

## 🚀 Quick Start

### Prerequisites

- [Docker Desktop](https://docker.com/products/docker-desktop) (Windows, Mac, or Linux)
- A [Telnyx](https://telnyx.com) account with:
  - API Key (starts with `KEY_`)
  - A [SIP Connection](https://portal.telnyx.com/#/app/connections) with WebRTC enabled
  - A purchased phone number

### 1. Clone & Configure

```bash
git clone https://github.com/yourusername/OpenDialer.git
cd OpenDialer
cp .env.example .env
```

Edit `.env` with your Telnyx credentials:

```env
TELNYX_API_KEY=KEY_your_key_here
TELNYX_CONNECTION_ID=your_connection_id
TELNYX_PHONE_NUMBER=+1your_number
WEBHOOK_BASE_URL=https://your-public-url
```

### 2. Run

```bash
docker compose up --build
```

That's it. Open [http://localhost:8080](http://localhost:8080).

### 3. Public URL for Webhooks

Telnyx needs to reach your server. For local development, use [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/) (free, no account needed):

```bash
# Quick tunnel — random URL, good for testing
docker compose --profile tunnel up --build

# Check the URL in logs
docker compose logs tunnel
```

Or install `cloudflared` locally:

```bash
cloudflared tunnel --url http://localhost:3000
```

Set the URL as your `WEBHOOK_BASE_URL` in the Settings page.

### Development Mode (without Docker)

```bash
# Install pnpm if needed
npm install -g pnpm

# Install dependencies
pnpm install

# Run both server and frontend
pnpm dev
```

- Backend: http://localhost:3000
- Frontend: http://localhost:5173 (proxies API calls to backend)

---

## 📖 User Guide — Your First Calling Session

Once OpenDialer is running, follow these steps to make your first calls.

### Step 1: Configure Telnyx Credentials

1. Go to the **Settings** page in the app
2. Enter your **Telnyx API Key** (starts with `KEY_`)
3. Enter your **SIP Connection ID** — create one at [portal.telnyx.com → SIP Connections](https://portal.telnyx.com/#/app/connections)
   - Make sure **WebRTC** is enabled on the connection (needed for "Jump In")
4. Enter your **Phone Number** in E.164 format (e.g., `+15551234567`) — purchase one from the [Telnyx Number Portal](https://portal.telnyx.com/#/app/numbers/search-numbers)
5. Enter your **Webhook Base URL** — the public URL where Telnyx can reach your server (see [webhooks setup](#3-public-url-for-webhooks) above)
6. Click **Save** and use the **Test Connection** button to verify

### Step 2: Upload Recordings

1. Go to the **Recordings** page
2. Upload an **Opener recording** (MP3 or WAV) — this plays when a human picks up, before you jump in. Example: *"Hi, this is Sarah from Acme Corp — hold on one moment..."*
3. Upload a **Voicemail drop recording** — this plays automatically after the voicemail beep. Example: *"Hey, it's Sarah from Acme. I was calling about... give me a ring back at..."*
4. You can upload multiple recordings and assign different ones per campaign

### Step 3: Create a Campaign

1. Go to the **Campaigns** page and click **Create Campaign**
2. Give it a name (e.g., "Q2 Outbound — West Coast")
3. Set the **Caller ID** — the phone number contacts will see (must be your Telnyx number or a verified number)
4. Select your **Opener recording** and **Voicemail drop recording** from the dropdowns
5. Save the campaign

### Step 4: Import Contacts

1. Go to the **Contacts** page
2. Select your campaign, then either:
   - **Add manually** — enter name, phone (E.164), company, email, notes
   - **Bulk import via CSV** — upload a CSV with columns: `name`, `phone`, `company`, `email`, `notes`. Phone numbers must be in E.164 format (`+1XXXXXXXXXX`)
3. Contacts start with status **Pending** and move through the dialer queue

### Step 5: Start Dialing

1. Go to the **Dialer** page — this is your main workspace
2. **Put on your headset** — your browser will use WebRTC for audio
3. Select your campaign from the dropdown and click **Start Calling**
4. The dialer auto-advances through your contact list:

| What you see | What's happening | What to do |
|-------------|------------------|------------|
| **Dialing...** | Call is being placed | Wait |
| **Detecting...** | AMD is analyzing the pickup | Wait |
| **Dropping Voicemail** | Machine detected, waiting for beep → auto-drops voicemail → auto-hangs up → auto-dials next | Nothing — fully automatic |
| **Human Answered!** | A live person picked up, opener is playing | Get ready, then click **Jump In** |
| **You are LIVE** | Your mic is bridged into the call | Talk! |
| **AMD inconclusive** | Detection couldn't determine human vs. machine | Click **Jump In** to be safe, or **Skip** |
| **AMD timed out** | Detection took too long (>35s) | Click **Jump In** or **Skip** |

5. Use **Pause** to stop auto-advancing (current call continues), **Resume** to restart, **Stop** to end the session
6. Use **Skip** to hang up the current call and move to the next contact

### Step 6: Review Results

1. Go to the **Analytics** page to see campaign stats: total calls, connect rate, voicemails dropped
2. Use **Export CSV** to download contacts, call logs, or a campaign summary for your CRM

### How Calls Work Under the Hood

- **Outbound calls** are placed via Telnyx's REST Call Control API — your server controls the call
- **Your audio** (when you Jump In) goes through WebRTC in your browser via the `@telnyx/webrtc` SDK
- **Bridging** connects the two call legs together so you and the contact can hear each other
- **State is in-memory** — if the server restarts during a session, active calls are orphaned. The contact list and logs are persisted in SQLite

---

## 🏗️ Architecture

```
┌─────────────────────────────────┐
│      React + Tailwind UI         │
│  (Softphone + Campaign Mgmt)    │
│  Uses: @telnyx/webrtc SDK        │
└──────────────┬──────────────────┘
               │ SSE (real-time call status)
               │ REST API (CRUD operations)
               │
┌──────────────┴──────────────────┐
│       Fastify Backend            │
│                                  │
│  ┌────────────────────────────┐  │
│  │  Telnyx Webhook Handler    │  │  ← Receives call events from Telnyx
│  │  (The Brain)               │  │
│  └────────────────────────────┘  │
│  ┌────────────────────────────┐  │
│  │  Dialer Engine             │  │  ← Manages call queue + auto-advance
│  └────────────────────────────┘  │
│  ┌────────────────────────────┐  │
│  │  Provider Abstraction      │  │  ← Telnyx now, Twilio later
│  └────────────────────────────┘  │
│  ┌────────────────────────────┐  │
│  │  Analytics + CSV Export    │  │  ← Stats, reports, data export
│  └────────────────────────────┘  │
│                                  │
│  SQLite (Drizzle ORM)            │  ← Zero-config, file-based
└──────────────┬──────────────────┘
               │
┌──────────────┴──────────────────┐
│  Telnyx Call Control API         │
│  - Dial, AMD, Playback, Bridge  │
│  - WebRTC (browser audio)       │
└──────────────────────────────────┘
```

### Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Frontend | React 19 + TypeScript + Tailwind CSS 4 | Modern, fast, great DX |
| Backend | Fastify 5 + TypeScript | Fastest Node.js framework, great TS support |
| Database | SQLite via Drizzle ORM + libsql | Zero config, file-based, type-safe queries |
| Telephony | Telnyx Call Control API | Best price/performance for voice, excellent AMD |
| Browser Audio | @telnyx/webrtc SDK | WebRTC softphone in the browser |
| Real-time | Server-Sent Events (SSE) | Simpler than WebSocket, auto-reconnect, HTTP-native |
| Deployment | Docker Compose | One command to run everything |
| Tunnel | Cloudflare Tunnel | Free HTTPS public URL for webhooks |

### Project Structure

```
opendialer/
├── docker-compose.yml           # One-command deployment
├── .env.example                 # All config in one place
│
├── packages/
│   ├── server/                  # Fastify backend
│   │   ├── src/
│   │   │   ├── index.ts         # Server entrypoint
│   │   │   ├── config.ts        # Zod-validated env config
│   │   │   ├── db/
│   │   │   │   ├── schema.ts    # Drizzle ORM tables (5 tables)
│   │   │   │   ├── index.ts     # Database connection
│   │   │   │   └── migrate.ts   # Auto-migration on startup
│   │   │   ├── routes/
│   │   │   │   ├── campaigns.ts # Campaign CRUD
│   │   │   │   ├── contacts.ts  # Contact CRUD + bulk import
│   │   │   │   ├── recordings.ts# File upload + management
│   │   │   │   ├── settings.ts  # Key-value settings store
│   │   │   │   ├── dialer.ts    # Start/pause/resume/stop/skip/jump-in
│   │   │   │   └── analytics.ts # Stats + CSV export endpoints
│   │   │   ├── webhooks/
│   │   │   │   └── telnyx.ts    # ← THE BRAIN: call state machine
│   │   │   ├── dialer/
│   │   │   │   ├── engine.ts    # Call queue, auto-advance logic
│   │   │   │   ├── state.ts     # In-memory session state
│   │   │   │   └── bridge.ts    # WebRTC bridge (Jump In)
│   │   │   ├── providers/
│   │   │   │   ├── types.ts     # TelephonyProvider interface
│   │   │   │   ├── telnyx.ts    # Telnyx implementation
│   │   │   │   └── twilio.ts    # Twilio stub (future)
│   │   │   └── ws/
│   │   │       └── index.ts     # SSE broadcast to frontend
│   │   └── drizzle/             # Generated SQL migrations
│   │
│   └── web/                     # React frontend
│       ├── src/
│       │   ├── App.tsx          # Router + layout
│       │   ├── pages/
│       │   │   ├── Dialer.tsx   # Main softphone UI (3-panel)
│       │   │   ├── Campaigns.tsx# Campaign builder
│       │   │   ├── Contacts.tsx # Contact list + CSV upload
│       │   │   ├── Recordings.tsx# Upload + playback
│       │   │   ├── Analytics.tsx# Stats dashboard + CSV export
│       │   │   └── Settings.tsx # API key configuration
│       │   ├── hooks/
│       │   │   ├── useWebSocket.ts  # SSE hook (EventSource)
│       │   │   └── useTelnyxClient.ts # WebRTC SDK hook
│       │   └── lib/
│       │       └── api.ts       # Typed API client
│       └── nginx.conf           # Production reverse proxy
```

### Database Schema

5 tables, all managed by Drizzle ORM with auto-migration:

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `settings` | Key-value config store | API keys, webhook URL, provider |
| `campaigns` | Calling campaigns | name, caller ID, recording IDs, status |
| `contacts` | Contact lists per campaign | name, phone (E.164), company, status |
| `recordings` | Uploaded audio files | name, type (opener/voicemail), file path |
| `call_logs` | Call history | disposition, duration, timestamps, recording URL |

### API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/campaigns` | List campaigns with contact counts |
| `POST` | `/api/campaigns` | Create campaign |
| `GET` | `/api/contacts?campaignId=X` | List contacts |
| `POST` | `/api/contacts/bulk` | Bulk import contacts (JSON) |
| `POST` | `/api/recordings` | Upload audio file (multipart) |
| `GET` | `/api/settings` | Get all settings |
| `PUT` | `/api/settings` | Save settings |
| `POST` | `/api/dialer/start` | Start dialing session |
| `POST` | `/api/dialer/pause` | Pause auto-advance |
| `POST` | `/api/dialer/jump-in` | Bridge into live call |
| `GET` | `/api/analytics/campaigns/:id/stats` | Campaign statistics |
| `GET` | `/api/analytics/campaigns/:id/export/contacts` | Export contacts CSV |
| `GET` | `/api/analytics/campaigns/:id/export/calls` | Export call logs CSV |
| `GET` | `/api/analytics/export/summary` | Export all campaigns CSV |
| `POST` | `/webhooks/telnyx` | Telnyx webhook receiver |
| `GET` | `/events` | SSE stream (real-time updates) |

---

## 🌐 Deployment

### Docker Compose (Recommended)

```bash
docker compose up --build -d
```

With Cloudflare Tunnel for public HTTPS:

```bash
# Anonymous tunnel (random URL, no account needed)
docker compose --profile tunnel up --build -d

# Named tunnel (permanent custom domain, free Cloudflare account)
# Set CLOUDFLARE_TUNNEL_TOKEN in .env first
docker compose --profile tunnel-named up --build -d
```

### Hosting Options

| Option | Cost | Notes |
|--------|------|-------|
| **Hetzner VPS + Coolify** | ~$4/mo | Best value. Coolify runs docker-compose natively |
| **Fly.io** | $0-5/mo | Managed. Free tier works for single user |
| **Railway** | $5/mo | Fastest deploy. Connect GitHub → done |
| **Your own server** | Any machine with Docker | `docker compose up` and you're live |

### Windows Support

Works with Docker Desktop (WSL2 backend). Named volumes handle SQLite persistence correctly. See `.gitattributes` for line ending configuration.

---

## 📊 Data Export

Export your data as CSV from the Analytics page or directly via API:

```bash
# Export all contacts from campaign 1
curl http://localhost:3000/api/analytics/campaigns/1/export/contacts > contacts.csv

# Export call logs from campaign 1
curl http://localhost:3000/api/analytics/campaigns/1/export/calls > call-logs.csv

# Export summary of all campaigns
curl http://localhost:3000/api/analytics/export/summary > summary.csv
```

CSV exports include all fields and are compatible with Excel, Google Sheets, HubSpot, Salesforce, and any CRM that accepts CSV imports.

---

## 🛣️ Roadmap

- [x] Telnyx Call Control + AMD integration
- [x] WebRTC softphone (browser audio)
- [x] Campaign management + contact CSV import
- [x] Recording upload + management
- [x] Auto-advance dialer engine
- [x] Real-time UI via SSE
- [x] Analytics dashboard + CSV export
- [x] Docker Compose + Cloudflare Tunnel deployment
- [ ] [Call transcription (Telnyx built-in + BYO STT)](docs/transcription.md)
- [ ] Twilio as second provider
- [ ] HubSpot contact import + activity sync
- [ ] Apollo contact import
- [ ] Call recording playback in-app
- [ ] Multi-user support
- [ ] Parallel dialing (multiple simultaneous calls)
- [ ] Webhook endpoint for generic CRM push (Zapier/Make compatible)

---

## 🤝 Contributing

Contributions are welcome! This is an AGPL-3.0 project — if you offer OpenDialer as a hosted service, you must open-source your changes.

1. Fork the repo
2. Create a branch: `git checkout -b feature/my-feature`
3. Make your changes
4. Run checks: `pnpm -r build` and verify TypeScript compiles clean
5. Commit and push
6. Open a Pull Request

### Development Setup

```bash
git clone https://github.com/yourusername/OpenDialer.git
cd OpenDialer
pnpm install
pnpm dev
```

The Vite dev server proxies API calls to the Fastify backend automatically.

---

## 📄 License

[AGPL-3.0](LICENSE) — Free to self-host and modify. If you offer it as a hosted service, you must open-source your modifications.

---

## 👥 Authors

Created by **AdrielleU** | Sponsored by **AIIVARS LLC**

See all [OpenDialer Contributors](https://github.com/yourusername/OpenDialer/graphs/contributors).

---

<div align="center">
<br />

**If OpenDialer saves you money, give it a ⭐**

<br />

[Report Bug](https://github.com/yourusername/OpenDialer/issues) · [Request Feature](https://github.com/yourusername/OpenDialer/issues) · [Discussions](https://github.com/yourusername/OpenDialer/discussions)

</div>
