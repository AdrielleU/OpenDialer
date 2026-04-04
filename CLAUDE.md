# CLAUDE.md - OpenDialer

## Project Overview

OpenDialer is an open-source, self-hosted browser-based power dialer for sales teams. Users bring their own Telnyx API keys and pay per-minute instead of per-seat SaaS pricing. It is NOT an AI voice agent — it's a classic power dialer with AMD, voicemail drops, opener playback, and live human takeover via WebRTC.

## Architecture

- **Monorepo** managed by pnpm workspaces
- **Backend:** `packages/server/` — Fastify 5 + TypeScript 5.7 + Drizzle ORM + SQLite (LibSQL)
- **Frontend:** `packages/web/` — React 19 + Vite 6 + Tailwind CSS 4
- **Real-time:** Server-Sent Events (SSE) at `/events` — NOT WebSocket
- **Telephony:** Telnyx SDK with provider abstraction layer (`packages/server/src/providers/`)
- **Database:** SQLite file at `./data/opendialer.db`, auto-migrated on startup via Drizzle
- **Session state:** In-memory (not persisted) — see `packages/server/src/dialer/state.ts`

## Key Directories

```
packages/server/src/
  routes/        — API endpoints (campaigns, contacts, recordings, settings, dialer, analytics)
  webhooks/      — Telnyx webhook handler (call state machine)
  dialer/        — Core calling engine, session state, WebRTC bridge
  providers/     — Telephony provider abstraction (Telnyx implemented, Twilio stubbed)
  db/            — Drizzle schema, client init, migrations
  ws/            — SSE broadcaster (file is named ws/ but uses SSE, not WebSocket)

packages/web/src/
  pages/         — Route pages (Dialer, Campaigns, Contacts, Recordings, Analytics, Settings)
  hooks/         — useWebSocket (actually EventSource/SSE), useTelnyxClient (WebRTC)
  lib/api.ts     — Typed API client
```

## Development Commands

```bash
pnpm install                              # Install all dependencies
pnpm dev                                  # Run backend (:3000) + frontend (:5173) concurrently
pnpm --filter @opendialer/server dev      # Backend only
pnpm --filter @opendialer/web dev         # Frontend only
pnpm build                                # Full production build
pnpm -r db:generate                       # Generate Drizzle migrations after schema changes
docker compose up --build                 # Docker deployment (frontend at :8080, backend at :3000)
docker compose --profile tunnel up --build # With Cloudflare Tunnel for webhooks
```

## Code Style

- TypeScript strict mode everywhere
- Prettier: single quotes, semicolons, trailing commas, 100 char width, 2-space indent
- No test suite yet — all testing is manual
- Zod for runtime validation (env config, request bodies)

## Important Patterns

- **Call state machine** lives in `packages/server/src/webhooks/telnyx.ts` — handles the full call lifecycle from initiation through AMD to hangup
- **Auto-advance** logic in `packages/server/src/dialer/engine.ts` — recursive `dialNext()` with 500ms inter-call delay
- **Client state tracking:** JSON payload base64-encoded into Telnyx `client_state` field, echoed back in webhooks for campaign/contact context
- **Provider interface** in `packages/server/src/providers/types.ts` — all telephony calls go through this abstraction

## Environment Setup

Copy `.env.example` to `.env`. Required variables:
- `TELNYX_API_KEY` — API key from Telnyx dashboard
- `TELNYX_CONNECTION_ID` — SIP Connection ID (WebRTC enabled)
- `TELNYX_PHONE_NUMBER` — Purchased number in E.164 format
- `WEBHOOK_BASE_URL` — Public URL for Telnyx to POST webhook events

## Author

Created by **AdrielleU** | Sponsored by **AIIVARS LLC**

## License

AGPL-3.0
