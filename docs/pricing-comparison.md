# Pricing & Cost Comparison

OpenDialer's value comes from **reducing the operator-hours needed to complete a given call volume**, not from being cheaper than other dialer software. This document walks through the math, the source data, and how OpenDialer compares to manual workflows and to commercial competitors.

> **Last updated:** 2026-04. Prices change frequently — verify against vendor pricing pages before making purchasing decisions. All numbers are USD.

---

## TL;DR

| Scenario | Manual (status quo) | OpenDialer self-hosted | Annual savings | % |
|---|---|---|---|---|
| **Solo biller** (100 calls/wk) | $87,700 | $60,500 | **$27,200** | -31% |
| **Small team** (300 calls/wk, 3 ops) | $256,300 | $181,500 | **$74,800** | -29% |
| **Mid team** (1,000 calls/wk, 10 ops) | $856,800 | $605,000 | **$251,800** | -29% |

The savings rate is consistently ~29-31% across all scales because **labor dominates total cost** (95-97%). OpenDialer reduces the FTEs needed by ~30% via parallel dialing — the dialer software is cheap regardless.

---

## Source data (cited)

| Variable | Value | Source |
|---|---|---|
| Medical biller hourly cost (fully loaded) | **$35/hr** | BLS OEWS 43-3021 ($22-27/hr base) × 1.30 benefits/overhead loading. MGMA medical-billing-specialist median $56,652/yr. |
| Annual fully-loaded FTE | **$72,800/yr** | $35/hr × 2,080 hours |
| Average insurance phone call duration | **25 min** | CAQH 2024 Index Report — claim status by phone |
| Hold time as % of call | **~60%** (15 min hold / 10 min talk) | Industry reports + practitioner forums |
| Manual calls/day per biller (phone-only) | **15** | AAPC practitioner reports + HFMA productivity benchmarks |
| Telnyx outbound voice (US WebRTC) | **$0.007/min** | telnyx.com/pricing/voice-api |
| Telnyx local DID | **$1/mo** | telnyx.com/pricing/numbers |
| Telnyx real-time STT | **$0.025/min** | telnyx.com/pricing/speech-to-text |
| OpenAI Whisper API (batch) | **$0.006/min** | openai.com/pricing |
| Self-hosted Whisper (batch) | **$0/min** | Compute already paid (whisper.cpp on CPU) |
| Hetzner CX22 VPS (2 vCPU/4GB) | **$4/mo** | Hetzner Cloud (April 2026 pricing) |
| Cloudflare Tunnel | **$0** | Free tier, no usage limits |
| Five9 Core | **$159/seat/mo, 50-seat min** | five9.com/products/pricing |
| Genesys Cloud CX 1 (voice) | **$75/seat/mo** | genesys.com/pricing |
| Talkdesk Voice Essentials | **$105/seat/mo, 3-yr contract** | talkdesk.com/pricing |
| Vicidial managed (typical hosting) | **$200-400/mo + $0.015/min + $500-1k setup** | VICIhost / VoipPlus / vendor pages |
| Infinitus Systems (AI agent) | **No public pricing — enterprise only, ~$8-12/call estimate, $100k+/yr minimums** | $51.5M Series C (a16z, Oct 2024); sells to Fortune 50 only |

---

## Throughput math (the load-bearing assumption)

**Manual calling**: one biller, one call at a time. 25 min call + 3 min wrap-up = 28 min per completed call. An 8-hour day with breaks/meetings is ~7 productive hours = 420 min ÷ 28 = **15 calls/day**. Matches AAPC self-reports.

**OpenDialer with parallel dialing**: the system dials N×3 lines per operator. While each line waits on hold, the operator does nothing — they're only engaged when AMD detects a human picks up. The operator's actual time per completed call drops to ~10 min talk + 3 min wrap = **13 min per completed call** = ~32 calls/day theoretical.

**Realistic conservative estimate: 1.7× throughput, ~25 calls/day per operator.** That's the number used below. In practice, this can drop to 1.2-1.3× if your payer mix requires heavy DTMF IVR navigation that the operator has to drive manually.

---

## Scenario 1: Solo biller — 100 calls/week

A 1-2 provider primary care practice, a small DME supplier, or a solo billing contractor.

### Manual (status quo)

- 100 calls × 28 min = 2,800 min/week = 47 hours of biller time
- Realistically requires 1.2 FTE (one full-timer + a few hours of overflow help)
- **Labor: $87,360/year** (1.2 × $72,800)
- Phone/softphone: ~$30/mo for a Bria license + a Telnyx DID = ~$360/year
- **Total: ~$87,700/year**

### OpenDialer (1 operator)

- 100 calls/week ÷ 25 calls/day = 4 days/week of work = ~0.8 FTE
- **Labor: $58,240/year** (0.8 × $72,800)
- Telnyx voice: 100 × 25 × 4.33 = 10,825 min/mo × $0.007 = **$76/mo**
- 2 DIDs (1 primary + 1 backup): **$2/mo**
- Hetzner CX22 VPS: **$4/mo**
- Cloudflare Tunnel: **$0**
- Optional transcription on talk portion only: 100 × 10 × 4.33 = 4,330 min × $0.025 = **$108/mo**
  - Or **$26/mo** with OpenAI Whisper API batch (4× cheaper)
  - Or **$0** with self-hosted Whisper
- **Infrastructure subtotal: ~$190/mo = $2,280/year** (with real-time transcription)
- **Total: ~$60,520/year**

### What's available at solo scale

| Option | Year-1 cost | OpenDialer savings | Notes |
|---|---|---|---|
| Manual softphone | $87,700 | **$27,200/yr (-31%)** | Status quo |
| **OpenDialer self-hosted** | **$60,500** | — | The recommended path |
| Vicidial managed | $63,500 | $3,000/yr (-5%) | Same labor savings, harder ops |
| Genesys CX 1 | not available | — | 5-seat minimum |
| Five9 Healthcare | not available | — | 50-seat minimum |
| Infinitus AI | not available | — | Enterprise only |

**Reality at solo scale**: the only options that exist are manual, OpenDialer, and Vicidial. OpenDialer beats Vicidial by ~$3k/year and is dramatically simpler to operate.

---

## Scenario 2: Small team — 300 calls/week (3 operators)

A 5-10 provider multi-specialty practice, a small RCM company servicing 3-5 practices, or a mid-size DME / lab company.

### Manual

- 300 × 28 = 8,400 min = 140 hours/week = **3.5 FTE**
- Labor: 3.5 × $72,800 = **$254,800/year**
- Software/phones: ~$1,500/year
- **Total: ~$256,300/year**

### OpenDialer (3 operators)

- 300 calls/week ÷ (25 calls/day × 3 operators) = 4 days/week each = 2.4 FTE
- Labor: 2.4 × $72,800 = **$174,720/year**
- Telnyx voice: 300 × 25 × 4.33 = 32,475 min/mo × $0.007 = **$227/mo**
- 5 DIDs (rotation for STIR/SHAKEN attestation): **$5/mo**
- VPS: **$4/mo**
- Transcription: 300 × 10 × 4.33 = 12,990 min × $0.025 = **$325/mo** (real-time)
  - Or **$78/mo** with OpenAI Whisper API batch (-76%)
  - Or **$0** with self-hosted Whisper
- **Infrastructure subtotal: ~$561/mo = $6,732/year** (with real-time transcription)
- **Total: ~$181,500/year**

### Cost comparison at small-team scale

**Apples-to-apples (with transcription on both sides):**

| Option | Software | Telecom | Transcription | Labor | **Total** | OpenDialer wins by |
|---|---|---|---|---|---|---|
| **OpenDialer self-hosted** | $48 (VPS) | $2,784 | $3,900 | $174,720 | **$181,452** | — |
| Manual softphone | $360 | $360 | $0 | $254,800 | $255,520 | **$74,068/yr** |
| Vicidial managed | $4,800 + $1k setup | $5,844 | included | $174,720 | $186,364 | **$4,912/yr** |
| Genesys CX 3 (incl. transcription) | $5,580 | $2,200 | included | $174,720 | $182,500 | **$1,048/yr** |
| Genesys CX 1 (no transcription) | $2,700 | $2,200 | — | $174,720 | $179,620 | -$2,068/yr (Genesys wins by $2k *if you don't need transcription*) |
| Five9 Healthcare (50-seat min) | $95,400 | $2,200 | included | $174,720 | $272,320 | **$90,868/yr** |

**Reality at 3-operator scale**: the headline savings are **vs. manual** ($74k/yr) and **vs. Five9** ($91k/yr). The savings vs. Genesys/Vicidial are small (1-3%) — if you're already on a real dialer, the cost reason to switch is weak. The non-cost reasons (no annual contract, source available, modifiable, 30-min setup) are stronger.

---

## Scenario 3: Mid team — 1,000 calls/week (10 operators)

A regional RCM company servicing 20-50 practices, or a mid-size hospital system's billing department, or a high-volume specialty practice.

### Manual

- 1,000 × 28 = 28,000 min/week = 467 hours = **11.7 FTE**
- Labor: 11.7 × $72,800 = **$851,800/year**
- Software: ~$5,000/year
- **Total: ~$856,800/year**

### OpenDialer (10 operators)

- 1,000 calls/week ÷ (25 calls/day × 10 ops) = 4 days/week = 8 FTE
- Labor: 8 × $72,800 = **$582,400/year**
- Telnyx voice: 1,000 × 25 × 4.33 = 108,250 min/mo × $0.007 = **$758/mo** (volume discount could drop to ~$541/mo at $0.005/min)
- 20 DIDs: **$20/mo**
- VPS (bigger for 10 concurrent operators): **$20/mo**
- Transcription: 1,000 × 10 × 4.33 = 43,300 min × $0.025 = **$1,083/mo** (real-time)
  - Or **$260/mo** with OpenAI Whisper API batch
  - Or **$0** with self-hosted Whisper
- **Infrastructure subtotal: ~$1,881/mo = $22,572/year**
- **Total: ~$605,000/year**

### Cost comparison at mid-team scale

| Option | Year-1 cost | OpenDialer savings |
|---|---|---|
| **OpenDialer self-hosted** | **$605,000** | — |
| Manual | $856,800 | **$251,800/yr (-29%)** |
| Vicidial managed | $611,500 | $6,500/yr (-1%) |
| Genesys CX 3 (with transcription, BYOC) | $628,000 | $23,000/yr (-4%) |
| Infinitus AI (full automation, ~$10/call) | ~$665,600 | $60,600/yr (-9%) — only beats OpenDialer if you eliminate ALL human labor |
| Five9 Healthcare | $706,200 | $101,200/yr (-14%) |

---

## Where the savings actually come from

| What you're replacing | Solo savings | Small team savings | Mid team savings |
|---|---|---|---|
| **Manual workflow** | **$27k** | **$75k** | **$252k** |
| Five9 | n/a | $96k | $101k |
| Infinitus AI | n/a | n/a | $61k |
| Vicidial | $3k | $5k | $7k |
| Genesys | n/a | $1-7k | $10-23k |

**The dollar savings vs. other dialers are real but small** — typically 1-5% of total cost. Labor dominates everything, and *every* parallel-dialing system reduces FTEs by roughly the same amount. **The dollar savings vs. manual are large** (29-31%) because hand-dialing wastes operator time on hold music.

So OpenDialer's real positioning isn't "cheaper than Five9" — it's:

> **"Stop hand-dialing. Get a queue + parallel dialing engine + auto-routing for $200-2000/month of infrastructure instead of a $7,950/month seat license with a 50-seat minimum."**

---

## Notes and caveats

1. **The 1.7× throughput multiplier is the load-bearing assumption.** If insurance company IVRs slow-walk you (which they sometimes do), or if your payer mix requires heavy DTMF navigation, you'll get closer to 1.2-1.3×. That cuts the savings in half. **Run a 2-week pilot before betting on the full number.**

2. **OpenDialer doesn't replace post-call work.** Notes, claim updates in your billing software, follow-up tasks — all of that still takes the same time it did manually. The savings are purely on the "dial → wait → talk" leg.

3. **Setup time is real.** OpenDialer is `docker compose up` but getting Telnyx, buying DIDs, configuring Cloudflare Tunnel, building campaigns, uploading recordings, training operators — budget **1-2 weeks of part-time setup**. Five9/Genesys are 4-8 weeks of vendor onboarding. Vicidial is "however long it takes you to learn Asterisk."

4. **Telnyx doesn't sign HIPAA BAAs** (claims the conduit exception). For PHI workflows, the cleanest path is `RECORDING_STORAGE=local` + self-hosted Whisper for transcription so audio never leaves your infrastructure. See [docs/transcription.md](transcription.md) for the full HIPAA-safe loop.

5. **AI automation (Infinitus, etc.) is the wild card.** If full AI replaces operators entirely for the routine 80% of calls, the math changes — labor drops to ~10-20% of where these tables put it. The question is whether the AI is good enough yet for your specific payer mix. That's an empirical question, not a math question.

6. **Soft savings not modeled:**
   - Faster cash collection from working denials sooner (CAQH says delayed claim follow-up costs the industry $2.8B/year)
   - Operator morale — billers hate being on hold for 6 hours a day; reducing that has real retention value
   - Audit trail / transcripts for payer disputes
   - Capacity for growth — you can take on more clients without hiring

---

## How to run your own pricing analysis

Inputs you can change to model your specific situation:

- **Average call duration** — claim status calls run longer than eligibility verification (which is often resolved in 5-10 minutes via the simpler payer IVRs)
- **Hold time ratio** — varies wildly by payer; UnitedHealth is faster than Anthem in our anecdotal data, but neither publishes official AHT
- **Local hourly wage** — billers in low-cost-of-living areas are much cheaper than Bay Area / NYC; the BLS state breakdown ranges from ~$18/hr in MS to ~$31/hr in HI
- **Telnyx volume discount** — if you commit to ≥100k min/mo, sales-rep contracts can drop the rate from $0.007/min to ~$0.005/min
- **Transcription mode** — turning real-time off saves 76-100% of STT cost; use post-call batch (Whisper) for review-only workflows

A simple spreadsheet with the inputs above and these formulas will reproduce all the scenario numbers in this document.
