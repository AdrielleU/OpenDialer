# CLAUDE.md - OpenDialer

## Project Overview

OpenDialer is an open-source, self-hosted browser-based power dialer for sales teams. Competes with Orum ($250/user/mo) at a fraction of the cost. Users bring their own Telnyx API keys and pay per-minute instead of per-seat SaaS pricing. Features multi-user team dialing with parallel lines, auto-routing, AMD, voicemail drops, opener playback, live operator bridge via WebRTC, and optional call transcription.

## Architecture

- **Monorepo** managed by pnpm workspaces
- **Backend:** `packages/server/` — Fastify 5 + TypeScript 5.7 + Drizzle ORM + libSQL
- **Frontend:** `packages/web/` — React 19 + Vite 6 + Tailwind CSS 4
- **Real-time:** Server-Sent Events (SSE) at `/events` — per-user targeted broadcasting, NOT WebSocket
- **Telephony:** Telnyx SDK with provider abstraction layer (`packages/server/src/providers/`)
- **Database:** Local SQLite (`./data/opendialer.db`) or external libSQL — auto-detected from `DATABASE_URL`, auto-migrated on startup via Drizzle
- **Session state:** In-memory `TeamSession` (not persisted) — see `packages/server/src/dialer/team-state.ts`
- **Auth:** Multi-user with bcrypt passwords, TOTP MFA, roles (admin/operator), optional WorkOS SSO

## Key Directories

```
packages/server/src/
  routes/        — API endpoints (auth, users, campaigns, contacts, recordings,
                   recording-profiles, settings, dialer, analytics, transcripts)
  webhooks/      — Telnyx webhook handler (call state machine + AMD + transcription)
  dialer/        — Parallel dialing engine, team session state, operator bridge
  providers/     — Telephony provider abstraction (Telnyx implemented, Twilio stubbed)
  db/            — Drizzle schema (8 tables), client init (local/remote), migrations, seed
  ws/            — SSE broadcaster with per-user targeting

packages/web/src/
  pages/         — Route pages (Dialer, Campaigns, Contacts, Recordings,
                   Transcription, Team, Analytics, Settings, Login)
  hooks/         — useWebSocket (SSE with operator/call tracking), useTelnyxClient (WebRTC per-operator)
  components/    — Layout with role-based nav, OperatorStatusPanel, IncomingCallCard
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
pnpm test                                 # Run all tests (85 tests across server + web)
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

Auto-detected in `packages/server/src/db/index.ts`. 8 tables: settings, users (with SIP credentials), campaigns, contacts, recordings, recording_profiles, call_logs, transcripts.

## Code Style

- TypeScript strict mode everywhere
- Prettier: single quotes, semicolons, trailing commas, 100 char width, 2-space indent
- Vitest test suite (85 tests across server + web)
- Zod for runtime validation (env config, request bodies)

## Important Patterns

- **Parallel dialing engine** in `packages/server/src/dialer/engine.ts` — `dialNextBatch()` dials N lines simultaneously (3x available operators), auto-routes human-answered calls to first available operator via FIFO fairness
- **Team session state** in `packages/server/src/dialer/team-state.ts` — `TeamSession` tracks operators (availability, WebRTC legs), in-flight calls (per callControlId), waiting queue, parallel line count
- **Call routing** — when AMD detects human, `routeToOperator()` finds FIFO-longest-waiting available operator, auto-bridges their WebRTC leg, sends targeted SSE event. If no operator available, call enters waiting queue
- **Call state machine** in `packages/server/src/webhooks/telnyx.ts` — per-call state tracking (not global), AMD `not_sure` handling, 35s AMD timeout per call (Map-based)
- **Client state tracking:** JSON payload base64-encoded into Telnyx `client_state` field, echoed back in webhooks for campaign/contact context
- **Provider interface** in `packages/server/src/providers/types.ts` — all telephony calls (dial, hangup, playAudio, bridge, transcription) go through this abstraction
- **Transcription** — auto-starts via Telnyx Call Control when operator bridges in (if enabled per campaign)
- **Authentication** — multi-user with bcrypt passwords + optional TOTP MFA. First-login wizard forces password change + MFA setup (if `REQUIRE_MFA=true`). Roles: admin (manage team, start/stop sessions) and operator (join sessions, take calls). Optional WorkOS SSO. Rate-limited login (5 attempts/30s via `@fastify/rate-limit`)
- **Per-operator WebRTC credentials** — each operator gets their own Telnyx Telephony Credential (SIP username/password) provisioned via `POST /v2/telephony_credentials`. Stored on the users table (`sipUsername`, `sipPassword`, `telnyxCredentialId`). Lazy provisioning via `GET /api/dialer/webrtc-credentials` for users created before this feature. Credentials are deleted from Telnyx when the user is deleted
- **SSE targeting** in `packages/server/src/ws/index.ts` — `broadcast()` for team events, `broadcastToUser(userId)` for targeted events (call routing, transcription)
- **Test auth** — tests use dynamic imports in `setup.ts` to avoid ESM import hoisting issues with `DATABASE_URL`. A real admin user is created in the test DB, and a test session with that user's ID is injected

## Environment Setup

Copy `.env.example` to `.env`. Required variables:
- `TELNYX_API_KEY` — API key from Telnyx dashboard
- `TELNYX_CONNECTION_ID` — SIP Connection ID (WebRTC enabled)
- `TELNYX_PHONE_NUMBER` — Purchased number in E.164 format
- `WEBHOOK_BASE_URL` — Public URL for Telnyx to POST webhook events

Auth:
- `DEFAULT_ADMIN_PASSWORD` — password for auto-created admin on first startup (must change on first login)
- `DEFAULT_ADMIN_EMAIL` — email for the auto-created admin (default: `admin@localhost`)
- `REQUIRE_MFA` — force TOTP MFA setup on first login (default: `false`)

Optional:
- `DATABASE_URL` — Local path or remote libSQL URL (default: `./data/opendialer.db`)
- `DATABASE_AUTH_TOKEN` — Auth token for remote libSQL databases
- `TELNYX_PUBLIC_KEY` — Base64 Ed25519 public key for webhook signature verification
- `WORKOS_API_KEY` + `WORKOS_CLIENT_ID` — WorkOS SSO (Google, GitHub, SAML)

## Author

Created by **AdrielleU** | Sponsored by **AIIVARS LLC**

## License

AGPL-3.0
