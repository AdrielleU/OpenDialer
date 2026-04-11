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

**This is NOT an AI voice agent.** This is a classic power dialer built for teams:

- 👥 **Multi-user team dialing** — multiple operators share a campaign queue, system dials in parallel
- 🔀 **Parallel dialing** — dials 3x the number of available operators simultaneously
- 🎯 **Auto-routing** — human-answered calls auto-route to the first available operator (FIFO fairness)
- 🤖 **Answering Machine Detection (AMD)** — automatically detects voicemail vs. human
- 📬 **Pre-recorded voicemail drops** — drops your message after the beep, no operator action needed
- 🛡️ **Failover recording on operator disconnect** — if an operator drops mid-call (browser crash, network glitch, or clicks Leave), a per-campaign "we got cut off, we'll call you right back" recording auto-plays to the contact instead of leaving them with dead air
- 🎙️ **Per-operator recording profiles** — each team member has their own opener & voicemail recordings
- 🎧 **Auto-bridge via WebRTC** — operators are connected into live calls automatically
- ⏭️ **Auto-advance through contact lists** — voicemails are fully automatic
- 🔐 **Auth with optional MFA** — multi-user login, forced password change on first login, optional TOTP MFA, rate-limited login
- 🎫 **Per-operator WebRTC credentials** — each operator gets their own Telnyx SIP identity, auto-provisioned
- 📊 **Analytics & CSV export** — per-campaign and per-operator stats

### 💰 Why?

The biggest savings come from **replacing manual hand-dialing**, not from being cheaper than other paid software. Parallel dialing + auto-routing + AMD-driven voicemail drops mean operators only spend talk-time on each call instead of waiting on hold for the bulk of every call. That cuts FTE hours by ~30%.

**Headline numbers — annual operating cost** for an insurance-billing workflow (~25 min average call, ~60% hold time, $35/hr fully-loaded medical biller):

| Scenario | Manual softphone | OpenDialer self-hosted | Annual savings |
|---|---|---|---|
| **Solo biller** (100 calls/wk) | $87,700 | **$60,500** | **$27,200 (-31%)** |
| **Small team** (300 calls/wk, 3 ops) | $256,300 | **$181,500** | **$74,800 (-29%)** |
| **Mid team** (1,000 calls/wk, 10 ops) | $856,800 | **$605,000** | **$251,800 (-29%)** |

OpenDialer's *software-and-services cost* is tiny — most of those totals are operator salaries, which exist regardless of which dialer you use. The actual OpenDialer infrastructure runs around **$2,300/yr (solo)** to **$22,500/yr (mid team)** for Telnyx voice + DIDs + transcription + VPS:

| Scenario | Telnyx voice | DIDs | VPS | Transcription (optional) | **OpenDialer total** |
|---|---|---|---|---|---|
| Solo (100 calls/wk) | $912/yr | $24/yr | $48/yr | $1,296/yr | **$2,280/yr** |
| Small team (300 calls/wk) | $2,724/yr | $60/yr | $48/yr | $3,900/yr | **$6,732/yr** |
| Mid team (1,000 calls/wk) | $9,096/yr | $240/yr | $240/yr | $13,000/yr | **$22,576/yr** |

vs. competitor software for the same workload:

| Option | Solo (1 op) | Small (3 ops) | Mid (10 ops) | Notes |
|---|---|---|---|---|
| **OpenDialer self-hosted** | **$2,280** | **$6,732** | **$22,576** | Software + telecom only |
| Manual softphone (Bria + DID) | $720 | $720 | $720 | Cheap software, expensive labor |
| Vicidial managed | $5,800 + $1k setup | $11,644 | $29,100 | Open source but ops-heavy |
| Genesys CX 1 | n/a (5-seat min) | $4,900 | $32,400 | No transcription in base tier |
| Five9 Healthcare | n/a (50-seat min) | $97,600 | $97,600 | 50-seat minimum kills SMB |
| Infinitus AI | n/a (enterprise only) | n/a | ~$520k/yr | Full automation, no humans |

You bring your own Telnyx account, pay per-minute (~$0.007/min for outbound). No per-seat fees, no vendor lock-in, no annual contracts. **A $4-7k/month software license replaced by ~$200-1900/month of pay-as-you-go infrastructure.**

For the full pricing methodology, sources, and HIPAA-safe configuration, see [docs/pricing-comparison.md](docs/pricing-comparison.md).

### 🩺 Real-world use cases

OpenDialer is most useful for **B2B outbound calling** where the same script gets repeated dozens of times a day to a small set of business numbers. The original design target is **medical billing and revenue-cycle teams**, where calls to insurance companies and other providers are routine, repetitive, and currently consume hours of staff time per day.

Concrete examples of teams already running this kind of workflow:

- **Insurance claim status follow-up** — billers calling Aetna / Anthem / UnitedHealth / BCBS / Cigna / Humana to chase claim status, denials, and appeal updates. Pre-recorded openers introduce the patient/policy/claim numbers, the operator takes over for clarification when needed.
- **Eligibility & benefits verification** — calling payer customer service for cases EDI 270/271 doesn't fully cover (out-of-network providers, complex benefit lookups, prior auth status).
- **Prior authorization tracking** — repetitive callbacks to payer prior-auth lines waiting for status updates on submitted requests.
- **Provider-to-provider coordination** — referring offices calling specialists to coordinate care, request medical records, or schedule consults.
- **Pharmacy & DME follow-up** — calling pharmacies, DME suppliers, and lab partners to coordinate prescriptions, equipment delivery, and test results.
- **Outbound sales to verified business contacts** with prior consent — SDR teams calling lists of opted-in B2B leads for warm outreach.

What it is **not** designed for: cold-calling consumers, dropping voicemails to residential numbers without consent, or any other use case that triggers TCPA's residential / cell-phone prerecorded-voice rules. See the [Compliance & Legal](#%EF%B8%8F-compliance--legal) section.

---

## ✨ Features

### 📋 Campaign Management
Create calling campaigns with contact lists, opener recordings, and voicemail drops. Set your caller ID, assign recordings, and track campaign progress in real time.

### 👥 Contact Management
- **CSV import** — upload contacts with name, phone, company, email, notes
- **Manual entry** — add contacts one by one
- **Status tracking** — pending, voicemail left, connected, callback, not interested, DNC

### 🎵 Recording Management
Upload MP3/WAV files for opener messages, voicemail drops, and failover (operator-disconnect) messages. Preview recordings in-browser. A/B test different messages across campaigns.

### 📞 Power Dialer (Team Mode)
The main screen — your team sits with headsets on:
- **Parallel dialing** — system dials 3x the number of available operators simultaneously
- **Voicemails are automatic** — AMD detects, waits for beep, drops recording, hangs up, dials more
- **Auto-routing** — when a human answers, the call is automatically routed to the first available operator
- **Auto-bridge** — operator's WebRTC audio is bridged into the live call automatically (no manual "Jump In" needed in team mode)
- **Waiting queue** — if all operators are busy, human-answered calls hold until someone is free
- **Wrap-up flow** — after a call ends, operator enters wrap-up (notes/disposition), then sets available for the next call
- **Pause/Resume/Stop** — admin controls the session; operators join/leave individually

### 👤 Team Management
- **Roles** — admin (manage team, campaigns, start/stop sessions) and operator (join sessions, take calls)
- **Admin Team page** — invite operators by email, assign roles, reset passwords, remove members
- **First-login wizard** — new operators must change their temporary password and set up MFA before using the app

### 🎙️ Recording Profiles
- **Per-operator profiles** — each team member creates named profiles (e.g., "Cold Outreach", "Follow Up")
- **Opener + voicemail combo** — each profile pairs an opener recording with a voicemail drop
- **Activate before dialing** — switch profiles depending on the campaign or call type
- Campaign recordings serve as the default; operator profiles override when bridged

### 📊 Analytics & Export
- Campaign stats: total calls, connects, voicemails, talk time, connect rate
- Per-operator breakdown: calls handled, connects, avg talk time
- Contact progress: visual breakdown by status
- Call disposition: breakdown with percentages
- **CSV export**: contacts, call logs, campaign summaries — import into any CRM or spreadsheet

### Call Transcription
Three modes per campaign — see [docs/transcription.md](docs/transcription.md) for full details:
- **Off** — no transcription. $0. Recordings still saved.
- **Live (real-time)** — stream during the call. ~$0.025/min via Telnyx, or BYO STT (Deepgram, AssemblyAI, self-hosted Whisper). Best for live coaching.
- **After call (batch)** — transcribe the recording after hangup. **~$0.006/min via OpenAI Whisper API or $0 via self-hosted Whisper.** Best for review/audit. **76% cheaper than real-time.**

**Re-transcribe button** — every call has a "Re-transcribe" button on the Transcription page that re-runs STT against the saved recording. Useful if a job fails, the server restarts mid-transcription, or you upgrade to a better Whisper model and want to re-run old calls.

For HIPAA workflows, use the self-hosted Whisper option **plus** set `RECORDING_STORAGE=local` so audio is downloaded into the persistent `uploads/` volume on your own server instead of staying on Telnyx's CDN. Audio then never leaves your infrastructure end-to-end.

### Authentication & Security
- **Multi-user auth** — email + password login with bcrypt hashing, admin and operator roles
- **Optional MFA** — TOTP two-factor authentication on first login (Google Authenticator, Authy, 1Password, etc.) — controlled via `REQUIRE_MFA` (default: off)
- **Rate limiting** — login endpoints rate-limited to 5 attempts per 30 seconds via `@fastify/rate-limit`
- **First-login setup** — temporary password from admin → forced change on first login
- **WorkOS SSO** — optional Google, GitHub, or SAML login via WorkOS
- **Session-based** — 24-hour session cookie, sign out anytime from the sidebar
- **Webhook verification** — Telnyx Ed25519 signature verification on incoming webhooks (optional, enable via `TELNYX_PUBLIC_KEY`)
- **Per-operator SIP credentials** — each operator gets their own Telnyx Telephony Credential, auto-provisioned on user creation

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
| 3c | AMD unsure | `call.machine.detection.ended` (result=not_sure) | Treat as human with warning, play opener |
| 3d | AMD times out (>35s) | *(no event — server timeout)* | Treat as human with warning |
| 4 | Voicemail beep detected | `call.machine.greeting.ended` | Play voicemail drop recording |
| 5 | Recording finishes playing | `call.playback.ended` | If voicemail → hang up → dial next. If opener → wait for user |
| 6 | User clicks "Jump In" | REST API call | Bridge user's WebRTC audio into the live call |
| 6b | Transcription (if enabled) | `call.transcription` | Store transcript line, broadcast to UI |
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

### 1. Download & Configure

**Option A — Git clone (recommended):**
```bash
git clone https://github.com/yourusername/OpenDialer.git
cd OpenDialer
```

**Option B — Download ZIP (no Git required):**
1. Go to the [GitHub repo](https://github.com/yourusername/OpenDialer)
2. Click the green **Code** button → **Download ZIP**
3. Extract the ZIP to a folder (e.g., `C:\Users\you\OpenDialer` on Windows or `~/OpenDialer` on Mac)

**Configure your `.env` file:**

1. Find the file `.env.example` in the project folder
2. Copy it and rename the copy to `.env`
   - **Windows:** Right-click → Copy → Paste → Rename to `.env`
   - **Mac/Linux:** `cp .env.example .env`
3. Open `.env` in any text editor (Notepad, VS Code, TextEdit) and fill in your Telnyx credentials:

```env
TELNYX_API_KEY=KEY_your_key_here
TELNYX_CONNECTION_ID=your_connection_id
TELNYX_PHONE_NUMBER=+1your_number
WEBHOOK_BASE_URL=https://your-public-url

# Admin account (created on first startup — must change password on first login)
DEFAULT_ADMIN_PASSWORD=changeme
DEFAULT_ADMIN_EMAIL=admin@yourcompany.com

# Database — local SQLite (default) or external libSQL
DATABASE_URL=./data/opendialer.db
```

### 2. Run with Docker Desktop

Make sure **Docker Desktop is running** (you should see the whale icon in your taskbar/menu bar).

Open a terminal in the project folder and run:

```bash
docker compose up --build
```

> **Windows tip:** In File Explorer, navigate to the OpenDialer folder, click the address bar, type `cmd`, and press Enter. This opens a terminal in the right directory.
>
> **Mac tip:** Right-click the folder in Finder → **Services** → **New Terminal at Folder**.

The first build takes a few minutes. When you see output like:
```
opendialer-app-1  | Server listening on port 3000
```

You're ready. Open **http://localhost:3000** in your browser.

### 3. Managing with Docker Desktop (after first run)

Once the containers are running, you can manage everything from the **Docker Desktop dashboard**:

```
Docker Desktop → Containers
  [▼] opendialer                    Running    [■ Stop] [↻ Restart]
      ├── opendialer-app-1          Running    3000:3000  🔗
      └── opendialer-tunnel-1       Running               (if tunnel enabled)
```

- **Start/Stop** — Click the Stop or Play button on the stack. No terminal needed after first run
- **Open the app** — Click the **port link** (`3000:3000`) next to the app container — it opens `http://localhost:3000` in your browser
- **View logs** — Click any container name to see live logs in the Logs tab
- **Terminal access** — Click a container → Terminal tab to open a shell inside the container
- **Restart after .env changes** — Stop the stack, then Start it again from the dashboard

### 4. Public URL for Webhooks

Telnyx needs to reach your server to send call events. For local development, use [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/) (free, no account needed):

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

For contributors or developers who want to work on the code:

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

### Step 0: Create Your Admin Account

On first launch, OpenDialer creates a default admin from your `DEFAULT_ADMIN_PASSWORD` env var:

1. **Login** with your email and the default password
2. **Change your password** (forced on first login)
3. If `REQUIRE_MFA=true`, **set up MFA** — scan the QR code with your authenticator app
4. You're in! Go to the **Team** page to invite operators

On future visits, sign in with your email + password (+ MFA code if enabled).

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

### Step 5: Start Dialing (Team Mode)

**Admin:**
1. Go to the **Dialer** page, select a campaign, click **Start Calling**
2. The system begins dialing contacts from the queue

**Operators:**
1. Go to the **Dialer** page and click **Join Session**
2. **Put on your headset** — your browser connects via WebRTC
3. The system dials 3x the number of available operators simultaneously
4. Sit back — calls are routed to you automatically:

| What you see | What's happening | What to do |
|-------------|------------------|------------|
| **Available** | You're in the queue, system is dialing | Wait for a human |
| **Voicemail (auto)** | Machine detected → auto-drops voicemail → auto-dials more | Nothing — fully automatic |
| **Call Routed!** | A human answered and you've been selected | You're auto-bridged — talk! |
| **You are LIVE** | Your mic is connected to the contact | Have the conversation |
| **Wrap-up** | Call ended, enter notes/disposition | Click **Done** to go back to available |
| **Waiting for Operator** | Human on the line but all operators busy | Finish your call, the waiting call routes next |

5. **Admin** can **Pause/Resume/Stop** the session. Operators can **Leave** individually
6. After each call, you enter **wrap-up** to log notes, then click **Set Available** for the next one

### Solo Mode (Single Operator)

If only one operator is in the session, it behaves like a traditional power dialer:
- One call at a time, sequential auto-advance
- Manual **Jump In** button when a human answers
- Same voicemail automation

### Step 6: Review Results

1. Go to the **Analytics** page to see campaign stats: total calls, connect rate, voicemails dropped
2. Use **Export CSV** to download contacts, call logs, or a campaign summary for your CRM

### How Calls Work Under the Hood

- **Outbound calls** are placed via Telnyx's REST Call Control API — your server controls the call
- **Your audio** (when you Jump In) goes through WebRTC in your browser via the `@telnyx/webrtc` SDK
- **Bridging** connects the two call legs together so you and the contact can hear each other
- **Transcription** — if enabled on the campaign, real-time transcription auto-starts when you bridge in. Transcripts are stored per call and viewable on the Transcription page
- **AMD error handling** — `not_sure` results are treated as human with a warning; a 35s timeout catches cases where AMD detection never fires
- **State is in-memory** — if the server restarts during a session, active calls are orphaned. The contact list, logs, and transcripts are persisted in the database

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
│  │  Parallel Dialing Engine   │  │  ← Team queue, multi-line, auto-route
│  └────────────────────────────┘  │
│  ┌────────────────────────────┐  │
│  │  Provider Abstraction      │  │  ← Telnyx now, Twilio later
│  └────────────────────────────┘  │
│  ┌────────────────────────────┐  │
│  │  Analytics + CSV Export    │  │  ← Stats, reports, data export
│  └────────────────────────────┘  │
│                                  │
│  SQLite / libSQL (Drizzle ORM)   │  ← Local file or external DB
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
| Database | SQLite or remote libSQL via Drizzle ORM (8 tables) | Local file or external DB — set via env var |
| Auth | bcrypt + TOTP (otplib) + @fastify/rate-limit + optional WorkOS SSO | Multi-user with roles, optional MFA, rate-limited |
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
│   │   │   │   ├── schema.ts    # Drizzle ORM tables (8 tables)
│   │   │   │   ├── index.ts     # Database connection (local SQLite or remote libSQL)
│   │   │   │   ├── migrate.ts   # Auto-migration on startup
│   │   │   │   └── seed.ts      # Auto-create admin from DEFAULT_ADMIN_PASSWORD
│   │   │   ├── routes/
│   │   │   │   ├── auth.ts      # Login, MFA, password change, WorkOS SSO
│   │   │   │   ├── users.ts     # User CRUD (admin only)
│   │   │   │   ├── campaigns.ts # Campaign CRUD
│   │   │   │   ├── contacts.ts  # Contact CRUD + bulk import
│   │   │   │   ├── recordings.ts# File upload + management
│   │   │   │   ├── recording-profiles.ts # Per-user recording profiles
│   │   │   │   ├── transcripts.ts# Transcript history per call/campaign
│   │   │   │   ├── settings.ts  # Key-value settings store
│   │   │   │   ├── dialer.ts    # Start/stop/join/leave/available/wrap-up/jump-in
│   │   │   │   └── analytics.ts # Stats + CSV export endpoints
│   │   │   ├── webhooks/
│   │   │   │   └── telnyx.ts    # ← THE BRAIN: per-call state machine + auto-routing
│   │   │   ├── dialer/
│   │   │   │   ├── engine.ts    # Parallel dialing, batch dial, call routing
│   │   │   │   ├── team-state.ts# TeamSession: operators, in-flight calls, waiting queue
│   │   │   │   ├── state.ts     # Legacy single-user session (backward compat)
│   │   │   │   └── bridge.ts    # Per-operator WebRTC bridge
│   │   │   ├── providers/
│   │   │   │   ├── types.ts     # TelephonyProvider interface
│   │   │   │   ├── telnyx.ts    # Telnyx implementation
│   │   │   │   └── twilio.ts    # Twilio stub (future)
│   │   │   └── ws/
│   │   │       └── index.ts     # SSE per-user targeted broadcasting
│   │   └── drizzle/             # Generated SQL migrations
│   │
│   └── web/                     # React frontend
│       ├── src/
│       │   ├── App.tsx          # Router + layout
│       │   ├── pages/
│       │   │   ├── Login.tsx    # Email+password login, first-login wizard
│       │   │   ├── Dialer.tsx   # Main softphone UI (3-panel)
│       │   │   ├── Campaigns.tsx# Campaign builder
│       │   │   ├── Contacts.tsx # Contact list + CSV upload
│       │   │   ├── Recordings.tsx# Upload + playback
│       │   │   ├── Transcription.tsx # Transcription config + history viewer
│       │   │   ├── Team.tsx     # Admin user management (invite, roles, reset pw)
│       │   │   ├── Analytics.tsx# Stats dashboard + CSV export
│       │   │   └── Settings.tsx # API key configuration
│       │   ├── components/
│       │   │   ├── Layout.tsx       # Sidebar nav with role-based items
│       │   │   ├── OperatorStatusPanel.tsx # Live operator status (admin view)
│       │   │   └── IncomingCallCard.tsx    # Incoming call notification (operator view)
│       │   ├── hooks/
│       │   │   ├── useWebSocket.ts  # SSE hook (EventSource) — tracks operators, routed calls
│       │   │   └── useTelnyxClient.ts # WebRTC SDK hook with per-operator credentials
│       │   └── lib/
│       │       └── api.ts       # Typed API client
│       └── nginx.conf           # Production reverse proxy
```

### Database Schema

8 tables, all managed by Drizzle ORM with auto-migration:

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `settings` | Key-value config store | API keys, webhook URL, provider |
| `users` | Team members | email, name, passwordHash, mfaSecret, role, sipUsername, sipPassword |
| `campaigns` | Calling campaigns | name, caller ID, opener/voicemail/failover recording IDs, transcription config, status |
| `contacts` | Contact lists per campaign | name, phone (E.164), company, status |
| `recordings` | Uploaded audio files | name, type (opener/voicemail), file path, userId |
| `recording_profiles` | Per-user recording combos | userId, opener + voicemail IDs, isDefault |
| `call_logs` | Call history | operatorId, disposition, talkTimeSeconds, duration |
| `transcripts` | Call transcription lines | call log ID, speaker, content, confidence |

### API Endpoints

🔒 = admin role required. All `/api/*` routes (except `/api/auth/*` and `/api/health`) require an authenticated session.

| Method | Endpoint | Description |
|--------|----------|-------------|
| | **Auth** | |
| `GET` | `/api/auth/status` | Auth status (mode, user, logged in) |
| `POST` | `/api/auth/login` | Login with email + password |
| `POST` | `/api/auth/login/mfa` | MFA verification step |
| `POST` | `/api/auth/change-password` | Change password (first-login or voluntary) |
| `GET` | `/api/auth/mfa-setup` | Get MFA QR code |
| `POST` | `/api/auth/verify-mfa` | Verify MFA setup code |
| `GET` | `/api/auth/workos` | Redirect to WorkOS SSO |
| `GET` | `/api/auth/workos/callback` | WorkOS SSO callback |
| `POST` | `/api/auth/logout` | Sign out, clear session |
| | **Users** | |
| `GET` | `/api/users/me` | Current user profile (any authenticated user) |
| `GET` | `/api/users` 🔒 | List all users |
| `POST` | `/api/users` 🔒 | Create user |
| `PUT` | `/api/users/:id` 🔒 | Update user |
| `DELETE` | `/api/users/:id` 🔒 | Delete user |
| `POST` | `/api/users/:id/reset-password` 🔒 | Reset user password |
| | **Campaigns** | |
| `GET` | `/api/campaigns` | List campaigns with contact counts |
| `GET` | `/api/campaigns/:id` | Get a single campaign |
| `POST` | `/api/campaigns` | Create campaign |
| `PUT` | `/api/campaigns/:id` | Update campaign |
| `DELETE` | `/api/campaigns/:id` | Delete campaign (cascades to contacts) |
| | **Contacts** | |
| `GET` | `/api/contacts?campaignId=X` | List contacts (optionally filtered by campaign) |
| `GET` | `/api/contacts/:id` | Get single contact |
| `POST` | `/api/contacts` | Create single contact |
| `POST` | `/api/contacts/bulk` | Bulk import contacts (JSON) |
| `PUT` | `/api/contacts/:id` | Update contact (e.g. status, notes) |
| `DELETE` | `/api/contacts/:id` | Delete contact |
| | **Recordings & Profiles** | |
| `GET` | `/api/recordings?type=opener\|voicemail` | List recordings (optionally filtered) |
| `POST` | `/api/recordings` | Upload audio file (multipart) |
| `DELETE` | `/api/recordings/:id` | Delete a recording |
| `GET` | `/api/recording-profiles` | List user's recording profiles |
| `POST` | `/api/recording-profiles` | Create profile |
| `PUT` | `/api/recording-profiles/:id` | Update profile |
| `PUT` | `/api/recording-profiles/:id/activate` | Set profile as active |
| `DELETE` | `/api/recording-profiles/:id` | Delete profile |
| | **Dialer** | |
| `POST` | `/api/dialer/start` 🔒 | Start dialing session |
| `POST` | `/api/dialer/stop` 🔒 | Stop session |
| `POST` | `/api/dialer/pause` 🔒 | Pause auto-advance |
| `POST` | `/api/dialer/resume` 🔒 | Resume auto-advance |
| `POST` | `/api/dialer/join` | Operator joins session |
| `POST` | `/api/dialer/leave` | Operator leaves session |
| `POST` | `/api/dialer/register-webrtc` | Register operator's WebRTC leg |
| `POST` | `/api/dialer/set-available` | Operator ready for next call |
| `POST` | `/api/dialer/set-wrap-up` | Operator in wrap-up mode |
| `POST` | `/api/dialer/jump-in` | Manual bridge into call |
| `POST` | `/api/dialer/stop-and-talk` | Stop playback and unmute operator |
| `POST` | `/api/dialer/play-recording` | Soundboard — play a recording into the live call (assigned operator only) |
| `POST` | `/api/dialer/speak` | TTS — speak text into the live call (assigned operator only) |
| `POST` | `/api/dialer/skip` | Skip/hangup a call |
| `GET` | `/api/dialer/status` | Team session status (operators, in-flight calls) |
| `GET` | `/api/dialer/webrtc-credentials` | Get operator's SIP credentials for WebRTC |
| | **Analytics & Export** | |
| `GET` | `/api/analytics/campaigns/:id/stats` | Campaign statistics |
| `GET` | `/api/analytics/campaigns/:id/export/contacts` | Export contacts CSV |
| `GET` | `/api/analytics/campaigns/:id/export/calls` | Export call logs CSV |
| `GET` | `/api/analytics/export/summary` | Export all campaigns CSV |
| | **Transcripts** | |
| `GET` | `/api/transcripts?callLogId=X` | Get transcripts for a call |
| `GET` | `/api/transcripts/campaign/:id` | Get all transcripts for a campaign |
| `DELETE` | `/api/transcripts/:id` | Delete a transcript line |
| `POST` | `/api/transcripts/retranscribe` | Re-run STT against a call's saved recording |
| | **Settings** | |
| `GET` | `/api/settings` 🔒 | Get all settings as key-value object |
| `PUT` | `/api/settings` 🔒 | Upsert settings (whitelisted keys only) |
| `GET` | `/api/settings/health` 🔒 | Provider connectivity check |
| | **Integrations** | |
| `GET` | `/api/integrations/hubspot/test` | Test HubSpot connection |
| `POST` | `/api/integrations/hubspot/import` | Import contacts from HubSpot into a campaign |
| `POST` | `/api/integrations/hubspot/log-call` | Push a call log to HubSpot |
| `POST` | `/api/integrations/webhook/test` | Send a test event to the configured outbound webhook |
| | **System** | |
| `GET` | `/api/health` | Health check (no auth) |
| `POST` | `/webhooks/telnyx` | Telnyx webhook receiver (signature verified) |
| `GET` | `/events` | SSE stream (per-user targeted) |

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

### Database Options

OpenDialer supports local SQLite (default) or any external libSQL-compatible database. Set via environment variables — no code changes needed.

| Option | `DATABASE_URL` | Notes |
|--------|---------------|-------|
| **Local SQLite** (default) | `./data/opendialer.db` | Zero config, data in Docker volume |
| **External libSQL** | `libsql://your-db.example.com` | Set `DATABASE_AUTH_TOKEN` too |

The app auto-detects the URL format and connects accordingly. Migrations run the same way on both.

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
- [x] Local SQLite or external libSQL database support
- [x] Multi-user team dialing with parallel lines (3x operators)
- [x] Auto-routing and auto-bridge for human-answered calls
- [x] Users, roles (admin/operator), team management
- [x] Per-operator recording profiles
- [x] First-login wizard (forced password change + MFA)
- [x] Multi-user auth with bcrypt + TOTP MFA + optional WorkOS SSO
- [x] Telnyx webhook Ed25519 signature verification
- [x] AMD error handling (`not_sure`, timeout fallback)
- [x] [Call transcription — Telnyx built-in](docs/transcription.md) (real-time, 4 engines, per-campaign config)
- [ ] Call transcription — BYO STT via media streaming ([design doc](docs/transcription.md))
- [ ] Twilio as second provider (interface stubbed, not implemented)
- [ ] HubSpot contact import + activity sync
- [ ] Call recording playback in-app
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

## ⚖️ Compliance & Legal

> **Read this before pointing OpenDialer at a real phone number.**

OpenDialer is **software**, not a service or a legal product. The maintainers and contributors do not run the calls, do not see the data, and have **no relationship with the people you call**. Everything you do with this tool is your own responsibility under your own jurisdiction's laws.

### No warranty, no liability

This project is licensed under **AGPL-3.0**, which includes the standard "AS IS, WITHOUT WARRANTY OF ANY KIND" clause (see the [LICENSE](LICENSE) file). To make the intent unmistakable:

> **The OpenDialer maintainers, contributors, and AIIVARS LLC are not liable for any legal damages, regulatory penalties, fines, civil judgments, or any other consequences arising from your use of this software. You — the operator — are solely responsible for compliance with all applicable laws and regulations in every jurisdiction you make calls into or from.**

This software is provided as a tool. It does not provide legal advice. It does not check your compliance for you. It does not know who you are calling or whether you have permission. **If you operate it, you are the "telemarketer," "seller," "covered entity," or other legally-defined role under whatever rules apply to your situation — not us.**

If you are unsure whether your intended use is lawful, **consult a licensed attorney** in your jurisdiction. A telecom / TCPA attorney for general outbound calling, a healthcare-data attorney if you are handling Protected Health Information.

### What you are responsible for

Depending on your use case, this list may include (but is not limited to):

- **Telephone Consumer Protection Act (TCPA)** compliance, including prior express written consent (PEWC) for any pre-recorded or AI-generated voice content delivered to residential phones or cell phones
- **National Do Not Call Registry** scrubbing for telemarketing calls to residential numbers
- **State mini-TCPA laws** (Florida FTSA, Oklahoma OTSA, Maryland SB 90, Washington CEMA, and others) which may impose stricter rules than federal TCPA
- **Calling-hour restrictions** (federal 8 AM – 9 PM local time, plus stricter state windows)
- **All-party consent recording laws** in CA, CT, DE, FL, IL, MD, MA, MI, MT, NV, NH, OR, PA, VT, WA — playing a "this call may be recorded" disclosure before the recording starts is your responsibility
- **HIPAA Privacy and Security Rules** if you handle Protected Health Information, including obtaining a signed **Business Associate Agreement (BAA) with Telnyx** before any PHI flows through their network
- **STIR/SHAKEN attestation** — using Telnyx-owned caller IDs to maintain A-attestation and avoid spam labeling
- **State and federal debt collection laws** (FDCPA and state equivalents) if used for any kind of collections
- **GDPR / UK GDPR / PIPEDA / state privacy laws** if you call or store data on individuals in those jurisdictions
- **Anti-spam laws** in any country you call into

### What OpenDialer does NOT do for you

- ❌ Does **not** scrub against the federal Do Not Call Registry
- ❌ Does **not** enforce calling-hour restrictions by called party time zone
- ❌ Does **not** verify or store TCPA consent records
- ❌ Does **not** automatically play a recording disclosure before recording starts
- ❌ Does **not** sign Business Associate Agreements on your behalf
- ❌ Does **not** filter PHI from logs, transcripts, or notes
- ❌ Does **not** know what country, state, or jurisdiction the called number belongs to

If any of these matter to you, **you need to handle them outside the dialer** — either by curating your contact list before upload, using your own scrubbing service, configuring operational policies, or modifying the source code (it's open — patches welcome).

### Accept-or-don't-use

By installing, running, or modifying OpenDialer, you accept that:

1. You have read and understood this section.
2. You are responsible for the legality of your calling operation.
3. You will not pursue the maintainers, contributors, or AIIVARS LLC for any consequence of your use of this software.
4. You will obtain independent legal advice for your specific situation before operating this in production.

If you do not accept these terms, do not use this software.

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
