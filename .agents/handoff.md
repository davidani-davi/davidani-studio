# Handoff — Wording Studio (2026-11-24, Claude Code)

LIVE: https://davidani-studio.vercel.app/wording-studio (PR #66 merged 4c2b9bd). Worker fixes PR on `claude/wording-dedupe`.

## State
- Page + API on production; jobs are encrypted Vercel Blob records (optimistic writes, 2 versions kept).
- Mini worker: launchd `com.davidani.wording-worker` (RUNNING) → `~/Services/davidani-wording-worker/*.mjs`
  (a COPY of `mini-worker/wording/`, tests excluded), config `~/.config/davidani/wording-worker.json` (chmod 600),
  log `~/Library/Logs/wording-worker.log`. Vercel prod env `WORDING_WORKER_TOKEN`.
- flatlay needs `/usr/bin/python3` (numpy/Pillow); Homebrew python3 lacks them (`WORDING_PYTHON` overrides).
- Verified live 2026-11-24 on DT78036: 8 ideas in ~18 s with real evidence, 2 mockups in ~2 min, screenshots
  1280/430/440 clean (no overflow, no broken images). Run kit: `~/Library/Archive/wording-studio-e2e-2026-11-24/e2e.py`.

## Changing the worker
Edit `mini-worker/wording/`, test, merge, then copy the non-test `.mjs` files to ~/Services/davidani-wording-worker
and `launchctl kickstart -k gui/$(id -u)/com.davidani.wording-worker`.

## Open
- David still picks DREAM FREE vs GROW IN GRACE (or WALK BY FAITH) for DT78036 → reply to Jessa @ JNS.
- Deferred minors: Blob host checks (#4/#5 in review), no retry after a mid-mockup allowance stop, WebP saved
  as .jpg, X-DDTO-TOKEN alone is redirected by proxy, two "New job" buttons on the done view.
