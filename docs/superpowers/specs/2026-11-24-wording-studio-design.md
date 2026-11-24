# Wording Studio — design (2026-11-24)

## Why

Factory samples and design-team artwork often carry wording that won't sell (DT78036 "GREEN PLANTS",
Nov 23 email from Jessa at JNS). On 2026-11-24 David found the replacement by hand in a chat: own Faire
sales → competitor bestsellers → customer avatar → two Codex mockups (DREAM FREE, GROW IN GRACE). He wants
that loop as a Studio page he and the design team can run themselves, without a chat.

Users: David reviewing factory samples, and the design team checking wording before artwork goes to the factory.

## Goals

- Upload one photo of a garment with wording or a text graphic, plus optional style number and note.
- Get ~8 English wording ideas, each with its evidence line (our Faire units/stores, competitor Bestseller
  badge, or "untested") and a one-line "why it fits our customer".
- Pick 1-3 ideas (or type your own) → mockups on that exact garment, same technique, same layout.
- Download the mockups; job history so the team can see past runs.

## Non-goals

- Production artwork files for the factory (the mockup is for choosing, the factory redraws).
- Emailing the factory. Motif/graphic redesign beyond wording (that is /davidani-design).
- Non-English wording (David: "only English").

## Anti-goals (a failure even if it works)

- Any paid image call (fal, treg, API). Images are Codex on David's ChatGPT plan only.
- Ideas without evidence, or evidence that is invented. Every number must come from a query in this run.
- Clever, slangy or long phrases. Winners are 1-3 short, positive words (DREAM FREE, LOVE, Walk By Faith).
- Loading the ERP. Sales come from Journey's Postgres mirror only.
- Silently spending Codex credits past the free weekly allowance.

## Constraints

- Studio is Next.js on Vercel (`davidani-studio`, prod deploys from `main`). Sales data (Journey Postgres,
  `order_lines` + `orders.channel='faire'` + `agent_catalog`), the competitor tracker
  (`~/Services/davidani-faire-management/faire-daily/data/design_research.sqlite3` + `competitors.json`) and Codex all
  live on the Mac mini.
- The mini makes outbound calls only (no tunnel), like the Listing Team worker
  (`~/Services/davidani-listing-worker/mini-worker/worker.cjs`: claim → heartbeat → complete/fail with a lease).
- Codex guard (`~/.claude/skills/davidani-flatlay/scripts/codex_guard.py`) must run before every Codex call;
  at 100% the job fails with "Codex free allowance used up — resets <date>", never `--allow-credits`.
- Avatar (from leadership's Oct 12 note, no age data): boutique buyers, many small-town Southern; their
  customer now mostly 40s-50s women. Plus buyers matter.

## Approaches

- **A. Studio page + mini worker for ideas and mockups (chosen by David).** Free, reuses today's exact recipe.
  Costs: ~1 min for ideas, nothing runs while the mini is off.
- B. Nightly evidence snapshot to Blob + instant ideas from a paid text model in Studio; mini only renders.
  Faster ideas, two places to sync, small paid cost. Can be added later.
- C. Standalone page on the mini. Simplest, but not in Studio, and team laptops can't reach tailnet links reliably.

## Design

### Studio (Vercel)

- Page `/wording-studio` behind the existing Studio login; linked from the home page.
- Flow: upload (photo, optional style #, note) → "Finding ideas…" skeleton list → idea cards (wording, small
  lines, evidence chip, why) with checkboxes + "Add your own" → "Mock up" → skeleton tiles → mockup tiles
  with download. Past jobs list below. Phone layout tested at 430/440.
- Storage: encrypted Vercel Blob records, same pattern as `lib/design-concept-store.ts` (new prefix
  `wording-studio-v1`); each record version written to a NEW pathname (public Blob overwrites read stale).
- Job states: `queued_ideas → ideas_running → ideas_ready → queued_mockups → mockups_running → done | failed`.
- Worker API `POST /api/wording-studio/worker` with `Authorization: Bearer WORDING_WORKER_TOKEN`
  (new env var), actions `claim`, `heartbeat`, `complete`, `fail`; lease 2 min, renewed by heartbeat;
  an expired lease returns the job to the queue once, then fails it.
- User API `POST/GET /api/wording-studio` (create job, read job, choose ideas) behind the Studio session.

### Mini worker

- New launchd job `com.davidani.wording-worker`, code in this repo under `mini-worker/wording/`, polls `claim`
  every 15 s.
- **Ideas job:** (1) Journey query: graphic/text tops ranked by Faire units + stores (today's SQL);
  (2) tracker: competitor items with Bestseller badge whose titles carry wording, last 60 days;
  (3) one Codex text turn with the photo, the evidence tables, the avatar and the rules above → JSON ideas
  `{main, small_top, small_bottom, evidence, why}`; the worker drops any evidence string it can't match to a
  queried row.
- **Mockups job:** for each chosen wording, `flatlay.py <photo> --category <auto> --change "<replace the wording
  with …, same technique, size, placement; remove nothing else>"` (today's sentence, plus any note), 1 variant,
  run one at a time; upload PNGs back through `complete`.

## Left to the builder

- Exact SQL and regex for "graphic/text" titles (start from today's queries in this design's session).
- Category auto-detection (default `top`; let the user override).
- UI details within Paper (`~/Code/DESIGN.md`) and the UI ship gate in David's CLAUDE.md.

## My calls (David, check these)

- Up to 3 mockups per job, run one at a time on the mini.
- Ideas are written by Codex (free) rather than a fixed list, but must cite only queried numbers.
- The "remove accessories" kind of fix rides in the free-text note, not as its own control.
