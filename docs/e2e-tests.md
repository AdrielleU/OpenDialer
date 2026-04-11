# E2E Tests (Playwright)

OpenDialer has a small Playwright E2E suite that exercises the production build of the app through a real browser. These tests are NOT run by `pnpm test` (which runs only unit/integration tests via Vitest) — they live behind `pnpm test:e2e` because they require a build + a running server.

## Current coverage

| Spec file | Lines | Scenarios |
|---|---|---|
| `e2e/auth.spec.ts` | 21 | Login page renders; invalid credentials are rejected |
| `e2e/navigation.spec.ts` | 27 | Sidebar links navigate to the right pages |
| `e2e/campaigns.spec.ts` | 49 | Create campaign; IVR builder; TTS template field |
| `e2e/contacts.spec.ts` | 17 | Contact list page loads |
| `e2e/transcription.spec.ts` | 23 | Transcription page renders cards + sections |

**Total: 137 lines, 5 spec files.**

The suite uses `e2e/global-setup.js` to handle the first-login flow once and save auth state to `e2e/.auth.json` (gitignored). All test specs reuse this state via `storageState` in `playwright.config.ts`.

## What's NOT covered yet

The new features added in recent PRs have no E2E coverage:

- **Operator soundboard** — TTS textbox and recording playback grid
- **Failover recording on disconnect** — transfer-on-disconnect flow
- **Post-call (batch) transcription** — mode picker, OpenAI/Whisper provider selection
- **Local recording storage** — `RECORDING_STORAGE=local` flow
- **Re-transcribe button** — manual STT re-run from the Transcription page
- **Settings secrets redaction** — UI showing `********` placeholder
- **Operator transfer audit trail** — `originalOperatorId` / `transferredAt` columns

Adding coverage for these is a follow-up — they'd require either real Telnyx (for the live-call paths) or stubbing the provider via the test database.

## Running locally

```bash
# Install Playwright browsers (one-time)
pnpm exec playwright install chromium

# Run the suite (builds the server first, spins it up on port 3000)
pnpm test:e2e
```

The first run takes ~30-60 seconds because it has to build the server and frontend.

## Status as of 2026-04

The suite is **not currently run in CI**. The unit tests in `pnpm test` cover the same functional surface for the most part, and the e2e suite would add ~3-5 minutes to every PR. For now, e2e is run on demand by contributors when touching UI code.

A future PR could:
1. Add a `.github/workflows/e2e.yml` that runs only on PRs (not pushes to main) to keep main branch CI fast
2. Add coverage for the new feature areas listed above
3. Fix any specs that may have drifted as the UI evolved

This investigation was part of audit item **#25** in [audit-findings.md](audit-findings.md).
