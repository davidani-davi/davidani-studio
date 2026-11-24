# Wording Studio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A `/wording-studio` page in davidani-studio where David or the design team upload a garment photo with wording, get evidence-backed English wording ideas, pick 1-3 and get Codex mockups on that garment.

**Architecture:** Studio (Vercel) stores jobs as encrypted Vercel Blob records and exposes a user API (session cookie) and a worker API (bearer token). A Node worker on the Mac mini claims jobs outbound-only, gathers evidence from Journey Postgres + the Faire competitor tracker, writes ideas with one `codex exec` turn and renders mockups with `davidani-flatlay`'s `flatlay.py`.

**Tech Stack:** Next.js 16 / React 18 / TypeScript, `@vercel/blob` (incl. client uploads), vitest 4; worker = Node 20 ESM (`.mjs`) + `psql`, `sqlite3` CLIs, `codex`, `python3`; launchd.

**Spec:** `docs/superpowers/specs/2026-11-24-wording-studio-design.md`

## Global Constraints

- Images: Codex only (`flatlay.py`, `codex exec`). No fal/treg/API image calls; never pass `--allow-credits`.
- Run `python3 ~/.claude/skills/davidani-flatlay/scripts/codex_guard.py` before every Codex call; exit 3 → fail the job with `Codex free allowance used up — resets <date from guard output>`.
- No ERP calls. Sales = Journey Postgres (`DATABASE_URL` from `~/Code/journey/.env`), brand_id 7, `orders.channel='faire'`.
- Ideas: English only, 1-3 short positive words per main line, each with `evidence` that matches a queried row or the literal `untested`.
- Blob records: encrypted like `lib/design-concept-store.ts`, prefix `wording-studio-v1/<hmac namespace>/`, every write to a NEW pathname (`<id>/<seq>.json`); read the highest seq.
- Worker auth: `Authorization: Bearer ${WORDING_WORKER_TOKEN}` (timing-safe compare; missing env → 503 for every call).
- Lease 120 s; heartbeat every 15 s; an expired lease requeues once (`attempts` 1 → 2), then `failed` with `The studio computer stopped answering`.
- UI follows Paper (`~/Code/DESIGN.md`) and the UI ship gate in David's CLAUDE.md: skeletons for every async region, screenshots at 1280, 430 and 440.
- Up to 3 mockups per job, rendered one at a time.

## Review Focus

1. Photo larger than 4.5 MB (iPhone HEIC/JPEG) → must still upload: browser uploads straight to Blob (`@vercel/blob/client` `upload`), never through a function body. Test in Task 3.
2. Mini off or worker down → job sits in `queued_*`; after 120 s without a claim the page shows "Waiting for the studio computer…" instead of a spinner forever. Test in Task 6.
3. Codex weekly allowance at 100% → job `failed` with the allowance message, no Codex call made. Test in Task 5.
4. Custom wording with quotes, ampersands or `$` (e.g. `WALK BY "FAITH" & $LOVE`) → reaches `flatlay.py` intact as one argv item, no shell. Test in Task 5.
5. Codex returns evidence it invented (e.g. "900 units") → that idea's evidence is replaced by `untested`, never shown as fact. Test in Task 5.

---

### Task 1: Job model + Blob store

**Files:**
- Create: `lib/wording-studio/types.ts`, `lib/wording-studio/store.ts`, `lib/wording-studio/jobs.ts`
- Test: `lib/wording-studio/jobs.test.ts`

**Interfaces:**
- Produces:
  - `type JobStatus = 'queued_ideas'|'ideas_running'|'ideas_ready'|'queued_mockups'|'mockups_running'|'done'|'failed'`
  - `type Idea = {id:string; main:string[]; small_top?:string; small_bottom?:string; evidence:string; why:string}`
  - `type Mockup = {wording:string[]; url:string}`
  - `type Job = {id:string; createdAt:string; createdBy:'studio'; photoUrl:string; style?:string; note?:string; category:'top'|'set'|'outerwear'|'dress'|'skirt'|'pants'; status:JobStatus; ideas:Idea[]; chosen:string[][]; mockups:Mockup[]; error?:string; lease?:{token:string; until:number}; attempts:number; seq:number}`
  - `interface JobStore { read(id):Promise<Job|null>; write(job:Job):Promise<Job> /* seq+1, new pathname */; list(limit:number):Promise<Job[]> /* newest first */ }`
  - `wordingStore():JobStore` (Blob) and `memoryStore():JobStore` (tests)
  - `claimNext(store, now:number):Promise<Job|null>` — oldest `queued_ideas|queued_mockups`, or a `*_running` job whose lease expired with `attempts<2`; sets running status, `lease={token:randomUUID(), until:now+120000}`, `attempts+1`. Expired with `attempts>=2` → `failed`.
  - `heartbeat(store,id,lease,now)`, `completeIdeas(store,id,lease,ideas)`, `completeMockups(store,id,lease,mockups)`, `failJob(store,id,lease,message)` — all throw `LeaseError` (→ 409) when the lease token mismatches or expired.
  - `chooseIdeas(store,id,chosen:string[][])` — only from `ideas_ready`, 1-3 entries, each 1-3 lines of ≤ 24 chars → `queued_mockups`.

- [ ] **Step 1: Write failing tests** in `jobs.test.ts` with `memoryStore()`: `claims oldest queued job and sets a 120 s lease`; `requeues an expired lease once then fails with "The studio computer stopped answering"`; `rejects complete with a wrong lease (LeaseError)`; `chooseIdeas rejects 0 or 4 choices and lines over 24 chars`; `write never reuses a pathname` (seq 1,2,3 → three distinct keys in the memory map).
- [ ] **Step 2:** `npx vitest run lib/wording-studio` → FAIL (module not found).
- [ ] **Step 3:** Implement the three files; `store.ts` copies the AES-GCM + HMAC-namespace approach of `lib/design-concept-store.ts` with paths `wording-studio-v1/<ns>/<id>/<seq>.json`, `list()` groups by id and takes max seq.
- [ ] **Step 4:** `npx vitest run lib/wording-studio` → PASS.
- [ ] **Step 5:** Commit `feat(wording-studio): job model and blob store`.

### Task 2: Worker API

**Files:**
- Create: `app/api/wording-studio/worker/route.ts`, test `app/api/wording-studio/worker/route.test.ts`
- Modify: `proxy.ts` (add `/api/wording-studio/worker` to the bypass list next to `/api/design-concepts`)

**Interfaces:**
- Consumes: Task 1 `claimNext`, `heartbeat`, `completeIdeas`, `completeMockups`, `failJob`, `wordingStore`.
- Produces: `POST /api/wording-studio/worker` body `{action:'claim'|'heartbeat'|'complete'|'fail', id?, lease?, ideas?, mockups?, error?}` → `claim`: `{job:Job|null}`; others `{ok:true}`; 401 bad token, 409 lease, 503 token env missing. `complete` with `mockups` carries `{wording, png_base64}`; the route saves each PNG to Blob (`put`, `wording-studio-v1/<ns>/<id>/mockup-<n>-<uuid>.png`, access public) and stores the URL.

- [ ] **Step 1: Failing tests:** `401 without bearer`, `503 when WORDING_WORKER_TOKEN unset`, `claim returns null on empty store`, `complete with stale lease → 409`, `complete mockups stores PNG URLs` (mock `@vercel/blob` `put`).
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3:** Implement; `maxDuration = 60`; request body limit: reject `png_base64` over 6 MB per image with 413.
- [ ] **Step 4:** run → PASS.
- [ ] **Step 5:** Commit `feat(wording-studio): worker API`.

### Task 3: User API + direct photo upload

**Files:**
- Create: `app/api/wording-studio/route.ts`, `app/api/wording-studio/upload/route.ts`, tests beside them.

**Interfaces:**
- Consumes: Task 1.
- Produces:
  - `POST /api/wording-studio/upload` = `handleUpload` from `@vercel/blob/client`; `onBeforeGenerateToken` allows `image/jpeg|png|webp|heic`, `maximumSizeInBytes: 25_000_000`, pathname prefix `wording-studio-uploads/`. (Behind the session proxy.)
  - `POST /api/wording-studio` `{photoUrl, style?, note?, category?}` → 202 `{job}` (photoUrl must be on our Blob host, else 400).
  - `GET /api/wording-studio?id=` → `{job}`; `GET /api/wording-studio` → `{jobs: Job[]}` (20 newest, `lease` stripped).
  - `PATCH /api/wording-studio` `{id, chosen}` → `chooseIdeas`.

- [ ] **Step 1: Failing tests:** `rejects a photoUrl not on the blob host`; `creates queued_ideas job`; `PATCH with 4 choices → 400`; `upload token refuses application/pdf and allows a 20 MB image/heic`.
- [ ] **Step 2:** run → FAIL. **Step 3:** implement. **Step 4:** run → PASS.
- [ ] **Step 5:** Commit `feat(wording-studio): user API and direct upload`.

### Task 4: Evidence gathering (mini)

**Files:**
- Create: `mini-worker/wording/evidence.mjs`, test `mini-worker/wording/evidence.test.mjs`, fixture `mini-worker/wording/fixtures/tracker.sqlite3` (3 rows, built by the test setup).

**Interfaces:**
- Produces: `async function gatherEvidence({pgUrl, trackerDb, days=60}) : Promise<{ours: {style:string,name:string,faire_units:number,faire_stores:number}[], rivals: {brand:string,title:string,bestseller:boolean,days_seen:number}[]}>` — `ours`: top 25 by Faire units from the session's SQL (agent_catalog `name ILIKE '%graphic%'`, category `TOP` or blank, join order_lines/orders, `channel='faire'`); `rivals`: tracker `observations`⋈`captures`, `brand` mapped to shop name from `competitors.json`, title matching `/graphic|lettering|slogan|faith|love/i`, last `days`, brand ≠ Davi & Dani, bestseller first, top 40. Uses `psql -At -c "select json_agg(t) from (...) t"` and `sqlite3 -readonly -json` via `execFile` (no shell).
- `function evidenceLines(ev) : Set<string>` — the strings an idea may cite: `"<units> units · <stores> stores (<style>)"` and `"Competitor Bestseller (<shop>)"`.

- [ ] **Step 1: Failing tests:** `rivals excludes Davi & Dani and non-wording titles` (fixture); `evidenceLines formats "780 units · 103 stores (DT62115)"`.
- [ ] **Step 2:** `npx vitest run mini-worker/wording` → FAIL. **Step 3:** implement. **Step 4:** PASS.
- [ ] **Step 5:** Manual check: `node -e "import('./mini-worker/wording/evidence.mjs').then(m=>m.gatherEvidence({...})).then(e=>console.log(e.ours[0]))"` prints DT62115 with 780 units (± new orders).
- [ ] **Step 6:** Commit `feat(wording-studio): evidence from Journey and the rival tracker`.

### Task 5: Ideas + mockups runner (mini)

**Files:**
- Create: `mini-worker/wording/run.mjs`, `mini-worker/wording/prompt.mjs`, `mini-worker/wording/worker.mjs`, test `mini-worker/wording/run.test.mjs`

**Interfaces:**
- Consumes: Task 2 API, Task 4 `gatherEvidence`, `evidenceLines`.
- Produces:
  - `ideasPrompt(ev, job) : string` — includes the avatar paragraph and the anti-goals from the spec verbatim, the evidence tables, and "Return JSON only: {ideas:[{main:[..],small_top,small_bottom,evidence,why}]} with 8 ideas".
  - `async function runIdeas(job, deps) : Promise<Idea[]>` — guard → download photo to a temp dir → `codex exec --skip-git-repo-check --sandbox workspace-write -C <tmp> -i photo -` with the prompt on stdin → parse last JSON object → `sanitizeIdeas(raw, evidenceLines(ev))`.
  - `function sanitizeIdeas(raw, allowed:Set<string>) : Idea[]` — drops non-English (`/[^\x20-\x7E]/`), main lines > 24 chars or > 3 lines, caps 8, sets `evidence='untested'` when not in `allowed`, adds `id`.
  - `async function runMockups(job, deps) : Promise<{wording:string[], png_base64:string}[]>` — guard per render → `execFile('python3',[flatlay.py, photo,'--category',job.category,'--title',…,'--change',changeSentence(wording, job.note),'--variants','1','--out',tmp,'--name','m'+n])`, sequential.
  - `changeSentence(lines:string[], note?:string) : string` — today's DT78036 sentence with the lines substituted (`"Replace the existing wording with <L1> on the first line and <L2> on the second, in the same raised tone-on-tone technique, same size, same placement…"`) + note.
  - `worker.mjs`: claim/heartbeat/complete/fail loop modelled on `~/Services/davidani-listing-worker/mini-worker/worker.cjs` (15 s poll, retry `complete` 4× on network error, never on 403/409); config file `~/.config/davidani/wording-worker.json` `{endpoint, token, pgUrl, trackerDb}` chmod 600.
  - `deps` = `{exec, guard, fetch}` injected for tests.

- [ ] **Step 1: Failing tests:** `guard exit 3 → throws "Codex free allowance used up — resets …" and exec never called`; `sanitizeIdeas replaces invented evidence with untested`; `sanitizeIdeas drops non-English lines`; `custom wording with quotes, & and $ reaches flatlay as one argv item` (assert the `--change` arg contains `WALK BY "FAITH" & $LOVE`); `runMockups renders sequentially` (exec calls never overlap).
- [ ] **Step 2:** run → FAIL. **Step 3:** implement. **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat(wording-studio): mini ideas and mockup runner`.

### Task 6: Page + nav

**Files:**
- Create: `app/wording-studio/page.tsx`, `components/WordingStudioClient.tsx`, `components/WordingStudioClient.test.tsx`
- Modify: `components/TopTabs.tsx` (entry `{id:'wording', label:'Wording Studio', href:'/wording-studio', description:'Fix graphic wording with sales proof'}` after CAD Extractor, 16 px stroke icon in the same style)

**Interfaces:**
- Consumes: Task 3 API.
- Produces: the page. States: upload card (drop/choose photo, style #, note, category select default `top`) → job view polling `GET ?id=` every 4 s: `queued_*` > 120 s old with no claim → "Waiting for the studio computer…"; `ideas_running` → 8 skeleton idea cards; `ideas_ready` → idea cards (main lines large, small lines muted, evidence chip, why), checkbox up to 3, "Add your own" row (up to 3 lines), primary button "Mock up (n)"; `mockups_running` → skeleton tiles 4:5; `done` → tiles with fade-in + Download via `/api/download`; `failed` → error text + "Start again". Past jobs list (thumbnail, first chosen wording, status, date). Class names prefixed `ws-` (no clashes).

- [ ] **Step 1: Failing tests** (React Testing Library, like `RoutingPanel.test.tsx`): `shows waiting message after 120 s queued`; `limits selection to 3`; `Mock up disabled with 0 selected`.
- [ ] **Step 2:** run → FAIL. **Step 3:** implement. **Step 4:** PASS; `npm run build` passes.
- [ ] **Step 5:** Commit `feat(wording-studio): page and nav tab`.

### Task 7: Ship

- [ ] **Step 1:** Generate `WORDING_WORKER_TOKEN` (32 random bytes, base64url); add to Vercel production env via the Vercel MCP `create_project_env` (team `team_QLL8BnNiuU8LzmG5DgWtFSMQ`); write `~/.config/davidani/wording-worker.json` (chmod 600).
- [ ] **Step 2:** Add `ops/launchd/com.davidani.wording-worker.plist` (KeepAlive, `node mini-worker/wording/worker.mjs <config>`, logs `~/Library/Logs/wording-worker.log`, PATH incl. `/opt/homebrew/bin:~/.local/bin`), load it.
- [ ] **Step 3:** Open PR, merge to `main` after CI + review; wait for the production deploy READY.
- [ ] **Step 4:** End to end on production with DT78036 (`images/1.png` from the 2026-11-24 session, also in the spec's run): ideas arrive with real evidence (DREAM FREE line cites `780 units · 103 stores (DT62115)` or newer numbers), choose DREAM FREE + one other, two mockups render.
- [ ] **Step 5:** UI ship gate: Playwright screenshots of every state at 1280, 430, 440; look at them; fix; note what was not checked (real iPhone Safari).
- [ ] **Step 6:** Write `.agents/handoff.md`, commit, push.
