# Handoff — Wording Studio (2026-11-24, Claude Code)

Branch `claude/wording-studio` → PR https://github.com/davidani-davi/davidani-studio/pull/66 (not merged yet).

## Done
- `/wording-studio` page + `/api/wording-studio{,/upload,/worker}`; encrypted Blob jobs (optimistic writes, 2 versions kept).
- Mini worker code `mini-worker/wording/` (Codex ideas + davidani-flatlay mockups, guard before every Codex call).
- Final review by a fresh reviewer; critical + important findings fixed with tests. Suite 1587/1587, build passes.
- Vercel prod env `WORDING_WORKER_TOKEN` set. Mini config `~/.config/davidani/wording-worker.json` (chmod 600).
- Worker files copied to `~/Services/davidani-wording-worker/`; plist in `~/Library/LaunchAgents/com.davidani.wording-worker.plist` — NOT loaded yet.

## Next steps
1. Merge PR #66 once checks are green; wait for the production deploy READY.
2. `launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.davidani.wording-worker.plist`; watch `~/Library/Logs/wording-worker.log` for "worker started".
3. End-to-end on production with the DT78036 photo (recover it from session 382e2059 transcript, first user message). Codex allowance at ~3% (resets Mon Nov 30).
4. UI ship gate screenshots 1280/430/440 (loading, ideas, mockups states).
5. When `mini-worker/wording/*.mjs` changes, re-copy to ~/Services/davidani-wording-worker and `launchctl kickstart -k`.

## Open
- David still has to pick DREAM FREE vs GROW IN GRACE for DT78036 (Jessa @ JNS).
- Deferred minors: Blob host checks (#4/#5), no retry after a mid-mockup allowance stop, WebP saved as .jpg, X-DDTO-TOKEN alone is redirected by proxy.
