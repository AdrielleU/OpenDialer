# OpenDialer Gap Analysis & Audit Findings

> **Status:** Open punch list. Each item links to the file/line that needs work and includes a severity + effort estimate so it can be prioritized for future PRs. Generated 2026-04 against `main` at commit `8d7926c`.

The repo currently has **159 server tests + 21 web tests = 180 passing**. This document tracks what's *still* missing or wrong, organized by category.

---

## CRITICAL — must fix before any production HIPAA deployment

### 1. CSRF via permissive CORS + cookie auth
**Severity:** HIGH · **Effort:** tiny · **File:** `packages/server/src/app.ts:34`

CORS is configured as `{ origin: true, credentials: true }`, which echoes back any origin and allows credentialed requests. Combined with `sameSite: 'lax'` cookies, an attacker site can trigger authenticated state-changing requests against `/api/dialer/start`, `/api/contacts/bulk`, etc., using a victim's browser session.

**Fix:** Restrict to an explicit origin allowlist, e.g.
```ts
{ origin: process.env.ALLOWED_ORIGINS?.split(',') || false, credentials: true }
```
And upgrade the session cookie to `sameSite: 'strict'` in `packages/server/src/routes/auth.ts:29`.

---

### 2. Webhook signature verification is opt-in
**Severity:** HIGH · **Effort:** tiny · **File:** `packages/server/src/webhooks/telnyx.ts:66-100`

If `TELNYX_PUBLIC_KEY` is unset, signature verification is silently skipped and webhooks are accepted unverified. An attacker can POST fake `call.answered` / `call.hangup` / `call.machine.detection.ended` events to `/webhooks/telnyx` and trigger arbitrary state changes (hang up calls, drop voicemails, misdirect routing).

**Fix:** Fail closed when the public key is missing — refuse webhook processing unless verification is enabled. Add a startup warning if the key is unset.

---

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

## HIGH — bugs and security issues worth fixing soon

### 6. Webhook idempotency missing
**Severity:** HIGH · **Effort:** medium · **File:** `packages/server/src/webhooks/telnyx.ts` (all event handlers)

Telnyx retries webhooks on network failures. If `call.hangup` fires twice, `handleCallEnd` runs twice → potential double-counted dispositions or duplicate transcripts on `call.recording.saved`.

**Fix:** Add a `processed_webhooks (event_id PRIMARY KEY, processed_at)` table. Reject duplicates with 200 OK and skip processing.

---

### 7. AMD timeout Map memory leak
**Severity:** MEDIUM · **Effort:** small · **File:** `packages/server/src/webhooks/telnyx.ts:18`

`amdTimeouts` Map stores per-call timeout handles. If a call ends without hitting `call.machine.detection.ended` (network drop, weird Telnyx behavior), the timeout fires but the Map entry is never deleted.

**Fix:** Have the timeout callback `delete` itself from the Map; add a periodic sweep for orphaned entries.

---

### 8. Session Map only cleaned lazily
**Severity:** MEDIUM · **Effort:** small · **File:** `packages/server/src/routes/auth.ts:22-49`

Sessions in the in-memory Map are only deleted when accessed and found expired. Sessions for users who never come back grow unbounded.

**Fix:** Add a `cleanupExpiredSessions()` function and run it from a 1-hour interval timer (or hook into the existing transcript cleanup cron).

---

### 9. No rate limiting on cost-bursting endpoints
**Severity:** MEDIUM · **Effort:** small · **Files:**
- `packages/server/src/routes/dialer.ts:19` — `POST /api/dialer/start`
- `packages/server/src/routes/transcripts.ts` — `POST /api/transcripts/retranscribe`
- `packages/server/src/routes/contacts.ts` — `POST /api/contacts/bulk`

A compromised admin token (or a buggy script) can spam these endpoints and burn through Telnyx minutes / OpenAI quota / DB connections.

**Fix:** Apply `@fastify/rate-limit` to these specific routes — e.g., 10 starts/min, 30 retranscribes/min, 5 bulk imports/min.

---

### 10. File upload accepts any content as audio
**Severity:** MEDIUM · **Effort:** small · **File:** `packages/server/src/routes/recordings.ts:23-50`

Recording upload only checks the `type` form field (`opener`/`voicemail`/`failover`) and the 50MB size limit. No MIME-type or magic-bytes check on the file itself. Someone could upload an executable disguised as `.mp3`.

**Fix:** Sniff the first few bytes for known audio magic numbers (ID3, RIFF, OggS, etc.) and reject non-audio files at upload time.

---

### 11. Settings GET returns secrets in plaintext
**Severity:** MEDIUM · **Effort:** small · **File:** `packages/server/src/routes/settings.ts:30-37`

`GET /api/settings` returns the entire dictionary including `TELNYX_API_KEY`, `OPENAI_API_KEY`, `STT_API_KEY`. Admin-only, but if an admin's browser is compromised or they access from a shared screen, secrets are visible in cleartext in the response.

**Fix:** Redact password-shaped fields (anything matching `*_KEY`/`*_SECRET`/`*_TOKEN`) to `********` in the GET response. Allow updates but never echo the actual value.

---

### 12. In-flight call orphaned on call-log insert failure
**Severity:** MEDIUM · **Effort:** medium · **File:** `packages/server/src/dialer/engine.ts:151-187`

`dialOne()` calls `provider.dial()` (creates the Telnyx call), then `addInFlightCall()`, then inserts a `call_logs` row. If the DB insert fails after the dial succeeds, the Telnyx call is live but there's no row to track it — orphaned state.

**Fix:** Wrap the sequence in a try/catch that hangs up the Telnyx call on DB failure, OR insert the call log first and update with the call_control_id afterward.

---

### 13. No automatic recording cleanup
**Severity:** MEDIUM · **Effort:** small · **Files:**
- `packages/server/src/db/cleanup.ts` (existing pattern for transcripts)
- `packages/server/src/recordings/storage.ts` (no cleanup function)

`cleanupOldTranscripts()` exists for transcript retention but there's no equivalent for recording files in `uploads/recordings/`. Disk fills up over time. At 1k calls/week ≈ 20 GB/month of recordings.

**Fix:** Add `cleanupOldRecordings(retentionDays)` mirroring the transcript cleanup pattern. Default retention 90 days (configurable). Also delete unreferenced files (where the call log row was deleted).

---

### 14. Telnyx provider stub crashes if PROVIDER=twilio
**Severity:** LOW · **Effort:** tiny · **File:** `packages/server/src/providers/twilio.ts`

If a user accidentally sets `PROVIDER=twilio` in settings, calls to provider methods throw `not implemented` errors at runtime instead of being caught at config time.

**Fix:** Validate `PROVIDER` at startup in `config.ts` — only allow `'telnyx'` until Twilio is implemented. Or gracefully refuse to start with a clear error message.

---

## MEDIUM — design gaps

### 15. Operator joining mid-session doesn't auto-route
**Severity:** LOW · **Effort:** tiny · **File:** `packages/server/src/routes/dialer.ts:121-141`

When a new operator joins an already-running session, they get `availability='available'` but waiting calls in the queue don't immediately route to them. They have to wait for another event (an existing operator going to wrap-up, the next dial batch) to trigger routing.

**Fix:** Call `dialerEngine.tryRouteWaitingCall()` immediately after `addOperator()` in the join handler.

---

### 16. Transferred-call audit trail
**Severity:** LOW · **Effort:** small · **File:** `packages/server/src/dialer/disconnect.ts:transferCall`

When a call transfers to a new operator after a disconnect, the call log only stores a free-text note. There's no structured audit trail of who originally took the call, when it was transferred, and to whom.

**Fix:** Add a `call_transfers` table or extend `call_logs` with `originalOperatorId` + `transferredAt` columns.

---

### 17. Hangup-before-answer disposition lossy
**Severity:** LOW · **Effort:** tiny · **File:** `packages/server/src/webhooks/telnyx.ts:435-440`

If a contact hangs up while ringing or during AMD, the disposition gets mapped to `'no_answer'` regardless of the actual state. Loses context (was it abandoned during AMD? While ringing?).

**Fix:** Add a richer disposition mapping that distinguishes `ringing_abandoned`, `amd_abandoned`, etc.

---

## TEST COVERAGE GAPS

### 18. Webhook handler has zero direct tests
**Severity:** HIGH · **Effort:** large · **File:** `packages/server/src/webhooks/telnyx.ts` (no test file)

The webhook handler is "the brain" of the dialer but is only exercised indirectly via the engine integration tests. No tests for:
- Signature verification (valid + invalid + missing)
- `call.answered` / `call.machine.detection.ended` (machine vs. human vs. not_sure vs. timeout)
- `call.hangup` in various call states
- `call.recording.saved` triggering post-call transcription
- `call.playback.ended` for opener / voicemail / failover branches
- Duplicate event handling

**Fix:** New `__tests__/webhooks-telnyx.test.ts`. Mock `getProvider()`, post raw event payloads via `app.inject()`, assert state changes.

---

### 19. Engine core functions tested only via integration
**Severity:** HIGH · **Effort:** large · **File:** `packages/server/src/dialer/engine.ts`

`dialNextBatch`, `routeToOperator`, `handleCallEnd`, `tryRouteWaitingCall` — ~600 lines of business logic — are exercised only through `dialer-routes.test.ts` happy paths. Missing:
- `dialNextBatch` with empty queue, with concurrent operator additions, with `dropIfNoOperator=true`
- `routeToOperator` when bridge fails, when no operator available
- `handleCallEnd` for every disposition, with and without recording, with and without transcription

**Fix:** Pure unit tests with seeded team-state and mocked provider.

---

### 20. Soundboard React component untested
**Severity:** MEDIUM · **Effort:** small · **File:** `packages/web/src/components/Soundboard.tsx`

The new in-call soundboard component (TTS textarea + recording grid) has no tests. No verification that `playRecording` and `speak` API calls fire correctly or that errors render.

**Fix:** New `Soundboard.test.tsx` with `@testing-library/react`. Mock `api.dialer.playRecording` and `api.dialer.speak`, assert UI behavior on click and on error.

---

### 21. Rebuilt Transcription page untested
**Severity:** MEDIUM · **Effort:** small · **File:** `packages/web/src/pages/Transcription.tsx`

The mode dropdown, the disabled-state when no STT provider configured, the Re-transcribe button — none have unit tests. The page was substantially rebuilt for this PR.

**Fix:** New `Transcription.test.tsx` covering the mode picker, the post-call provider warning, and the retranscribe flow.

---

### 22. Auth middleware coverage thin
**Severity:** MEDIUM · **Effort:** small · **File:** `packages/server/src/app.ts:62-83`

Only one test (`dialer-routes.test.ts:110-116`) verifies that `GET /api/dialer/status` returns 401 without auth. There's no comprehensive sweep verifying every protected endpoint and every exempted path.

**Fix:** New `__tests__/auth-middleware.test.ts` that programmatically iterates over a list of routes and asserts the right behavior per route.

---

### 23. Migration backfill untested
**Severity:** MEDIUM · **Effort:** small · **Files:** `packages/server/drizzle/0002_acoustic_zuras.sql`, `packages/server/src/db/migrate.ts`

The 0002 migration includes a backfill `UPDATE` that converts existing `enable_transcription = 1` rows to `transcription_mode = 'realtime'`. If the SQL has a typo or the migration runs against weird existing data, the backfill could silently fail.

**Fix:** New migration test that seeds a campaign with `enable_transcription=1`, runs migrations, and asserts `transcription_mode='realtime'`.

---

### 24. Integrations endpoints untested
**Severity:** MEDIUM · **Effort:** small · **File:** `packages/server/src/routes/integrations.ts`

HubSpot test/import/log-call and webhook test endpoints have no tests. No verification of credential handling, error paths, or admin enforcement.

**Fix:** New `__tests__/integrations.test.ts` with mocked HubSpot client.

---

### 25. E2E test status unclear
**Severity:** LOW · **Effort:** investigation · **File:** `e2e/` directory

There's an `e2e/` directory with Playwright tests but they're not run by `pnpm test` (only by `pnpm test:e2e` which requires a build first). Unclear what scenarios they cover, whether they still pass, and whether the new features (soundboard, failover, batch transcription, retranscribe) have any e2e coverage.

**Fix:** Investigate, run them locally, document the coverage, and add the e2e job to CI.

---

## Suggested order of attack

If you're picking from this list, my recommended order:

1. **Fix #1 + #2 (CORS + webhook verification)** — both are tiny one-line changes, both close real security holes. ~20 min total.
2. **Add tests #18 + #19** (webhook handler + engine core) — these are the biggest test gaps and the highest-risk untested code. ~1-2 days.
3. **Fix #6 (webhook idempotency)** — protects against double-counting from Telnyx retries. ~half a day.
4. **Fix #11 (settings secrets redaction)** — small UX/security improvement. ~30 min.
5. **Fix #13 (recording cleanup)** — disk fills up otherwise. ~half a day.
6. **Fix #4 + #5 (HIPAA session timeout + log scrubbing)** — only matters if you're operating under HIPAA, but mandatory if you are. ~1 day each.
7. **Fix #3 (audit logging)** — also HIPAA-only and a real lift. Multi-day. Save for last unless required.

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
