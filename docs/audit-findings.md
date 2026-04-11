# OpenDialer Gap Analysis & Audit Findings

> **Status:** Open punch list. Each item links to the file/line that needs work and includes a severity + effort estimate so it can be prioritized for future PRs. Last refreshed 2026-04.

The repo currently has **261 server tests + 36 web tests = 297 passing**. This document tracks what's *still* open after multiple cleanup PRs, organized by category.

## ✅ Resolved (do not reopen)

These items from the original audit have been addressed:

**Security & hardening**
- **#1 CSRF via permissive CORS** — fixed by switching the session cookie to `SameSite=Strict` (closes the hole regardless of CORS or tunnel URL). Optional `ALLOWED_ORIGINS` env var added for users with a fixed front-end domain who want defense-in-depth.
- **#2 Webhook signature verification** — added a loud startup warning when `TELNYX_PUBLIC_KEY` is unset, plus an optional `WEBHOOK_REQUIRE_SIGNATURE=true` env var to fail closed in production setups.
- **#7 AMD timeout map memory leak** — the timeout callback now `delete`s its own map entry on fire. Added `cleanupOrphanedAmdTimeouts()` periodic sweep alongside the existing transcript cleanup interval.
- **#8 Session map cleanup** — new `cleanupExpiredSessions()` exported from `routes/auth.ts`, scheduled from `index.ts` on the same 24h interval as transcript cleanup.
- **#9 Rate limiting on cost-bursting endpoints** — `@fastify/rate-limit` registered globally with `global: false`. Per-route opt-in: `/api/dialer/start` (10/5min), `/api/transcripts/retranscribe` (30/min), `/api/contacts/bulk` (10/min).
- **#11 Settings secrets redaction** — `GET /api/settings` now returns `********` for any field whose key matches `*_KEY|*_SECRET|*_TOKEN|*_PASSWORD`. PUT silently drops the redacted placeholder so UI round-trips don't overwrite real secrets.
- **#12 Orphaned in-flight call** — `dialOne()` split into Phase 1 (provider.dial) and Phase 2 (DB updates). On Phase 2 failure, the orphaned Telnyx call is now hung up so no leaked ringing line.
- **#14 Twilio stub validation** — `config.ts` refuses to start with `PROVIDER=twilio` (skipped in test mode). Clear error message instead of opaque runtime crash.

**UX / behavior**
- **#15 Operator join doesn't auto-route** — `/api/dialer/join` now calls `dialerEngine.tryRouteWaitingCall()` after `addOperator()` so a queued call routes to the new operator immediately.
- **#16 Transferred-call audit trail** — added `originalOperatorId` + `transferredAt` columns to `call_logs` (migration `0003_giant_micromax.sql`); `transferCall()` populates them.
- **#17 Hangup-before-answer disposition** — extended call disposition enum with `ringing_abandoned` + `amd_abandoned`. Webhook handler maps based on call state. Contact-level status falls back to `no_answer` since contacts have a narrower enum.

**Tests**
- **#18 Webhook handler test suite** — new `__tests__/webhooks-telnyx.test.ts` (11 tests).
- **#19 Engine core unit tests** — new `__tests__/engine.test.ts` (22 tests) covering `startSession`, `dialNextBatch`, `routeToOperator`, `handleCallEnd`, `tryRouteWaitingCall`, `pauseSession`/`resumeSession`/`stopSession` with a `vi.mock`'d provider.
- **#20 Soundboard component test** — new `web/src/__tests__/Soundboard.test.tsx` (9 tests) covering TTS pre-fill, recording grid, error states.
- **#21 Transcription page test** — new `web/src/__tests__/Transcription.test.tsx` (6 tests) covering mode picker, post-call disabled state, HIPAA warning, transcript rendering.
- **#22 Auth middleware sweep test** — new `__tests__/auth-middleware.test.ts` (59 tests, one per protected/public route).
- **#23 Migration backfill test** — new `__tests__/migration-backfill.test.ts` (2 tests) verifying the 0002 backfill SQL is correct.
- **#24 Integrations endpoint tests** — new `__tests__/integrations.test.ts` (7 tests) with mocked HubSpot client + webhook firing.
- **#25 E2E test investigation** — documented current coverage in [docs/e2e-tests.md](e2e-tests.md), added `.github/workflows/e2e.yml` (PR-only) so the existing Playwright suite runs in CI.

---

## STILL OPEN

The following items remain in the audit. The HIPAA-specific items are deferred at the user's request ("hipaa isnt needed at all"). Webhook idempotency, file upload validation, and recording cleanup were explicitly declined in earlier discussions.

## CRITICAL — must fix before any production HIPAA deployment

> **Note:** these are HIPAA-specific. Skip them if your deployment doesn't handle PHI.

### 3. No HIPAA audit log
**Severity:** CRITICAL (HIPAA only) · **Effort:** large · **File:** *no audit log implementation anywhere*

HIPAA Security Rule § 164.312(b) requires audit logs of who accessed PHI when. OpenDialer has zero audit logging — no record of which user accessed which contact, listened to a recording, viewed a transcript, or modified call notes.

**Fix:** Create an `audit_logs` table `(user_id, action, resource_type, resource_id, ip_address, created_at)`. Add a Fastify hook that records every PHI-touching GET/POST/PUT/DELETE before the handler runs.

---

### 4. Session has no idle timeout
**Severity:** HIGH (HIPAA only) · **Effort:** small · **File:** `packages/server/src/routes/auth.ts:13`

`SESSION_MAX_AGE = 24 hours` is the absolute timeout. There's no idle-timeout check. HIPAA recommends 15-30 min idle timeout for PHI access — an operator can leave a browser open unattended and their session remains valid.

**Fix:** Track `lastActivityAt` per session, update on every authenticated request, invalidate sessions idle for >15 min.

---

### 5. PHI in console logs
**Severity:** HIGH (HIPAA only) · **Effort:** small · **Files:** scattered

Some console.log/error statements include callLogId, file paths, and could expose PHI if logs are forwarded to a third-party aggregator (Datadog, CloudWatch). Need a PHI-safe logging policy and a sweep of all `console.*` calls.

**Fix:** Introduce a `log()` wrapper that scrubs/redacts known PHI fields. Replace all direct `console.log` calls in webhook + transcription paths.

---

## DECLINED — see "Resolved" section above for context

The following items were investigated and deferred or declined; they are NOT in the active backlog:

- **#6 Webhook idempotency** — declined; the contact-leg hangup almost always lands cleanly on the first try and the user prefers manual recovery via the Re-transcribe button.
- **#13 Recording cleanup cron** — declined; user manages disk usage manually.

## OPEN BUGS

### 10. File upload accepts any content as audio
**Severity:** LOW · **Effort:** small · **File:** `packages/server/src/routes/recordings.ts:23-50` · **Status:** declined by user (admin-only upload on a self-hosted box)

Recording upload only checks the `type` form field (`opener`/`voicemail`/`failover`) and the 50MB size limit. No MIME-type or magic-bytes check on the file itself. The user explicitly noted that they don't have user-facing file upload, so the practical risk is low. Left here for completeness; not in active backlog.

---

## Suggested order of attack (remaining items)

If you're picking from this list, my recommended order for the **non-HIPAA** items:

1. **Audit logging (#3)** — only if you operate under HIPAA. Otherwise skip.
2. **Session idle timeout (#4)** — same. Could be repurposed as general security hygiene if you want it without HIPAA pressure.
3. **PHI in logs (#5)** — same.

Everything else is either resolved or explicitly declined.

Items 14-17 and 20-25 are nice-to-haves that can wait.

---

## What's NOT on this list

For completeness, these were investigated and found to be **fine**:

- SQL injection risk — Drizzle parameterizes everything, no string concatenation found
- XSS risk in transcripts/notes — React escapes by default, no `dangerouslySetInnerHTML` use
- Path traversal in upload filenames — `randomUUID()` for the saved name, not user input
- HTTPS everywhere — handled by Cloudflare Tunnel / reverse proxy in production
- Webhook secret in URL — Telnyx uses signature headers, not URL secrets
- Open redirects — no user-controlled redirect targets found
- Auth bypass via path tricks like `/api/auth/../users` — Fastify normalizes URLs before matching
