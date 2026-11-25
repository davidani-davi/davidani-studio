// Copied from davidani-faire-management thumbnail-optimizer/model_shots_core.js (f5880f33).
// Do not edit by hand: scripts/sync-model-shots-core.sh re-copies it so the web Model Studio and the
// Faire extension plan runs with the same rules (setup key, framing, borrow, file names).
// Pure rules for the model-shot panel (model_shots.js), shared by the Faire
// drawer and the ERP panel and unit-tested in node (test_model_shots_core.js).
//
// The one rule here that is not cosmetic is the FILENAME. The ERP gallery is
// read back by po_watch.kit_gallery_paths, which keeps only files whose name
// carries the style token — a shot uploaded as "output_1.png" lands in the
// ERP and stays invisible to the listing kit, the photo picker and the
// one-click List button. So the name is built, not chosen.
(function (root) {
  "use strict";

  const VIEWS = ["front", "side", "back", "full"];
  const VIEW_LABEL = { front: "Front", side: "Side", back: "Back", full: "Full shot" };

  // Faire's listing photos frame by garment: pants and skirts are shot from the
  // waist down (front, side and back) plus one full shot; tops and
  // outerwear head to mid-thigh; dresses, sets and jumpsuits full-length. The
  // studio holds the matching plate families and picks by the category we
  // send (davidani-studio lib/plate-framing.ts) -- the two rules must agree.
  // Pants and skirts share one bottom-half collection (2026-10-12): front, side and
  // back from the waist down, plus one full shot (back again 2026-10-13, David) on a
  // full-body photo picked from the ERP or uploaded, since those shoots are waist-down.
  function isBottoms(category) { return BOTTOMS.has(category); }
  function viewsFor(category) {
    return VIEWS;
  }
  const FULL_BASE_MISSING = "Choose a full-body photo for the full shot: pick one from the ERP or upload your own.";
  /** Why a bottoms full shot cannot run yet: no full-body photo picked and the set has none of its own. */
  function fullBaseIssue(category, pose, hem, fullBase) {
    if (!isBottoms(category) || fullBase) return "";
    return referencesFor(category, pose, hem)?.full ? "" : FULL_BASE_MISSING;
  }
  // Faire taxonomy name -> category, in order: a "Top & Pant Set" is a set
  // before it is pants, a "Shirt Jacket" outerwear before a shirt.
  const TYPE_RULES = [
    [/\bset\b/i, "set"],
    [/jumpsuit|romper|overall|dress|gown/i, "dress"],
    [/skirt|skort/i, "skirt"],
    [/pants|shorts|jeans|leggings|trousers|joggers|culottes/i, "pants"],
    [/jacket|coat|shacket|kimono|outerwear|bomber|puffer|blazer|cape|poncho/i, "outerwear"],
    [/top|shirt|blouse|sweater|cardigan|tee|hoodie|sweatshirt|tunic|vest|tank|cami/i, "top"],
  ];
  function categoryOf(text) {
    const t = String(text || "");
    for (const [re, cat] of TYPE_RULES) if (re.test(t)) return cat;
    return "unknown";
  }
  /** The category a run is planned with: the taxonomy name from the style code
   *  (exact for every code), else the title's words, else "unknown" = full-length. */
  function categoryFor(known) {
    const k = known || {};
    const c = categoryOf(k.type);
    return c !== "unknown" ? c : /^[DP](?:[EW])?P\d/i.test(String(k.styleCode || "").trim()) ? "pants" : categoryOf(k.title);
  }
  // Where the garment ends, from our own copy (studio lib/plate-framing.ts
  // hemFor — the two must agree). A long top or layer is shot full-length in
  // every view: the crop plate has no room for a hem below mid-thigh, and
  // DJ67094's longline coat (2026-09-05) came back a shacket on the side and a
  // stretched tent on the front for exactly that. A coat of any kind counts;
  // "cropped" wins; "long sleeve" is not a hem. "Longline" alone is not long
  // (David, 2026-11-02): a longline cardigan's front is head-to-thigh like any
  // top's, and only the full shot shows the whole length (DCJ67197's Front and
  // Full were the same head-to-toe picture). The studio prompt keeps its hem
  // past the frame edge.
  const LONG_HEM_RE =
    /\b(pea|over|top|rain|trench|duster|long)?coat\b|\btrench\b|\bduster\b|\bmaxi\b|mid-?calf|calf-?length|ankle-?length|floor-?length|full-?length/i;
  // A hem that ends at the knee (knee-length, midi) is "mid": front, side and
  // back shoot on the head-to-knee "knee NN" plate where one is installed.
  const MID_HEM_RE = /knee-?length|\bmidi\b|below[- ]the[- ]knee|below-?knee|at[- ]the[- ]knee|\bknee\b/i;
  const SHORT_HEM_RE = /\bcropped\b|\bcrop\b/i;
  function hemFor(known) {
    const k = known || {};
    const explicit = String(k.hem || "").toLowerCase();
    if (explicit === "long" || explicit === "mid" || explicit === "short") return explicit;
    const text = `${typeof k.type === "string" ? k.type : ""} ${typeof k.title === "string" ? k.title : ""}`;
    if (SHORT_HEM_RE.test(text)) return "short";
    if (MID_HEM_RE.test(text)) return "mid";
    return LONG_HEM_RE.test(text) ? "long" : "";
  }
  const LAYER = (category) => category === "top" || category === "outerwear";
  /** The plate family a layer's front/side/back are shot on for its hem. */
  function layerFraming(category, hem) {
    if (BOTTOMS.has(category)) return "low";
    if (!LAYER(category)) return "full";
    return hem === "long" ? "full" : hem === "mid" ? "knee" : "crop";
  }
  const PLAN = {
    pants: "pants · front, side and back from the waist down, plus one full shot",
    skirt: "skirt · front, side and back from the waist down, plus one full shot",
    top: "top · front, side and back head-to-thigh, plus one full shot",
    outerwear: "outerwear · front, side and back head-to-thigh, plus one full shot",
    dress: "dress · full-length front, side, back and full",
    set: "set · full-length front, side, back and full",
  };
  function planLabel(category, hem) {
    if (hem === "long" && (category === "top" || category === "outerwear")) {
      return `long ${category} · full-length front, side, back and full — the hem is in every frame`;
    }
    if (hem === "mid" && (category === "top" || category === "outerwear")) {
      return `knee-length ${category} · front, side and back head-to-knee, plus one full shot`;
    }
    return PLAN[category] || "full-length front, side, back and full";
  }

  const BOTTOMS = new Set(["pants", "skirt"]);
  /** The plates a picker offers for a category. Pants and skirts (DP and DS)
   *  share one bottom-half collection — real shoots, waist-down, face-free,
   *  front/side/back (2026-10-12: the house waist-down plates have no back, so
   *  a skirt had nothing Simple could use). A skirt shows legs below its hem,
   *  so bare-legged (shorts) bases come first for it. */
  function platesFor(category, models) {
    const all = (Array.isArray(models) ? models : []).filter(m => !m.categories || m.categories.includes(category));
    if (!BOTTOMS.has(category)) return { models: all, filtered: false, note: "" };
    const order = ["studio 103", "pants-dp62024", "pants-dp67305", "pants-dp60245", "pants-dp62024a", "pants-dp43109", "pants-dp69017", "pants-dp67040", "pants-dp60197b"];
    const rank = m => (category === "skirt" && m.wears !== "shorts" ? 1000 : 0) + (order.includes(m.id) ? order.indexOf(m.id) : 999);
    const bottoms = all.filter(m => m.referenceKind === "pants" || order.includes(m.id)).sort((a, b) => rank(a) - rank(b));
    return { models: bottoms, filtered: true, note: bottoms.length ? "Front · Side · Back" : "No bottoms references available. Refresh models to load the collection." };
  }
  /** The picker's front row (2.48.0, David 2026-09-07: "there are so many
   *  options… not really easy on the eye"). Seventy-nine tiles were one per
   *  plate; the house character has three poses, each photographed once and
   *  re-headed per expression, so the row is one card per POSE with the
   *  expressions inside it — plus the user's own plates. Everything else (the
   *  photographed models, the wardrobe variants the studio never assigns by
   *  itself) waits behind "All models". The bottoms filter (platesFor) still
   *  applies first, so a skirt never sees a plate it cannot be painted onto. */
  const EXPRESSIONS = ["neutral", "smile", "teeth", "smirk"];
  const EXPRESSION_LABEL = { neutral: "Neutral", smile: "Smile", teeth: "Big smile", smirk: "Smirk" };
  function poseLabel(pose) {
    const t = String(pose || "").toLowerCase();
    if (/arms? relaxed|arms? at sides?/.test(t)) return "Arms at sides";
    if (/arm raised/.test(t)) return "Arm raised";
    if (/hands? in pockets?/.test(t)) return "Hand in pocket";
    if (/weight on one leg/.test(t)) return "Weight on one leg";
    const rest = t.replace(/^standing,?\s*/, "").split(",")[0].trim();
    return rest ? rest[0].toUpperCase() + rest.slice(1) : "Pose";
  }
  const DRAFT_PREFIX = "Draft · ";
  function isDraftSet(m) { return Boolean(m?.userAdded) && String(m.name || "").startsWith(DRAFT_PREFIX); }
  /** "Draft · Jeonga · Blue linen set" → "Blue linen set". */
  function draftName(name) { const parts = String(name || "").slice(DRAFT_PREFIX.length).split(" · "); return parts.length > 1 ? parts.slice(1).join(" · ") : parts[0]; }
  function looksFor(category, models) {
    const offer = platesFor(category, models);
    if (isBottoms(category)) return { ...offer, others: [], looks: offer.models.flatMap(m => (m.poses || []).map(p => ({
      key: `${m.id}/${p.id}`, label: m.id === "studio 103" ? "DP52083 · Donuts" : m.name || m.id, own: true,
      plates: [{modelId: m.id, poseId: p.id, expression: "", pose: p}],
    }))) };
    const looks = [];
    const byKey = new Map();
    const others = [];
    offer.models.forEach((m) => {
      const pose = (m.poses || [])[0];
      if (!pose) return;
      if (m.userAdded || m.managed) {
        // Listing Team drafts ("Draft · <author> · <name>") reach only their author; show just the name.
        const draft = isDraftSet(m), name = draft ? draftName(m.name) : m.name || m.id;
        m.poses.forEach(p => looks.push({ key: m.poses.length > 1 ? `${m.id}/${p.id}` : m.id, label: m.poses.length > 1 ? `${name} · ${p.label}` : name, own: true,
                     ...(draft ? { draft: true, createdAt: m.createdAt || "" } : {}),
                     plates: [{ modelId: m.id, poseId: p.id, expression: "", pose: p }] }));
        return;
      }
      if (!m.character || m.autoPool === false || !m.poseKey) { others.push(m); return; }
      let look = byKey.get(m.poseKey);
      if (!look) {
        look = { key: m.poseKey, label: poseLabel(m.pose), own: false, plates: [] };
        byKey.set(m.poseKey, look);
        looks.push(look);
      }
      look.plates.push({ modelId: m.id, poseId: pose.id, expression: m.expression || "", pose });
    });
    const rank = (e) => { const i = EXPRESSIONS.indexOf(e); return i < 0 ? EXPRESSIONS.length : i; };
    looks.forEach((l) => l.plates.sort((a, b) => rank(a.expression) - rank(b.expression)));
    // Her own reference sets lead the picker, newest first (a stable sort keeps the rest in order).
    const drafts = looks.filter(l => l.draft).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    return { looks: [...drafts, ...looks.filter(l => !l.draft)], others, note: offer.note, filtered: offer.filtered };
  }
  /** The look a picked plate belongs to, so the picker can open its expressions. */
  function lookOf(looks, modelId, poseId) {
    return (looks || []).find((l) => l.plates.some((p) => p.modelId === modelId && (!poseId || p.poseId === poseId))) || null;
  }
  function expressionLabel(e) { return EXPRESSION_LABEL[e] || (e ? e[0].toUpperCase() + e.slice(1) : ""); }

  /** The preview a picker shows: the framing the category's front view is
   *  shot on (davidani-studio lib/plate-framing.ts) — waist-down for a bottom,
   *  head-to-thigh for a top or outerwear, the full plate otherwise. */
  function previewFor(category, pose, hem) {
    const p = pose || {};
    const fam = layerFraming(category, hem);
    const preview = (p.previews && (p.previews[fam] || (fam === "knee" && p.previews.full))) || p.preview || "";
    // These front files were replaced in place. Pin the approved master revision
    // so an older browser image cache cannot keep showing the retired references.
    const master = {
      97: "f77c4970361a8c52", 98: "f10f3e9a0ed8b61c",
      99: "4806dfc8bc087ced", 100: "f89baab006a294cb5",
    };
    const match = preview.match(/^\/models\/(?:studio|crop) (97|98|99|100)\/front\.png$/);
    return match ? preview + "?ref=" + master[match[1]] : preview;
  }

  // 2.186.1 (David, 2026-11-02): a reference card shows the part of the photo a Simple front covers.
  // Sets shot full-length (house studio plates, ERP shoot sets) and with no framed picture of their own
  // show their top 60% (head to thigh) for short tops, or 78% (head to knee) for mid-length ones.
  // Drafts are uploaded already framed, so they stay whole; dresses, long tops and bottoms stay whole too.
  // Returns the visible band as fractions of the photo's height, or null for the whole photo.
  function previewCropFor(category, pose, hem, draft) {
    const p = pose || {}, fam = layerFraming(category, hem);
    if (draft || !p.preview || (fam !== "crop" && fam !== "knee")) return null;
    const own = p.previews && p.previews[fam];
    if (own && own !== p.preview) return null;
    return { top: 0, bottom: fam === "crop" ? 0.6 : 0.78 };
  }

  /** ASCII, style-token-first, colour when we know it: "DWJ62218 NAVY BLUE MODEL FRONT.jpg".
   *  `seq` disambiguates a re-run so a second front does not overwrite the first. */
  // A garment photo David uploads himself: style token first (the listing
  // kit only keeps gallery files whose name carries it), then a slug of his
  // own filename, then the order it was picked in (1 = front, 2 = back).
  function ownFilename(style, original, n) {
    const base = String(original || "photo").replace(/\.[a-z0-9]+$/i, "")
      .replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "photo";
    return `${String(style || "").toUpperCase()}_OWN_${base}_${n}.jpg`;
  }

  function shotFilename(style, view, color, seq) {
    const clean = (s) =>
      String(s || "")
        .toUpperCase()
        .replace(/[^A-Z0-9 ]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    const parts = [clean(style), clean(color), "MODEL", clean(VIEW_LABEL[view] || view)];
    const stem = parts.filter(Boolean).join(" ");
    return `${stem}${seq && seq > 1 ? ` ${seq}` : ""}.jpg`;
  }

  /** The garment photos a run starts from: the picked ones, front first, max 2.
   *  Two photos are the front and back of ONE garment (the studio's contract). */
  // Auto-select only unambiguous, exact ERP MODEL filenames for this style/color.
  // Generated revisions with sequence suffixes never replace the original input.
  function matchOutfitSources(style,color,photos) {
    const out={}; if(!color)return out;
    const normalized=s=>String(s||"").toUpperCase().replace(/\s+/g," ").trim();
    for(const [view,label] of [["front","FRONT"],["side","SIDE"],["back","BACK"],["full","FULL SHOT"]]) {
      const stem=normalized(`${style} ${color} MODEL ${label}`);
      const matches=(photos||[]).filter(p=>{let name;try{name=decodeURIComponent(p.filename||"");}catch{return false;}return normalized(name.replace(/\.(png|jpe?g)$/i,""))===stem && /^https:\/\//.test(p.fullUrl||"");});
      if(matches.length===1)out[view]=matches[0].fullUrl;
    }
    return out;
  }

  function garmentRefs(picked) {
    return (picked || []).filter(Boolean).slice(0, 2);
  }

  /** The default: let the studio assign the model from the style code, so the
   *  catalogue stops being one woman in one stance under every garment. A
   *  named model overrides it for a style that needs a particular look. */
  const AUTO_MODEL = "auto";

  /** Whether Generate can fire, and why not. */
  function canGenerate({ garments, humanModelId, poseId, busy, hasKey }) {
    if (!hasKey) return { ok: false, why: "Add the studio key in the Daily list's settings first." };
    if (!(garments || []).length) return { ok: false, why: "Pick the garment photo this run starts from." };
    if (humanModelId !== AUTO_MODEL && (!humanModelId || !poseId)) {
      return { ok: false, why: "Pick the model to shoot it on." };
    }
    if (busy) return { ok: false, why: "Still generating." };
    return { ok: true, why: "" };
  }

  /** Concise action targets, in the same order as the view grid. */
  function viewSelectionLabel(views, total = VIEWS.length) {
    const selected = VIEWS.filter(v => (views || []).includes(v));
    if (!selected.length) return "selected views";
    if (selected.length === total) return `all ${total} views`;
    if (selected.length > 2) return `selected ${selected.length} views`;
    return selected.map(v => VIEW_LABEL[v].toLowerCase()).join(" and ");
  }
  function restoreSlots(category, saved) {
    return newRun(category).map(slot => (saved || []).find(s => s.view === slot.view) || slot);
  }
  function referencesFor(category, pose, hem) {
    const framing = layerFraming(category, hem);
    return pose?.references?.[framing] || (framing === "knee" ? pose?.references?.full : undefined);
  }
  // 2.197.0: the reference set viewer (model_shots.js openSetViewer).
  const FRAMINGS = ["crop", "knee", "full", "low"];
  const FRAMING_LABEL = { crop: "Tops · head to thigh", knee: "Knee", full: "Full length", low: "Bottoms · waist down" };
  /** The framings a set has at least one photo for, in a fixed order. */
  function setFramings(pose) {
    const r = (pose && pose.references) || {};
    return FRAMINGS.filter(f => r[f] && VIEWS.some(v => r[f][v]));
  }
  /** The framing the viewer opens on: the one this style would use (knee falls back to full), else the first. */
  function viewerFraming(category, hem, pose) {
    const list = setFramings(pose), want = layerFraming(category, hem);
    return list.includes(want) ? want : want === "knee" && list.includes("full") ? "full" : list[0] || "";
  }
  const FACE_SPOT = { full: { fx: 0.5, fy: 0.1, scale: 3.2 }, knee: { fx: 0.5, fy: 0.14, scale: 2.6 }, crop: { fx: 0.5, fy: 0.17, scale: 2.2 } };
  const faceScale = h => Math.min(6, Math.max(1.5, 0.55 / Math.max(h, 0.01)));
  /** Where Face zooms: the centre (fractions of the photo) and a factor of the fitted size; null = no head in it.
   *  The face outline the studio found comes first, then a house set's protected head rows, then a framing default. */
  function faceFocus(ref, framing) {
    if (!ref || framing === "low") return null;
    const c = ref.autoContour;
    if (c && c.kind === "no-head") return null;
    if (c && Array.isArray(c.points) && c.points.length > 2 && c.width > 0 && c.height > 0) {
      const xs = c.points.map(p => p[0]), ys = c.points.map(p => p[1]);
      const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
      return { fx: (x0 + x1) / 2 / c.width, fy: (y0 + y1) / 2 / c.height, scale: faceScale((y1 - y0) / c.height) };
    }
    const p = ref.protection;
    if (p && p.protectedRows > 0 && p.height > 0) { const h = p.protectedRows / p.height; return { fx: 0.5, fy: h / 2, scale: faceScale(h) }; }
    return { ...(FACE_SPOT[framing] || FACE_SPOT.full) };
  }
  /** Who a set belongs to, from the catalog alone (the server's reference-edit info has the last word). */
  function setKind(m) {
    if (isDraftSet(m)) { const parts = String(m.name).slice(DRAFT_PREFIX.length).split(" · "); return { kind: "team", name: draftName(m.name), author: parts.length > 1 ? parts[0] : "" }; }
    return { kind: m && m.userAdded ? "saved" : "house", name: (m && (m.name || m.id)) || "", author: "" };
  }
  function setKindLabel(k) {
    if (!k) return "";
    if (k.mine) return "Your set";
    return k.kind === "team" ? (k.author ? `Team set · ${k.author}` : "Team set") : k.kind === "saved" ? "Saved set" : "House set";
  }
  function simpleReferenceIssue(category, pose, hem, views = viewsFor(category)) {
    const refs = referencesFor(category, pose, hem);
    // A bottoms set is waist-down: its full shot runs on a picked full-body photo (fullBaseIssue).
    if (isBottoms(category)) views = views.filter(view => view !== "full" || refs?.full);
    if (views.some(view => !refs?.[view])) return "This set is missing a required view. Choose a complete reference set or use Direct outfit edit.";
    if (views.some(view => refs[view].reframed)) {
      const framing = layerFraming(category, hem);
      const label = framing === "full" ? "full-length" : framing === "low" ? "waist-down" : framing === "knee" ? "head-to-knee" : "head-to-thigh";
      return `This garment needs ${label} references. This set uses different framing. Choose a matching reference set or use Direct outfit edit.`;
    }
    // An uploaded set's photo (an https Blob URL) is protected only by the face outline the studio found
    // when it was saved; without one, Simple garment swap refuses that view.
    const bare = views.filter(view => /^https:/.test(refs[view].publicPath || "") && !refs[view].autoContour);
    if (bare.length) return `Model Studio could not outline the face in the ${bare.map(v => VIEW_LABEL[v].toLowerCase()).join(" and ")} photo of this set. Choose another set, or replace that photo with a clearer one (head fully in frame, garment neckline visible).`;
    return "";
  }
  function newRun(category) {
    return viewsFor(category).map((view) => ({ view, status: "queued", url: "", error: "", approved: false }));
  }

  /** The operator's fix note for a Redo, as the studio receives it: one line,
   *  no control characters, 300 characters. Empty stays empty. */
  function fixNote(text) {
    return String(text || "").replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 300);
  }

  // 2.181.0 (David, 2026-10-30): every reference offers two options. "Fit + pose" is the run as it
  // always was (the reference lends its pose and, in practice, how its own clothes sit); "Pose only"
  // lends just the pose, and the studio decides the fit from the style and the other colours' notes.
  // Pose only is the default and listed first (David: ~90% of runs use it).
  const FIT_SOURCES = { style: "Pose only", reference: "Fit + pose" };
  function fitSourceOf(value) { return value === "reference" ? "reference" : "style"; }
  // Saved work from before 2.181.0 has no fitSource; it was rendered as Fit + pose, so it reopens that
  // way and its side/back keep matching the approved front. Untouched styles start on Pose only.
  function savedFitSource(saved) {
    if (saved?.fitSource) return fitSourceOf(saved.fitSource);
    return saved?.runKey ? "reference" : "style";
  }

  /** Pose only: the notes typed for the style's OTHER colours (each render's Redo / Adjustment note and
   *  any note still in the box), newest first, one per wording, each "NAVY front: sleeves to the wrist"
   *  within the studio's 300 characters. A fit fix made on one colour then reaches the next. */
  function otherColorNotes(drafts, ownColor, limit = 6) {
    const keyOf = (t) => String(t || "").trim().replace(/\s+/g, " ").toUpperCase();   // daily_core.colorKey
    const own = keyOf(ownColor), found = [];
    for (const [key, draft] of Object.entries(drafts || {})) {
      if (!draft || typeof draft !== "object" || keyOf(key) === own) continue;
      for (const s of Array.isArray(draft.slots) ? draft.slots : []) {
        const note = fixNote(s && s.note);
        if (note) found.push({ at: Number(s.startedAt) || 0, label: `${keyOf(s.color || key)} ${s.view || ""}`.trim(), note });
      }
      const typed = fixNote(draft.fixNote);
      if (typed) found.push({ at: -1, label: keyOf(key), note: typed });
    }
    found.sort((a, b) => b.at - a.at);
    const seen = new Set(), out = [];
    for (const f of found) {
      const same = f.note.toLowerCase();
      if (seen.has(same)) continue;
      seen.add(same);
      out.push(fixNote(`${f.label}: ${f.note}`));
      if (out.length >= limit) break;
    }
    return out;
  }

  /** A Redo: this one view runs again, the others untouched. The render it
   *  replaces waits in `history`, so a worse result is one click from undone. */
  function redoSlot(slot) {
    const history = [...(slot.history || []), slot.url].filter(Boolean);
    return { ...slot, historyProvenance:{...slot.historyProvenance,[slot.url]:{editMode:slot.editMode,preservation:slot.preservation,faceCheck:slot.faceCheck,reference:slot.reference,garmentInputs:slot.garmentInputs,fromFront:slot.fromFront,startedAt:slot.startedAt}}, editMode:undefined,preservation:undefined,faceCheck:undefined,garmentInputs:undefined, status: "running", error: "", url: "", approved: false, uploaded: undefined, uploadFilename: undefined, history };
  }
  /** What a finished view was made from, for the strip under it: the exact pose
   *  photo recorded with that render (never the current picker choice) and the
   *  render a Redo replaced. null = not recorded; the UI says so instead of guessing. */
  function inputsFor(slot) {
    const r = (slot && slot.reference) || {};
    const pose = [r.url, r.publicPath].find(u => typeof u === "string" && /^https:\/\//.test(u)) || null;
    const history = (slot && slot.history) || [];
    // 2.194.0: the garment photos sent with this render, as [url, label] pairs (null = not recorded).
    const garments = Array.isArray(slot && slot.garmentInputs)
      ? slot.garmentInputs.filter(g => Array.isArray(g) && typeof g[0] === "string" && g[0]) : null;
    return { pose, previous: history.length ? history[history.length - 1] : null, garments: garments && garments.length ? garments : null };
  }
  /** The garment photos one render is sent, labelled for Compare (2.194.0). 2.201.0: `borrowed` names the
   *  colour a back or side photo was borrowed from ({back?, side?: "DEEP BLUE"}). */
  function garmentInputs(urls, side, outfit, borrowed) {
    const lent = borrowed && typeof borrowed === "object" ? borrowed : {};
    const tag = (label, color) => color ? `${label} · ${colorTitle(color)}, shape only` : label;
    const list = (urls || []).filter(Boolean);
    const named = outfit ? list.map(u => [u, "Outfit photo"]) : list.map((u, i) => [u, i === 0 ? "Garment front" : tag("Garment back", lent.back)]);
    if (side && !outfit) named.push([side, tag("Garment side", lent.side)]);
    return named;
  }
  // 2.201.0 (David, 2026-11-03): borrowed colourway photos. DET60372 Pink has only a front photo; Deep Blue has its
  // back and side. Pink may send Deep Blue's for shape and print placement only (the studio takes every colour from
  // Pink's own photo or front render). A borrow lives in draft.garmentBorrowed {back?, side?: {url, color}}, never in
  // picked / garmentSide, so it is never lent on to a third colour.
  const colorKeyOf = (t) => String(t || "").trim().replace(/\s+/g, " ").toUpperCase();   // daily_core.colorKey
  /** "DEEP BLUE" → "Deep Blue", for the chip and the Compare labels. */
  function colorTitle(name) {
    return String(name || "").trim().replace(/\s+/g, " ").toLowerCase().split(" ").map(w => w ? w[0].toUpperCase() + w.slice(1) : w).join(" ");
  }
  /** A colour's own back (picked[1]) and side (garmentSide when it is not one of its picked photos). */
  function ownBackSide(draft) {
    const picked = Array.isArray(draft && draft.picked) ? draft.picked : [];
    const back = typeof picked[1] === "string" && picked[1] ? picked[1] : "";
    const raw = typeof (draft && draft.garmentSide) === "string" ? draft.garmentSide : "";
    return { back, side: raw && !picked.includes(raw) ? raw : "" };
  }
  /** The other colour to borrow from: more own photos wins, a tie goes to the newest run, then object order. */
  function borrowDonor(drafts, selfKey) {
    const self = colorKeyOf(selfKey);
    let best = null;
    for (const [key, draft] of Object.entries(drafts || {})) {
      if (!draft || typeof draft !== "object" || colorKeyOf(key) === self) continue;
      const { back, side } = ownBackSide(draft);
      const count = (back ? 1 : 0) + (side ? 1 : 0);
      if (!count) continue;
      const at = Math.max(0, ...(Array.isArray(draft.slots) ? draft.slots : []).map(t => Number(t && t.startedAt) || 0));
      if (!best || count > best.count || (count === best.count && at > best.at)) best = { key, back, side, count, at };
    }
    return best ? { key: best.key, ...(best.back ? { back: best.back } : {}), ...(best.side ? { side: best.side } : {}) } : null;
  }
  /** The offer line shows in Simple mode on a colour with a front, no back, no side, no borrow, not declined. */
  function borrowOffer(state, donor) {
    const s = state || {}, picked = Array.isArray(s.picked) ? s.picked : [], lent = s.garmentBorrowed || {};
    return s.editMode === "simple" && Boolean(picked[0]) && !picked[1] && !s.garmentSide && !lent.back && !lent.side && s.declined !== true && Boolean(donor);
  }
  /** The setupKey() part for a borrow: [] when there is none, so older keys stay identical. */
  function borrowKeyPart(garmentBorrowed) {
    const g = garmentBorrowed && typeof garmentBorrowed === "object" ? garmentBorrowed : {}, out = {};
    for (const slot of ["back", "side"]) if (g[slot] && typeof g[slot].url === "string" && g[slot].url) out[slot] = g[slot].url;
    return Object.keys(out).length ? [{ borrowed: out }] : [];
  }
  // 2.194.0: which part of the setup moved since a run was made, in the order of model_shots.js setupKey():
  // [photos, model, pose, engine, known, editMode, ...outfit or pose-only parts]. Used to say why Redo waits.
  const borrowEntry = (k) => k && typeof k === "object" && !Array.isArray(k) && Object.prototype.hasOwnProperty.call(k, "borrowed");
  const SETUP_PARTS = ["the garment photos", "the model", "the pose", "the image engine", "", "the editing method"];
  function stableJson(v) {
    if (Array.isArray(v)) return "[" + v.map(stableJson).join(",") + "]";
    if (v && typeof v === "object") return "{" + Object.keys(v).sort().filter(k => v[k] !== undefined).map(k => JSON.stringify(k) + ":" + stableJson(v[k])).join(",") + "}";
    return JSON.stringify(v === undefined ? null : v);
  }
  function setupChanges(oldKey, newKey) {
    let a, b;
    try { a = JSON.parse(oldKey); b = JSON.parse(newKey); } catch { return []; }
    if (!Array.isArray(a) || !Array.isArray(b)) return [];
    const out = [];
    // 2.201.0: a borrow rides in a tagged {borrowed} entry wherever it sits, so adding one never reads as a moved pose choice.
    const ba = a.find(borrowEntry)?.borrowed ?? null, bb = b.find(borrowEntry)?.borrowed ?? null;
    if (stableJson(ba) !== stableJson(bb)) out.push("the borrowed photos");
    a = a.filter(k => !borrowEntry(k)); b = b.filter(k => !borrowEntry(k));
    // 2.199.0: the garment facts card is gone, but fronts made with it keep a tagged {garmentFacts} entry.
    const hadFacts = (x, y) => y === undefined && !!x && typeof x === "object" && !Array.isArray(x) && "garmentFacts" in x;
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      if (stableJson(a[i]) === stableJson(b[i])) continue;
      if (hadFacts(a[i], b[i]) || hadFacts(b[i], a[i])) out.push("the garment facts");
      else if (i === 4) {
        const ka = a[4] || {}, kb = b[4] || {};
        out.push(String(ka.hem || "") !== String(kb.hem || "") ? "the framing rule" : "the style details");
      } else out.push(SETUP_PARTS[i] || "the outfit or pose choice");
    }
    return [...new Set(out)];
  }
  /** The line under the Redo box when the setup moved since the front (2.194.0). */
  function setupChangeNote(changes, frontTicked) {
    const why = changes && changes.length ? ` (${changes.join(", ")} changed)` : "";
    return frontTicked
      ? `This front was made with an older setup${why}. Redo makes a new front with your note; the other views follow it.`
      : `The front was made with an older setup${why}. Tick Front and redo it first.`;
  }
  function restorePrevious(slot) {
    const history = slot.history || [];
    if (!history.length) return slot;
    return { ...slot, editMode:undefined,preservation:undefined,faceCheck:undefined,reference:undefined,garmentInputs:undefined,fromFront:undefined,...slot.historyProvenance?.[history[history.length-1]], status: "done", error: "", url: history[history.length - 1], approved: false,
             uploaded: undefined, uploadFilename: undefined, history: history.slice(0, -1) };
  }

  /** The set's rendered front, as the continuity anchor for any other view
   *  (the studio's ANCHOR_RULE). The front itself never gets one. */
  function anchorFor(slots, view) {
    if (view === "front") return "";
    const front = (slots || []).find((s) => s.view === "front" && s.status === "done" && s.url);
    return front ? front.url : "";
  }

  /** 2.200.0: finished side/back/full views made from an earlier front than the one showing now.
   *  `fromFront` is the front a view was rendered from ("" = no front reference, never out of date). A view
   *  saved before 2.200.0 has none: a Simple/Direct one that started before the front did came from an earlier front. */
  function staleViews(slots) {
    const front = (slots || []).find((s) => s.view === "front" && s.status === "done" && s.url);
    if (!front) return [];
    const older = (s) => s.fromFront !== undefined ? Boolean(s.fromFront) && s.fromFront !== front.url
      : ["simple", "direct"].includes(s.editMode) && s.startedAt > 0 && front.startedAt > 0 && s.startedAt < front.startedAt;
    return slots.flatMap((s, i) => s.view !== "front" && s.status === "done" && s.url && older(s) ? [i] : []);
  }
  /** A Redo replaced the front: finished views with no record (made before 2.200.0) came from the front it replaced. */
  function markOlderFront(slots, previousFront) {
    if (!previousFront) return slots;
    return (slots || []).map((s) => s.view !== "front" && s.status === "done" && s.url && s.fromFront === undefined ? { ...s, fromFront: previousFront } : s);
  }

  /** Each selected view edits its own reference; none depends on another output. */
  function shootOrder(slots, indexes) {
    const list = (indexes || []).filter(i => slots[i]);
    return list.length ? [list] : [];
  }

  /** The button says how many views this run shoots. */
  function generateLabel(slots) {
    const n = (slots || []).length || VIEWS.length;
    return `Generate ${n} view${n === 1 ? "" : "s"}`;
  }

  /** Preview approval is a separate action: never buy the other views until
   * a successful front exists for the current garment/model/engine setup. */
  function previewAction(slots, sameSetup, waiting = []) {
    const front = (slots || []).findIndex((s) => s.view === "front");
    const ready = front >= 0 && slots[front].status === "done" && slots[front].url;
    // `waiting` views cannot run yet (a bottoms full shot with no body photo), so they are not counted.
    const remaining = (slots || []).flatMap((s, i) => s.view !== "front" && s.status !== "done" && !waiting.includes(s.view) ? [i] : []);
    if (sameSetup && ready && remaining.length) {
      return { kind: "remaining", indexes: remaining, label: `Generate remaining ${remaining.length}` };
    }
    return { kind: "front", indexes: [Math.max(0, front)], label: ready ? "New front preview" : "Generate front preview" };
  }

  /** Only the first selected photo defines the color. Unknown photos must
   * not inherit an unrelated color from the caller's previous run. */
  function selectedColor(picked, groups) {
    if (!(picked || []).length) return "";
    const group = (groups || []).find((g) => g.photos.some((p) => (p.fullUrl || p.thumbUrl) === picked[0]));
    return group && group.color || "";
  }

  /** Slot roles are explicit. A back can never become a front by filtering
   * empty entries, and the same photo cannot fill both roles. */
  function assignSource(picked, role, url) {
    const [front, back] = picked || [];
    if (role === "back") return front && url && url !== front ? [front, url] : [...(picked || [])];
    if (!url) return [];
    return back && back !== url ? [url, back] : [url];
  }

  function photosForColor(groups, color) {
    const key = (s) => colorTokens(s).sort().join(" ");
    return (groups || []).filter((g) => g.color && key(g.color) === key(color)).flatMap((g) => g.photos);
  }

  function fitLabel(known) {
    const k = known || {};
    const text = `${k.title || ""} ${k.description || ""}`;
    if (/\boversized?\b/i.test(text)) return "oversized";
    if (/\brelaxed\b/i.test(text)) return "relaxed";
    if (/\bboxy\b/i.test(text)) return "boxy";
    if (/\b(slim|fitted|tailored|bodycon|body-hugging)\b/i.test(k.title || "")) return "fitted";
    return "Not specified";
  }

  /** Slots the operator kept and that actually have an image. */
  function approvedShots(slots) {
    return (slots || []).filter((s) => s.approved && s.status === "done" && s.url);
  }

  /** One line of truth for the panel's footer. */
  function runSummary(slots) {
    const list = slots || [];
    const done = list.filter((s) => s.status === "done").length;
    const failed = list.filter((s) => s.status === "failed").length;
    const busy = list.some((s) => s.status === "running");
    const approved = approvedShots(list).length;
    if (busy) return `${done}/${list.length} rendered…`;
    if (!done && failed) return `All ${failed} views failed.`;
    if (failed) return `${done} of ${list.length} rendered · ${failed} failed · ${approved} approved`;
    if (!done) return "";
    return `${done} rendered · ${approved} approved`;
  }

  // Loading state (David's pixel-grid loader, 2026-09-05): a 3x3 grid whose
  // cells light in a chevron wavefront driving right — cell delay is
  // (column + distance from the middle row) * 90ms, so the point of the
  // chevron leads. The 650ms cycle is shorter than the 360ms sweep plus
  // fade, which keeps two fronts in flight. Elapsed time reads as "12.3s",
  // then "1m 05.0s" past a minute — mono tabular figures in the DOM.
  const PIXEL_DELAYS = Array.from({ length: 9 }, (_, i) => ((i % 3) + Math.abs(Math.floor(i / 3) - 1)) * 90);
  const PIXEL_CYCLE_MS = 650;
  function elapsedText(ms) {
    const t = Math.max(0, Number(ms) || 0) / 1000;
    if (t < 60) return `${t.toFixed(1)}s`;
    const s = t % 60;
    return `${Math.floor(t / 60)}m ${s < 10 ? "0" : ""}${s.toFixed(1)}s`;
  }

  // 2.51.0 (David: "map the images with the corresponding ERP variant color").
  // A gallery file names its colour the way po_watch.match_color_images reads
  // it: drop the extension, the trailing _N index, the T_ thumb prefix and the
  // style token; what is left must equal ONE colour's tokens as a multiset
  // ("DWJ68148 Dark-Brown_2.png" is DARK BROWN; "BROWN" never claims it).
  // "" = the style's own photo with no colour named; null = not this style's.
  // Faire variants append a size run and pack ratio to the color label.
  // Only strip a recognized size-run suffix (pack count optional: "Burnt Orange / L"
  // is one colour, not a tab per size); slash-separated colors stay intact.
  function garmentColor(s) {
    return String(s || "").replace(/\s*\/\s*(?:ONE(?:\s*SIZE)?|(?:[1-6]?XL|XXL|XS|SM|MD|ML|LG|LXL|S|M|L)(?:\s*-\s*(?:[1-6]?XL|XXL|XS|SM|MD|ML|LG|LXL|S|M|L))*)\s*(?:\(\s*\d+(?:\s*[-,]\s*\d+)*\s*\))?\s*$/i, "").trim();
  }
  function colorTokens(s) {
    return garmentColor(s).toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim().split(" ").filter(Boolean);
  }
  function photoColor(style, colors, filename) {
    const styleTok = String(style || "").trim().toUpperCase();
    let base = String(filename || "").split("/").pop().replace(/\.[A-Za-z0-9]+$/, "").replace(/_\d+$/, "");
    const toks = colorTokens(base);
    if (!styleTok || !toks.includes(styleTok)) return null;
    let rem = toks.filter((t) => t !== styleTok);
    if (rem[0] === "T") rem = rem.slice(1);
    if (!rem.length) return "";
    const key = rem.slice().sort().join(" ");
    return (colors || []).find((c) => colorTokens(c).sort().join(" ") === key) || null;
  }
  // The gallery in colour order: [{color, photos, run}] for every colourway
  // that has photos (the run's colour first), then {color: ""} for the
  // style-level photos and {color: null} for files that are not this style's.
  // `colorImgs` is the vision picker's {COLOR: [paths]} for un-named files.
  function groupByColor(style, colors, photos, colorImgs, runColor) {
    const same = (a, b) => colorTokens(a).join(" ") === colorTokens(b).join(" ");
    const byFile = new Map();
    for (const [c, paths] of Object.entries(colorImgs || {})) {
      for (const pth of paths || []) byFile.set(String(pth).split("/").pop().replace(/^T_/i, "").toUpperCase(), c);
    }
    const list = (colors || []).filter(Boolean);
    const groups = new Map();
    const styleLevel = [], other = [];
    for (const p of photos || []) {
      const fn = p.filename || String(p.fullUrl || p.thumbUrl || "").split("/").pop();
      let c = photoColor(style, list, fn);
      if (!c) {
        const v = byFile.get(String(fn).replace(/^T_/i, "").toUpperCase());
        if (v) c = list.find((x) => same(x, v)) || v;
      }
      if (c) { if (!groups.has(c)) groups.set(c, []); groups.get(c).push(p); }
      else if (c === "") styleLevel.push(p);
      else other.push(p);
    }
    const order = [...list, ...[...groups.keys()].filter((c) => !list.includes(c))];
    const out = order.filter((c) => groups.has(c)).map((c) => ({ color: c, photos: groups.get(c), run: !!runColor && same(c, runColor) }));
    out.sort((a, b) => Number(b.run) - Number(a.run));
    if (styleLevel.length) out.push({ color: "", photos: styleLevel, run: false });
    if (other.length) out.push({ color: null, photos: other, run: false });
    return out;
  }


  /* ── saved shots (2.55.0) ──────────────────────────────────────────────
     A style's saved set lives in the studio (/api/saved-shots); the panel
     shows it again every time it opens for that style. */

  /** The saved entry a slot's picture is, if it is one: by the id the Save
   *  button stamped, or by URL (a set loaded from Saved, a render whose
   *  source URL was saved from another panel). */
  function savedMatch(slot, saved) {
    if (!slot || !slot.url) return null;
    return (saved || []).find((s) => (slot.savedId && s.id === slot.savedId) || s.url === slot.url || s.source === slot.url) || null;
  }

  /** The newest saved shot per view, in view order — what "Load set" puts up. */
  function latestPerView(saved) {
    const seen = new Map();
    [...(saved || [])].sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0)).forEach((s) => { if (!seen.has(s.view)) seen.set(s.view, s); });
    return VIEWS.map((v) => seen.get(v)).filter(Boolean);
  }

  /** Put a saved shot into its view's slot as if it had just rendered: the
   *  picture that was there waits in `history`; a view the run does not
   *  shoot (a saved back on a bottoms run) gets a slot of its own. A slot
   *  still rendering is left alone. */
  function loadSavedShot(slots, shot) {
    const list = [...(slots || [])];
    if (!shot || !shot.url) return list;
    const i = list.findIndex((s) => s.view === shot.view);
    if (i < 0) { list.push({ view: shot.view, status: "done", url: shot.url, error: "", approved: false, savedId: shot.id, editMode:shot.editMode, preservation:undefined, faceCheck:undefined }); return list; }
    const cur = list[i];
    if (cur.status === "running") return list;
    if (cur.url === shot.url) { list[i] = { ...cur, status: "done", savedId: shot.id, editMode:shot.editMode, preservation:undefined }; return list; }
    const history = [...(cur.history || []), cur.url].filter(Boolean);
    list[i] = { ...cur, status: "done", url: shot.url, error: "", approved: false, history, historyProvenance:{...cur.historyProvenance,[cur.url]:{editMode:cur.editMode,preservation:cur.preservation,faceCheck:cur.faceCheck}}, uploaded:undefined,uploadFilename:undefined, savedId: shot.id, editMode:shot.editMode, preservation:undefined, faceCheck:undefined };
    return list;
  }

  /** Done slots whose picture is not in the saved set yet — what "Save all" sends. */
  function unsavedShots(slots, saved) {
    return (slots || []).filter((s) => s.status === "done" && s.url && !savedMatch(s, saved));
  }

  /** 2.191.0: who the sync banner names. The server stamps each save (fieldsBy.studio) and render (job.by);
   *  viewer is the teammate id the team gateway returns, and no viewer means David's own extension or app. */
  function sharedEditor(workspace, viewer) {
    const self = (by) => Boolean(by) && (viewer ? by.id === viewer : Boolean(by.owner));
    const rendering = Object.values(workspace?.jobs || {})
      .filter((j) => j && j.kind === "shot" && ["submitting", "running"].includes(j.status) && j.by && j.by.name && !self(j.by))
      .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))[0];
    const by = rendering ? rendering.by : workspace?.fieldsBy?.studio;
    if (!by || !by.name) return null;
    return { self: self(by), name: String(by.name), at: (rendering ? rendering.createdAt : by.at) || "", rendering: Boolean(rendering) };
  }

  /** The conflict banner and its "use theirs" button. time is the save time, already formatted. */
  function syncConflictText(editor, time) {
    if (!editor) return { message: "Another session saved a different setup. Keep your current setup or use the saved version to continue.", use: "Use saved version" };
    if (editor.self) return { message: "You saved a different setup in another tab or device. Keep this one or use the saved version to continue.", use: "Use saved version" };
    const n = editor.name, use = `Use ${n}'s version`;
    if (editor.rendering) return { message: `${n} is generating this style now. Use ${n}'s version to see it, or keep your setup to replace it.`, use };
    return { message: time ? `${n} saved a different setup at ${time}. Keep your setup or use ${n}'s version to continue.` : `${n} saved a different setup. Keep your setup or use ${n}'s version to continue.`, use };
  }

  const api = { sharedEditor, syncConflictText, isBottoms, simpleReferenceIssue, fullBaseIssue, FULL_BASE_MISSING, matchOutfitSources, viewSelectionLabel, restoreSlots, referencesFor, VIEWS, VIEW_LABEL, AUTO_MODEL, shotFilename, ownFilename, garmentRefs, canGenerate, newRun, approvedShots, runSummary, anchorFor, staleViews, markOlderFront, shootOrder,
                viewsFor, categoryFor, hemFor, planLabel, platesFor, looksFor, isDraftSet, lookOf, poseLabel, expressionLabel, previewFor, previewCropFor, fixNote, redoSlot, restorePrevious, inputsFor, garmentInputs, borrowDonor, borrowOffer, borrowKeyPart, colorTitle, setupChanges, setupChangeNote, generateLabel,
                previewAction, selectedColor, fitLabel, assignSource, photosForColor,
                PIXEL_DELAYS, PIXEL_CYCLE_MS, elapsedText, garmentColor, colorTokens, photoColor, groupByColor,
                savedMatch, latestPerView, loadSavedShot, unsavedShots, FIT_SOURCES, fitSourceOf, savedFitSource, otherColorNotes,
                layerFraming, draftName, FRAMINGS, FRAMING_LABEL, setFramings, viewerFraming, faceFocus, setKind, setKindLabel };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.DdtoModelShotsCore = api;
})(typeof self !== "undefined" ? self : globalThis);
