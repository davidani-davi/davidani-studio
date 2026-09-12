# Paper Studio and Creative Lab

Studio follows the shared Paper 0.9 specification in `~/Code/DESIGN.md`:
Inter 400/500, `#F4F3EF` pages, white sheets, 3px corners, hairline borders,
visible navigation and actions, and no gradients or decorative shadows.
`app/paper.css` owns the tokens and shared presentation. Existing photography
components consume those tokens through their legacy aliases.

## Workspaces

- `/home`: shared directory; also the default destination after a direct login.
- `/`: existing product photography workspace and existing bookmarks.
- `/creative-lab`: model comparison and reference-driven image exploration.
- `/image-playground`: preserved entry to the same Creative Lab and browser history.
- Season Plan and external Playground are links to their existing deployments.
  They retain separate authentication, storage, and services; this does not move
  the external Playground off the Mac mini.

All Studio tools, reference identities, and model administration share the
Paper navigation. On phones the page scrolls normally, controls remain reachable,
and the product/model composer no longer hides when the run list scrolls.

## Creative Lab

The comparison workflow is inspired by `koppkvn/image-gen-open-source`.
It uses Studio's existing image providers and authentication, with no copied
Codex local server, new provider credentials, or additional account connection.
Each entered concept is sent to every selected model, with the same ordered
references. Results record their model/version, settings, original references,
and concept index. A failed result can be retried individually using that
snapshot even after the draft changes. Empty provider responses are failures.

Use as reference prepares the next experiment. Use in Studio prepares a style
reference in product photography without making any image request. It does not
replace the garment intake photo. Downloads use Studio's existing download proxy.

History and reference libraries keep the existing browser-storage keys. Loading
an old batch restores its references and model selection without submitting it.
Generations remain browser-driven: keep the workspace open until they finish.
Cost figures are estimates, not provider usage receipts or spending caps.
A reference is required by Studio's existing editing endpoints. No Codex planner
or subscription image-generation route is included in this integration.

## Verification

- Full Vitest suite and production build.
- 15 app routes at 1440, 768, 430, and 440px; no page overflow or JS errors.
- Browser comparison, individual retry, legacy history, reference reuse, and
  handoff to Studio exercised with mocked providers; no paid generation.
- Chromium viewport checks do not claim physical iPhone/WebKit verification.
