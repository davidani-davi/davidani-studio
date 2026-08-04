# Compact Nav Upgrade — Categorization & Bundling Plan

Reference: https://compact-nav.framer.website/
Status: PROPOSED — awaiting approval before build.

## 1. What the reference actually is

Deconstructed from a live inspection (screenshots in session scratchpad):

- A **single floating pill**, centered at the top, glassy dark blur background, fully rounded.
- **Left:** logo mark only (no wordmark, no title block).
- **Middle:** 2–3 top-level items. Items that bundle multiple destinations get a **chevron** and open on hover; simple destinations are plain links.
- **Right:** one pill CTA button.
- **Open state:** the pill itself expands downward into a rounded panel containing a **2-column grid of cards**. Each card = small icon + bold title + one-line description. Sibling triggers dim while a dropdown is open. Height/opacity animate smoothly.

The design's core discipline: **few top-level items, everything else bundled into rich dropdown cards.**

## 2. Current state

`components/StudioHeader.tsx` renders a sticky full-width header:
brand block (logo + eyebrow + title + subtitle + version badge) · `TopTabs` (11 flat pill tabs, wrapping to 2 rows) · meta cluster (`JobCenter`, metrics, optional `action`).

`components/TopTabs.tsx` exports `StudioTab` (11 ids) and takes `active` as a prop. **12 files** consume `StudioHeader`/`TopTabs`; the `active` prop contract must survive the upgrade so no call site changes.

11 destinations today (flat):
Image Studio, Single Model Studio, Multi Model Studio, Prompt Studio, Photoshoot Generator, Techpack Studio, Faire SEO, Inspiration, Library, Image Playground, CAD Extractor.

## 3. Categorization analysis

Each destination classified by job-to-be-done:

| Destination | Route | Job | Type |
|---|---|---|---|
| Image Studio | `/` | Generate product/flat-lay shots | **Create** (core) |
| Single Model Studio | `/model-studio` | On-model imagery, one model | Create |
| Multi Model Studio | `/model-studio-beta` | Multi-model imagery (beta) | Create |
| Photoshoot Generator | `/photoshoot-studio` | Consistent multi-shot photoshoots | Create |
| Image Playground | `/image-playground` | Freeform image experiments | Create |
| Prompt Studio | `/prompt-studio` | Craft & refine prompts | **Tool** (supports creation) |
| Techpack Studio | `/techpack-studio` | Generate techpacks | Tool |
| CAD Extractor | `/cad-extractor` | Pull CADs from source files | Tool |
| Faire SEO | `/faire-seo` | Marketplace listing copy/SEO | Tool |
| Inspiration | `/inspiration` | Browse references/moodboards | **Destination** (browse) |
| Library | `/library` | Saved/generated assets | Destination (browse) |

Natural fault line: things that **make images** (5), things that **support production/listing** (4), and things you **browse** (2).

## 4. Proposed top-level structure (recommended)

```
[D logo]   Studios ⌄   Tools ⌄   Inspiration   Library   |   JobCenter · Active badge · action
```

**Studios ⌄** — 2-col card grid (5 cards):
| Card | Description line |
|---|---|
| Image Studio | Product & flat-lay shots from CADs |
| Single Model Studio | On-model imagery with one model |
| Multi Model Studio | Multi-model shoots — beta |
| Photoshoot Generator | Consistent multi-shot photoshoots |
| Image Playground | Freeform image experiments |

**Tools ⌄** — 2-col card grid (4 cards):
| Card | Description line |
|---|---|
| Prompt Studio | Build and refine generation prompts |
| Techpack Studio | Techpacks from style data |
| CAD Extractor | Pull clean CADs from source files |
| Faire SEO | Listing titles & SEO copy for Faire |

**Inspiration**, **Library** — plain links (browse destinations users jump to constantly; burying them in a dropdown adds a hop with no grouping benefit).

**Right cluster** (the reference's CTA slot): `JobCenter` + the live "Active N" jobs badge + per-page `action`. This is our real call-to-attention and stays put.

### Alternatives considered (and why not)
- **3 groups (Create / Prepare / Publish):** splits Tools into two dropdowns of 2 — dropdowns with 2 items feel empty; Faire SEO alone doesn't justify a "Publish" group.
- **By product line (Photos / Models / Ops):** separates Image Studio from the model studios, but users flow between them within one photoshoot job; workflow grouping beats subject grouping.
- **Everything in one "Apps ⌄":** maximally compact but hides the core studios behind one hover for zero categorization value.

## 5. Interaction & visual spec

- Keep the header **sticky full-width** but visually restyle the center as the compact pill (brand block collapses to logo + title on the left, or logo-only inside the pill — decide in build; page title/eyebrow/metrics still needed by pages, so brand block stays left of the pill).
- Pill uses existing polieco tokens: `--polieco-line` border, warm tint background, `backdrop-filter: blur`, radius 9999px. Dropdown panel: same surface, radius ~20px, shadow, 2-col grid, cards with icon (inline SVG, 16px), 13px bold title, 11px soft description.
- **Hover-intent:** open after ~60ms hover, close after ~150ms leave delay (bridge zone so the cursor can travel trigger → panel). Click also toggles (touch/trackpad users).
- **Active state:** the group containing the active route renders as the active pill (ink background); inside the open panel the active card gets a highlighted border. Plain links keep the current active treatment.
- **Dim siblings** while a panel is open (opacity ~0.55), matching the reference.
- **Animation:** panel height/opacity/translateY(-4px→0) at ~180ms ease-out; respect `prefers-reduced-motion`.
- **A11y:** triggers are `<button aria-expanded aria-haspopup="menu">`; Escape closes; focus-visible rings; panel links are real `<Link>`s; keyboard: Enter/Space opens, Tab traverses cards.
- **Mobile (≤ 880px, existing breakpoint):** dropdowns become tap-to-open; panel renders full-width below the header row; no hover logic.

## 6. Implementation plan

1. **`components/TopTabs.tsx`** — keep file name, `StudioTab` type, and `active: StudioTab` prop (12 call sites untouched). Replace the flat map with a `NAV_GROUPS` config: `{ label, items: [{id, label, href, description, icon}] } | { id, label, href }`. Render triggers + panels; local `openGroup` state; hover-intent timers; outside-click/Escape close.
2. **`components/StudioHeader.tsx`** — no API change; minor layout tweak so the pill centers as its own grid area on one row with brand/meta.
3. **`app/globals.css`** — extend `.studio-tabs` for the compact pill; add `.studio-nav-trigger`, `.studio-nav-panel`, `.studio-nav-card`, dim/open/active states, animation, mobile rules; delete now-dead flat-tab wrap rules.
4. **Icons** — small inline SVG set (9 icons) defined in `TopTabs.tsx`; no new deps.
5. **QA** — `/browse`-driven pass: every route reachable through the new nav, active states correct on all 11 pages, dropdown open/close by hover/click/keyboard, mobile viewport (375px), no console errors; screenshots before/after.

## 7. Risks

- Bundling adds one hover before reaching 9 of 11 destinations — mitigated by hover-open (no click needed) and keeping the two highest-frequency browse pages top-level.
- `StudioTab` ids drive active-group mapping; a wrong mapping silently loses active state — covered in QA step across all 11 pages.
