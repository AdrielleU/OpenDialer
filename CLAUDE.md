# CLAUDE.md - OpenDialer

## Project Overview

OpenDialer is an open-source, self-hosted browser-based power dialer for sales teams. Users bring their own Telnyx API keys and pay per-minute instead of per-seat SaaS pricing. It is NOT an AI voice agent — it's a classic power dialer with AMD, voicemail drops, opener playback, live human takeover via WebRTC, and optional call transcription.

## Architecture

- **Monorepo** managed by pnpm workspaces
- **Backend:** `packages/server/` — Fastify 5 + TypeScript 5.7 + Drizzle ORM + libSQL
- **Frontend:** `packages/web/` — React 19 + Vite 6 + Tailwind CSS 4
- **Real-time:** Server-Sent Events (SSE) at `/events` — NOT WebSocket
- **Telephony:** Telnyx SDK with provider abstraction layer (`packages/server/src/providers/`)
- **Database:** Local SQLite (`./data/opendialer.db`) or external libSQL — auto-detected from `DATABASE_URL`, auto-migrated on startup via Drizzle
- **Session state:** In-memory (not persisted) — see `packages/server/src/dialer/state.ts`

## Key Directories

```
packages/server/src/
  routes/        — API endpoints (campaigns, contacts, recordings, settings, dialer, analytics, transcripts)
  webhooks/      — Telnyx webhook handler (call state machine + AMD error handling + transcription)
  dialer/        — Core calling engine, session state, WebRTC bridge (auto-starts transcription on bridge)
  providers/     — Telephony provider abstraction (Telnyx implemented, Twilio stubbed)
  db/            — Drizzle schema (6 tables), client init (local/remote), migrations
  ws/            — SSE broadcaster (file is named ws/ but uses SSE, not WebSocket)

packages/web/src/
  pages/         — Route pages (Dialer, Campaigns, Contacts, Recordings, Transcription, Analytics, Settings)
  hooks/         — useWebSocket (actually EventSource/SSE), useTelnyxClient (WebRTC)
  lib/api.ts     — Typed API client

docs/
  transcription.md — Detailed guide on both transcription approaches (Telnyx built-in + BYO STT)
```

## Development Commands

```bash
pnpm install                              # Install all dependencies
pnpm dev                                  # Run backend (:3000) + frontend (:5173) concurrently
pnpm --filter @opendialer/server dev      # Backend only
pnpm --filter @opendialer/web dev         # Frontend only
pnpm build                                # Build frontend then backend (web first so server can serve it)
pnpm start                                # Production: single server on :3000 serves API + frontend
pnpm -r db:generate                       # Generate Drizzle migrations after schema changes
docker compose up --build                 # Docker deployment — single container on :3000
docker compose --profile tunnel up --build # With Cloudflare Tunnel for webhooks
```

## Single-Port Architecture

In production, Fastify serves both the API and the React frontend from one port (`:3000`). The server detects if `packages/web/dist` exists and serves it via `@fastify/static` with SPA fallback. In dev, Vite's dev server (`:5173`) proxies API calls to Fastify (`:3000`).

## Database

Uses `@libsql/client` which supports both local SQLite and remote libSQL. The `DATABASE_URL` env var controls which:
- Local: `DATABASE_URL=./data/opendialer.db` (default)
- Remote: `DATABASE_URL=libsql://your-db.example.com` + `DATABASE_AUTH_TOKEN=...`

Auto-detected in `packages/server/src/db/index.ts` — URLs starting with `libsql://`, `https://`, or `http://` connect remotely with auth token; everything else creates a local file.

## Code Style

- TypeScript strict mode everywhere
- Prettier: single quotes, semicolons, trailing commas, 100 char width, 2-space indent
- Vitest test suite (31 tests across server + web)
- Zod for runtime validation (env config, request bodies)

## Important Patterns

- **Call state machine** lives in `packages/server/src/webhooks/telnyx.ts` — handles the full call lifecycle from initiation through AMD to hangup, including `not_sure` AMD results and a 35s AMD timeout fallback
- **Auto-advance** logic in `packages/server/src/dialer/engine.ts` — recursive `dialNext()` with 500ms inter-call delay
- **Client state tracking:** JSON payload base64-encoded into Telnyx `client_state` field, echoed back in webhooks for campaign/contact context
- **Provider interface** in `packages/server/src/providers/types.ts` — all telephony calls (dial, hangup, playAudio, bridge, transcription) go through this abstraction
- **Transcription** — auto-starts via Telnyx Call Control when operator bridges in (if enabled per campaign). Webhook `call.transcription` events store transcripts in DB and broadcast via SSE
- **Authentication** — single admin user with password + TOTP MFA. Credentials stored in `settings` table. Session via signed cookie (24h). Auth middleware protects `/api/*` and `/events`; webhooks are unprotected but verified via Ed25519 signature (`TELNYX_PUBLIC_KEY`)
- **Test auth** — tests use dynamic imports in `setup.ts` to avoid ESM import hoisting issues with `DATABASE_URL`. A test session is injected into the in-memory session store

## Environment Setup

Copy `.env.example` to `.env`. Required variables:
- `TELNYX_API_KEY` — API key from Telnyx dashboard
- `TELNYX_CONNECTION_ID` — SIP Connection ID (WebRTC enabled)
- `TELNYX_PHONE_NUMBER` — Purchased number in E.164 format
- `WEBHOOK_BASE_URL` — Public URL for Telnyx to POST webhook events

Optional:
- `DATABASE_URL` — Local path or remote libSQL URL (default: `./data/opendialer.db`)
- `DATABASE_AUTH_TOKEN` — Auth token for remote libSQL databases
- `TELNYX_PUBLIC_KEY` — Base64 Ed25519 public key for webhook signature verification (from Telnyx Mission Control)

## Author

Created by **AdrielleU** | Sponsored by **AIIVARS LLC**

## License

AGPL-3.0
