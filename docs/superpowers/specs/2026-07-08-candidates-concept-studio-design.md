# Candidates + Concept Studio — Design

**Date:** 2026-07-08
**Status:** Approved by David (2026-07-08)
**Repo:** davidani-studio (absorbs the plan from `~/davidani-design-agent`; that repo's weekly-bot spec of 2026-07-02 is superseded by this design)

## Purpose

Turn davidani-studio from a set of manual creation tools into a proactive
refresh pipeline. Every morning the studio surfaces a ranked list of
**Candidates** — styles whose seasonal window says "techpack this NOW to have
samples 1–2 months ahead of the buying season" — and one click opens a
per-style **Concept Studio** workbench where CAD extraction, concept
generation, and techpack creation run against that style's real ERP photos
and sales evidence. Worked styles move through a **pipeline board** so every
refresh in flight and its sample-due date stays visible.

## Success criteria

- Each morning the Candidates tab shows ~10 in-window styles, each with a
  human-readable reason ("Sample by Aug 15 to hit Holiday buying · 41
  boutiques last Fall · ATS −120, no incoming PO").
- One click on a candidate opens Concept Studio with ERP photos pre-loaded
  and the refresh brief alongside; CAD extract / generate / techpack all work
  from there without re-uploading anything.
- The board shows every refresh in flight with its stage and sample-due date.
- Styles already worked or on cooldown never reappear in the daily list.
- A stale list (Mac asleep, ERP cookie expired) is visibly stale, never
  silently wrong.

## Architecture

Two halves connected by Vercel Blob:

```
[Mac, launchd daily 7am PT]                 [Vercel: davidani-studio]
erp_client.py (Chrome cookies)              /candidates        (feed + board)
  → pull best-sellers, SO history,          /concept-studio/[styleId]
    ATS, PO-ETA, style detail                 (workbench)
  → seasonal windows + blended score        /api/candidates    (read feed)
  → per-candidate briefs                    /api/pipeline      (board state)
  → mirror style photos → Vercel Blob
  → candidates-YYYY-MM-DD.json → Blob
  → flip candidates/latest.json pointer
```

The ERP requires David's live Chrome session (browser_cookie3) — it cannot be
called from Vercel. The local job is the only ERP toucher. Phase-2 upgrade
path: swap the local job for a Vercel cron using erp-mcp-server's scripted
login; the scoring code is transport-independent so this is a data-source
swap, not a rewrite.

## Component 1: Daily candidates job (local, Python)

Lives in `davidani-studio/pipeline/` (new directory; reuses `erp_client.py`
patterns and the pants-refresh SO-line crawl). Launchd plist runs Mon–Fri
7:00am PT.

**Data pulled per run:**
- Best-sellers by date range (`Rpt.Style.BestSellerStyle-Show.List.Json.asp`)
  for trailing 24 months, monthly buckets.
- Live ATS per color (`Style.ATS.Json.asp`).
- Open PO-ETA lines (`POETA.List.Json.asp`, `custPO=='' && balQty>0`).
- Style detail (`Style.Center.StyleForm.Load.asp`) for name/price/images of
  candidates only.
- SO-line detail for candidates only (per-color sales ranking, the
  pants-refresh crawl).

**Seasonal window (the gate):**
- For each style (and its category as fallback when style history is thin),
  build a sales-by-month profile from 24 months of SO history (SO orderDt,
  not invoice date — pre-order semantics).
- Peak buying months = months covering the top ~60% of that profile.
- Act-now band = peak start minus (sample lead + techpack buffer). Defaults:
  sample lead 60 days, techpack buffer 14 days, both configurable per
  category in `pipeline/config.json`.
- A style is **in window** when today falls inside its act-now band.

**Blended score (ranking within the window):**
`score = demand_confidence × margin × inventory_gap_boost`
- demand_confidence: normalized boutique breadth (all-time `cntCustomer`) +
  90-day recent-boutique velocity — same balance as the linesheet selector.
- margin: `salesPrice − costPrice` from the ATS feed, normalized.
- inventory_gap_boost: multiplier > 1 when recent velocity is strong but
  `atsQty ≤ 0` and no open PO covers it (proven demand you can't ship).
Each factor is stored on the candidate so the UI can show *why*.

**Exclusions (hard rules):**
- Private-cut styles: 2+ trailing capital letters — never shown.
- P-prefix plus styles fold into their D-sibling (one candidate per family).
- 90-day cooldown after a style appears (persisted ledger, same rule as the
  design-agent spec).
- Styles currently on the pipeline board in any non-terminal stage.

**Brief per candidate (written by the job, no image generation):**
- Reason line (window math + breadth + inventory gap, human-readable).
- Per-color sales ranking from SO lines.
- Suggested direction (rule-based from the data: e.g. "top 2 colors carry
  78% — keep silhouette, refresh print" — plus a freeform notes field the
  workbench shows).
- 5-layer prompt seeds per the approved fashion image-gen format.

**Output:**
- Style photos downloaded from the ERP and uploaded to Vercel Blob
  (`candidates/photos/<styleId>/<n>.jpg`) so fal and the browser can fetch
  them without ERP auth.
- `candidates/candidates-YYYY-MM-DD.json` (immutable per-day snapshot), then
  `candidates/latest.json` pointer flipped last (atomic publish).
- Failure mode: ERP cookie expired or fetch fails → skip the run, do NOT
  advance cooldowns, send a notification (reuse marketing-agent's email
  send); the previous `latest.json` stays live.

**Cap:** 10 candidates/day (configurable).

## Component 2: Candidates tab (studio)

New nav tab, first position. Reads `/api/candidates` (which reads
`candidates/latest.json` from Blob, cache-busted).

- Card per candidate: photo, style code + real product name, price/margin,
  reason line, per-color mini-ranking, blended-score factors.
- Header shows list date; banner when the list is older than 24h ("Last
  refreshed Mon Jul 7 — Mac job hasn't run").
- Actions per card: **Open in Concept Studio** (promotes to the board as
  In Concept), **Dismiss** (starts cooldown, records reason optionally).
- Board view on the same page (toggle-free — both sections visible, feed on
  top, board below). The feed itself is the "Candidate" stage; the board
  tracks styles after promotion: In Concept → Techpacked → Sample Ordered →
  Done/Dropped. Sample Ordered stamps a due date (default +60d, editable
  inline). Cards show days-until-due, red when overdue.

## Component 3: Concept Studio workbench

Route: `/concept-studio/[styleId]`. Left rail: ERP photos (pre-loaded from
Blob mirror), brief, per-color sales, pipeline stage control. Main area:
three action groups reusing existing machinery — no new generation backends:

- **CAD extract:** the CAD Extractor's async task flow (`/api/cad-extract`)
  scoped to this style's photos; results render with the existing tiling
  preview/cleanup/export components.
- **Generate concepts:** Image Studio's generate path with the brief's
  5-layer prompt seeds pre-filled and editable; model/quality selectors as in
  Image Studio.
- **Build techpack:** navigates to Techpack Studio pre-filled with the chosen
  concept image + style metadata (name, code, season) via query/state
  hand-off.

Everything produced (CAD tiles, concepts, techpacks) is saved against the
style in a per-style workspace record so returning to the workbench shows the
full history of the refresh.

## Component 4: Pipeline state (studio API + Blob)

- One JSON per refresh: `pipeline/<styleId>.json` — stage, timestamps per
  stage, sampleDueAt, links to produced assets, dismissal reason. Per-item
  files, no shared index (no read-modify-write races); listing via Blob
  prefix scan, cache-busted reads (same pattern as cad-tasks).
- `/api/pipeline` GET (list) / POST (stage transitions). Guarded by the
  existing session auth like every other studio API.
- The local job reads the board state from Blob before ranking so
  non-terminal styles are excluded.

## Error handling

- Job side: any ERP fetch failure aborts the run without side effects
  (cooldowns untouched, latest pointer untouched) + email notification.
- Studio side: missing/unreadable latest.json → Candidates tab shows the
  empty state with the last known date, never a crash.
- Photo mirror failures for an individual style drop that style from the
  day's list (logged) rather than shipping a card with broken images.

## Testing

- Scoring unit tests with a frozen fixture of ERP responses (window math,
  exclusion rules, blend weights, cooldown behavior).
- Publish-path test: snapshot + pointer flip is atomic (simulated partial
  failure leaves previous latest intact).
- Studio: API route tests for pipeline transitions; manual browser QA for
  the feed → workbench → board flow (gstack /browse), as done for the CAD
  async work.

## Out of scope (future extensions)

- Tradeshow-aware due dates (Peter's "Trade Shows by PETER" calendar).
- Auto-drafting Faire/FashionGo listing copy when a refresh completes.
- Feeding completed refreshes into weekly linesheets.
- Vercel-cron ERP pull via erp-mcp-server (phase 2).
- Any automatic image generation in the daily job (explicitly rejected:
  surface + briefs only).
