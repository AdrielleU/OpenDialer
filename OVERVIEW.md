# OpenDialer — Open-Source Self-Hosted Power Dialer

## What We're Building

An open-source, self-hosted browser-based power dialer. Users plug in their own Telnyx or Twilio API keys, upload contacts, upload voicemail recordings, and start dialing — all from the browser with a headset.

**This is NOT an AI voice agent.** This is a classic power dialer with:
- Answering Machine Detection (AMD)
- Pre-recorded voicemail drops
- Pre-recorded opener playback
- Live human takeover from browser via WebRTC
- Auto-advance through contact lists

Think: open-source Orum (which charges $250/user/month) but self-hosted on your own infrastructure at ~$0.01-0.02/min via Telnyx.

---

## Core User Flow

```
User loads contact list (CSV, manual, or CRM sync)
        ↓
User uploads recordings (opener + voicemail drop)
        ↓
User clicks "Start Calling" — wears headset, browser softphone active
        ↓
System dials Contact #1 via Telnyx/Twilio Call Control API
  with Answering Machine Detection enabled
        ↓
┌─────────────────────────────────────────────────┐
│                                                 │
│  VOICEMAIL DETECTED          HUMAN ANSWERS      │
│  → Drop pre-recorded VM      → Play opener      │
│  → Auto-hangup               recording          │
│  → Auto-dial Contact #2      → User reads live   │
│  → User never touched        transcript or       │
│    anything                   hears audio         │
│                              → User clicks        │
│                                "Jump In" to       │
│                                take over call     │
│                              → OR if they hang    │
│                                up, auto-advance   │
│                                to next contact    │
└─────────────────────────────────────────────────┘
```

**Key UX principle:** The user sits with headset on. Voicemails are handled automatically. The user only engages when a live human picks up and they want to take over the conversation.

---

## Tech Stack

| Layer | Tech | Notes |
|-------|------|-------|
| Frontend | React + TypeScript + Tailwind | Browser softphone + campaign dashboard |
| Backend | Node.js (Express or Fastify) | Webhook handler + API |
| Database | SQLite via Drizzle ORM | Zero-config for self-hosters. Swappable to Postgres |
| Telephony | Telnyx Call Control API + Twilio (pluggable) | User brings own API keys |
| Browser Calling | Telnyx WebRTC SDK / Twilio Client SDK | Headset audio in browser |
| Deployment | Docker Compose | One command: `docker compose up` |

---

## Features — MVP (v1)

### 1. Settings / Onboarding
- Settings page where user enters their Telnyx API key, Connection ID, and phone number
- Auto-configures webhook URL (using ngrok or public URL)
- Future: Twilio as second provider option

### 2. Contact Management
- **CSV Upload** — Parse CSV with columns: name, phone, company, email, notes
- **Manual Entry** — Add contacts one by one
- **CRM Import (v2)** — HubSpot, Apollo API integration
- Contacts stored in SQLite, organized by campaign/list
- Status tracking per contact: not called, voicemail left, connected, callback, not interested

### 3. Recording Management
- Upload MP3/WAV files for:
  - **Opener recordings** — Played when a human answers (e.g., "Hi, this is Sarah from...")
  - **Voicemail drops** — Played after voicemail beep detected
- Multiple recordings per campaign for A/B testing
- Recordings stored locally or in cloud storage (S3/R2)

### 4. Campaign Builder
- Create a campaign: name, contact list, opener recording, voicemail recording
- Set parameters: caller ID number, call window hours, max concurrent calls
- Assign recordings to the campaign

### 5. Dialer / Softphone UI
The main screen the user works from:

```
┌──────────────────────────────────────────────────────┐
│  Campaign: "Dental Practices Q2"    [Pause] [Stop]  │
├──────────────┬───────────────────────────────────────┤
│              │                                       │
│  CONTACT     │   CALL STATUS                         │
│  LIST        │                                       │
│              │   Calling: Dr. Smith (602-555-1234)   │
│  ● Dr. Smith │   Status: Ringing...                  │
│  ○ Dr. Jones │                                       │
│  ○ Dr. Lee   │   [🎤 Jump In]  [⏭ Skip]  [📞 End]  │
│  ○ Dr. Park  │                                       │
│  ○ Dr. Chen  │   ─────────────────────────────────   │
│              │   Call Log:                            │
│              │   #1 Dr. Adams — VM dropped            │
│              │   #2 Dr. Baker — No answer             │
│              │   #3 Dr. Clark — Connected 2:34        │
│              │                                       │
└──────────────┴───────────────────────────────────────┘
```

- Left panel: contact queue with status indicators
- Center: current call status, controls
- Call log: rolling history of the session
- **"Jump In" button** — Bridges user's WebRTC audio into the live call, user takes over
- **"Skip" button** — Hangs up current call, advances to next
- **"End" button** — Ends current call

### 6. Auto-Advance Logic
- Voicemail detected → drop recording → hangup → dial next (no user action needed)
- No answer (30s timeout) → dial next
- Human answers → play opener → wait for user to Jump In or call ends → dial next
- Busy signal → dial next
- User can pause auto-advance at any time

### 7. Call Recording & Logging
- All calls recorded via Telnyx Call Recording API
- Store recordings locally with metadata
- Log per call: contact, duration, disposition (VM, connected, no answer), recording URL, timestamp

---

## Architecture

```
┌─────────────────────────────────┐
│         React Dashboard          │
│  (Softphone UI + Campaign Mgmt) │
│  Uses: @telnyx/webrtc SDK        │
└──────────────┬──────────────────┘
               │ WebSocket (call status updates)
               │ REST API (campaigns, contacts, settings)
               │
┌──────────────┴──────────────────┐
│        Node.js Backend           │
│                                  │
│  ┌────────────────────────────┐  │
│  │  Webhook Handler           │  │
│  │  Receives Telnyx events:   │  │
│  │  - call.initiated          │  │
│  │  - call.answered           │  │
│  │  - call.machine.detection  │  │
│  │  - call.machine.greeting   │  │
│  │  -       .ended            │  │
│  │  - call.playback.ended     │  │
│  │  - call.hangup             │  │
│  └────────────────────────────┘  │
│                                  │
│  ┌────────────────────────────┐  │
│  │  Dialer Engine             │  │
│  │  - Initiates calls         │  │
│  │  - Manages call queue      │  │
│  │  - Handles AMD logic       │  │
│  │  - Bridges WebRTC on       │  │
│  │    "Jump In"               │  │
│  └────────────────────────────┘  │
│                                  │
│  ┌────────────────────────────┐  │
│  │  Provider Abstraction      │  │
│  │  - telnyx.ts               │  │
│  │  - twilio.ts (future)      │  │
│  └────────────────────────────┘  │
│                                  │
│  SQLite (contacts, campaigns,    │
│          call logs, settings)    │
└──────────────┬──────────────────┘
               │
               │ REST API calls
               ↓
┌──────────────────────────────────┐
│  Telnyx / Twilio APIs            │
│  - Call Control (dial, playback, │
│    bridge, hangup, AMD)          │
│  - WebRTC (browser audio)        │
│  - Recording storage             │
└──────────────────────────────────┘
```

---

## Webhook Handler — The Brain

This is the most critical piece. It's a Node.js endpoint that receives Telnyx webhook events and decides what to do.

### Event Flow Logic

```
call.initiated
  → Log call start, update UI via WebSocket

call.answered
  → If AMD enabled, wait for detection result
  → If no AMD, play opener recording immediately

call.machine.detection.ended (result: "machine")
  → Wait for call.machine.greeting.ended (beep)

call.machine.greeting.ended
  → Play voicemail drop recording
  → On playback complete → hangup → dial next contact

call.machine.detection.ended (result: "human")
  → Play opener recording
  → Update UI: "Human answered — Ready to Jump In"
  → Wait for user action or call.hangup

call.playback.ended
  → If voicemail context → hangup → dial next
  → If opener context → hold, wait for user

User clicks "Jump In"
  → Backend sends bridge/conference command to Telnyx
  → User's WebRTC leg is connected to the call
  → Operator is now live on the phone

call.hangup
  → Log call result
  → Update contact status
  → Auto-dial next contact in queue
```

---

## Telnyx GitHub Projects to Study

Read these repos before starting — they contain the exact patterns we need:

### 1. AMD Demo (Voicemail Detection + Drop)
**https://github.com/team-telnyx/demo-amd**
- Node.js demo for outbound calls with Answering Machine Detection
- Shows how to detect voicemail, wait for beep, and play a message
- **This is our voicemail drop logic — port this directly**

### 2. WebRTC Demo (Browser Softphone)
**https://github.com/team-telnyx/webrtc-demo-js**
- React/TypeScript app with full dialer interface
- Uses `@telnyx/webrtc` SDK for browser-based calling
- Has call history, audio visualization
- **This is our softphone UI starting point — fork this**

### 3. Find Me / Follow Me IVR Demo (Call Bridging)
**https://github.com/team-telnyx/demo-findme-ivr**
- Node.js demo with call bridging, DTMF input, and voicemail
- Shows how to bridge two call legs together
- **This has the "bridge operator into call" pattern we need for Jump In**

### 4. Node.js Demo Collection
**https://github.com/team-telnyx/demo-node-telnyx**
- Multiple examples: outbound calls, TeXML, DTMF gathering
- Good reference for Telnyx SDK patterns in Node

### 5. Python Call Center Demo
**https://developers.telnyx.com/docs/voice/programmable-voice/call-center**
- Full call center app using TeXML and Python
- Shows SIP connections, WebRTC integration, voicemail
- **Good architectural reference even though we're using Node**

### 6. Telnyx WebRTC NPM Package
**https://www.npmjs.com/package/@telnyx/webrtc**
- Official SDK documentation
- Shows authentication, call management, codec configuration
- **Read this before touching the frontend**

---

## Telnyx API Docs to Read

- **Call Control Overview**: https://developers.telnyx.com/docs/voice/programmable-voice/voice-api-commands-and-resources
- **Answering Machine Detection**: https://telnyx.com/resources/answering-machine-detection-explained
- **AMD API Config**: https://developers.telnyx.com/api/call-control/dial-call (see `answering_machine_detection` param)
- **WebRTC Quickstart**: https://developers.telnyx.com/docs/voice/webrtc
- **VoIP Dialer Use Case**: https://telnyx.com/use-cases/voip-dialer

---

## Contact Import Options

### MVP: CSV Upload
```
name,phone,company,email,notes
Dr. Smith,+16025551234,Smith Dental,smith@example.com,10-person practice
Dr. Jones,+16025555678,Jones Pediatrics,jones@example.com,Referred by Mike
```

Parse with Papaparse on frontend, validate phone numbers (E.164 format), store in SQLite.

### v2: HubSpot Integration
- OAuth2 flow to connect HubSpot account
- Pull contacts from HubSpot lists or saved filters
- Sync call dispositions back to HubSpot as activities
- API: https://developers.hubspot.com/docs/api/crm/contacts

### v2: Apollo Integration
- API key auth
- Pull contacts from Apollo saved searches / lists
- Already in the SDRManager.AI stack
- API: https://apolloio.github.io/apollo-api-docs/

### v2: Manual CRM Webhook
- Generic webhook endpoint that accepts contact JSON
- Any CRM that supports webhooks can push contacts in
- Zapier / Make compatible

---

## Repo Structure

```
opendialer/
├── docker-compose.yml
├── .env.example                    ← All API keys configured here
├── README.md                       ← Setup instructions
├── LICENSE                         ← AGPL-3.0
│
├── packages/
│   ├── server/
│   │   ├── src/
│   │   │   ├── index.ts            ← Express/Fastify entrypoint
│   │   │   ├── webhooks/
│   │   │   │   ├── telnyx.ts       ← Telnyx webhook handler (THE BRAIN)
│   │   │   │   └── twilio.ts       ← Twilio webhook handler (future)
│   │   │   ├── dialer/
│   │   │   │   ├── engine.ts       ← Call queue management, auto-advance
│   │   │   │   └── bridge.ts       ← WebRTC bridge / Jump In logic
│   │   │   ├── providers/
│   │   │   │   ├── telnyx.ts       ← Telnyx API wrapper
│   │   │   │   └── twilio.ts       ← Twilio API wrapper (future)
│   │   │   ├── db/
│   │   │   │   ├── schema.ts       ← Drizzle schema (contacts, campaigns, calls)
│   │   │   │   └── index.ts        ← SQLite connection
│   │   │   ├── ws/
│   │   │   │   └── index.ts        ← WebSocket server (push call status to UI)
│   │   │   └── routes/
│   │   │       ├── campaigns.ts
│   │   │       ├── contacts.ts
│   │   │       ├── recordings.ts
│   │   │       └── settings.ts
│   │   ├── uploads/                ← User-uploaded recordings stored here
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── web/
│       ├── src/
│       │   ├── App.tsx
│       │   ├── pages/
│       │   │   ├── Dialer.tsx      ← Main dialer/softphone screen
│       │   │   ├── Campaigns.tsx   ← Campaign builder
│       │   │   ├── Contacts.tsx    ← Contact list + CSV upload
│       │   │   ├── Recordings.tsx  ← Upload/manage audio files
│       │   │   └── Settings.tsx    ← API keys, provider config
│       │   ├── components/
│       │   │   ├── Softphone.tsx   ← WebRTC softphone component
│       │   │   ├── ContactList.tsx
│       │   │   ├── CallStatus.tsx
│       │   │   └── CallLog.tsx
│       │   └── hooks/
│       │       ├── useTelnyxClient.ts  ← WebRTC SDK hook
│       │       └── useCallStatus.ts    ← WebSocket hook for live updates
│       ├── package.json
│       └── tsconfig.json
│
└── docs/
    ├── setup-telnyx.md             ← How to configure Telnyx account
    ├── setup-twilio.md             ← How to configure Twilio account
    └── architecture.md             ← Technical deep dive
```

---

## Database Schema (SQLite / Drizzle)

```sql
-- Provider settings
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Campaigns
CREATE TABLE campaigns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  caller_id TEXT NOT NULL,          -- Telnyx phone number to dial from
  opener_recording_id INTEGER,      -- FK to recordings
  voicemail_recording_id INTEGER,   -- FK to recordings
  status TEXT DEFAULT 'draft',      -- draft, active, paused, completed
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Contacts
CREATE TABLE contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id INTEGER NOT NULL,
  name TEXT,
  phone TEXT NOT NULL,               -- E.164 format
  company TEXT,
  email TEXT,
  notes TEXT,
  status TEXT DEFAULT 'pending',     -- pending, voicemail, connected, no_answer, callback, not_interested, dnc
  call_count INTEGER DEFAULT 0,
  last_called_at DATETIME,
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id)
);

-- Recordings (opener + voicemail drops)
CREATE TABLE recordings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  type TEXT NOT NULL,                -- 'opener' or 'voicemail'
  file_path TEXT NOT NULL,
  duration_seconds INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Call logs
CREATE TABLE call_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id INTEGER NOT NULL,
  contact_id INTEGER NOT NULL,
  telnyx_call_control_id TEXT,
  started_at DATETIME,
  ended_at DATETIME,
  duration_seconds INTEGER,
  disposition TEXT,                   -- voicemail, connected, no_answer, busy, failed
  recording_url TEXT,
  human_took_over BOOLEAN DEFAULT FALSE,
  notes TEXT,
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id),
  FOREIGN KEY (contact_id) REFERENCES contacts(id)
);
```

---

## .env.example

```bash
# Telephony Provider (telnyx or twilio)
PROVIDER=telnyx

# Telnyx
TELNYX_API_KEY=KEY_xxx
TELNYX_CONNECTION_ID=xxx
TELNYX_PHONE_NUMBER=+1xxxxxxxxxx

# Twilio (future)
# TWILIO_ACCOUNT_SID=xxx
# TWILIO_AUTH_TOKEN=xxx
# TWILIO_PHONE_NUMBER=+1xxxxxxxxxx

# Webhook (your public URL for Telnyx to send events to)
WEBHOOK_BASE_URL=https://your-domain.com

# App
PORT=3000
DATABASE_URL=./data/opendialer.db
```

---

## Build Priority

### Phase 1 — Core Dialer (Week 1-2)
1. Telnyx webhook handler with AMD logic
2. Basic dialer engine (queue management, auto-advance)
3. Softphone UI with WebRTC (fork `webrtc-demo-js`)
4. "Jump In" bridge functionality
5. SQLite database setup

### Phase 2 — Campaign Management (Week 3)
1. Contact CSV upload + list management
2. Recording upload (opener + voicemail)
3. Campaign builder (assign contacts + recordings)
4. Call log / history view

### Phase 3 — Polish (Week 4)
1. Call recording playback
2. Contact status tracking + disposition
3. Session stats (calls made, VMs dropped, connects, talk time)
4. Docker Compose packaging
5. README + setup docs

### Phase 4 — Integrations (v2)
1. Twilio as second provider
2. HubSpot contact import + activity sync
3. Apollo contact import
4. Webhook endpoint for generic CRM push

---

## Competitive Landscape

| Product | Price | What They Do | What We Do Different |
|---------|-------|-------------|---------------------|
| Orum | $250/user/mo | Parallel dialer, AMD, virtual salesfloor | Self-hosted, $0.01/min, open-source |
| Nooks | $200+/user/mo | AI dialer + virtual salesfloor | No vendor lock-in, BYOK telephony |
| PhoneBurner | $140/user/mo | Power dialer + voicemail drop | Open-source, no subscription |
| Kixie | $95/user/mo | Power dialer + CRM integration | Self-hosted, fraction of cost |
| JustCall | $49/user/mo | Cloud dialer | Full control, no per-seat pricing |

---

## License

**AGPL-3.0** — Anyone can self-host and modify. If they offer it as a hosted service, they must open-source their changes. This protects the commercial offering (SDRManager.AI) while keeping the community version truly open.

---

## Links

- Telnyx Developer Docs: https://developers.telnyx.com
- Telnyx WebRTC SDK: https://www.npmjs.com/package/@telnyx/webrtc
- Telnyx GitHub: https://github.com/team-telnyx
- Drizzle ORM: https://orm.drizzle.team
- Docker Compose: https://docs.docker.com/compose