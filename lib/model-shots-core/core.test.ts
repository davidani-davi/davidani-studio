// @ts-nocheck -- verbatim JS test body; its types live in index.ts.
// Copied from davidani-faire-management thumbnail-optimizer/test_model_shots_core.js (f5880f33) by
// scripts/sync-model-shots-core.sh. Do not edit by hand: change the extension copy, then re-sync.
import { test } from "vitest";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const core = createRequire(import.meta.url)("./core.cjs");

test("shotFilename carries the style token, which is what makes the upload visible", () => {
  // po_watch.kit_gallery_paths keeps only gallery files whose name carries the
  // style token — this is the whole reason the name is built rather than kept
  assert.equal(core.shotFilename("DWJ62218", "front", "NAVY/BLUE"), "DWJ62218 NAVY BLUE MODEL FRONT.jpg");
  assert.equal(core.shotFilename("DWJ62218", "full", ""), "DWJ62218 MODEL FULL SHOT.jpg");
  assert.equal(core.shotFilename("DWJ62218", "back", "", 2), "DWJ62218 MODEL BACK 2.jpg");
});

test("shotFilename is plain ASCII, because the ERP takes it as a header", () => {
  const name = core.shotFilename("DWJ62218", "side", "CRÈME/ÉCRU");
  assert.match(name, /^[\x20-\x7e]+$/);
  assert.equal(name, "DWJ62218 CR ME CRU MODEL SIDE.jpg");
});

test("garmentRefs keeps at most the front/back pair, in order", () => {
  assert.deepEqual(core.garmentRefs(["/a.jpg", "", "/b.jpg", "/c.jpg"]), ["/a.jpg", "/b.jpg"]);
  assert.deepEqual(core.garmentRefs([]), []);
});

test("canGenerate names the one thing missing", () => {
  const base = { garments: ["/a.jpg"], humanModelId: "kylie 1", poseId: "kylie 1", hasKey: true };
  assert.equal(core.canGenerate(base).ok, true);
  assert.match(core.canGenerate({ ...base, hasKey: false }).why, /studio key/i);
  assert.match(core.canGenerate({ ...base, garments: [] }).why, /garment photo/i);
  assert.match(core.canGenerate({ ...base, humanModelId: "" }).why, /model/i);
  assert.match(core.canGenerate({ ...base, busy: true }).why, /generating/i);
});

test("a new run holds four queued slots in shooting order", () => {
  assert.deepEqual(core.newRun().map((s) => s.view), ["front", "side", "back", "full"]);
  assert.ok(core.newRun().every((s) => s.status === "queued" && !s.approved));
});

test("only approved shots that actually rendered can be uploaded", () => {
  const slots = [
    { view: "front", status: "done", url: "/1.png", approved: true },
    { view: "side", status: "done", url: "/2.png", approved: false },
    { view: "back", status: "failed", url: "", approved: true },
    { view: "full", status: "done", url: "", approved: true },
  ];
  assert.deepEqual(core.approvedShots(slots).map((s) => s.view), ["front"]);
});

test("runSummary reports progress, then failures, then approvals", () => {
  const run = core.newRun();
  run[0].status = "running";
  assert.match(core.runSummary(run), /0\/4 rendered/);
  const mixed = [
    { status: "done", url: "/1", approved: true },
    { status: "done", url: "/2", approved: false },
    { status: "failed" },
    { status: "done", url: "/4", approved: true },
  ];
  assert.equal(core.runSummary(mixed), "3 of 4 rendered · 1 failed · 2 approved");
  assert.equal(core.runSummary([{ status: "failed" }, { status: "failed" }]), "All 2 views failed.");
});

// "the panel sends the known facts" checks the extension panel files, so it stays in the extension repo.

test("Auto is a valid choice: the studio assigns the model from the style code", () => {
  const base = { garments: ["/a.jpg"], hasKey: true };
  assert.equal(core.canGenerate({ ...base, humanModelId: core.AUTO_MODEL, poseId: "" }).ok, true);
  // a named model still needs its pose
  assert.equal(core.canGenerate({ ...base, humanModelId: "studio 01", poseId: "" }).ok, false);
  assert.equal(core.canGenerate({ ...base, humanModelId: "studio 01", poseId: "front" }).ok, true);
});

test("categoryFor: the taxonomy name decides, the title is the fallback, a set beats its pants", () => {
  assert.equal(core.categoryFor({ type: "Pants - Women's" }), "pants");
  assert.equal(core.categoryFor({ type: "Skirt - Women's" }), "skirt");
  assert.equal(core.categoryFor({ type: "Top & Pant Set (NOT Loungewear) - Women's" }), "set");
  assert.equal(core.categoryFor({ type: "Shirt Jacket/Shacket - Women's" }), "outerwear");
  assert.equal(core.categoryFor({ type: "Outerwear Vest - Women's" }), "outerwear");
  assert.equal(core.categoryFor({ type: "Sweater Vest - Women's" }), "top");
  assert.equal(core.categoryFor({ type: "Jumpsuit - Women's" }), "dress");
  assert.equal(core.categoryFor({ type: "", title: "Boxy Top & Barrel Pants Set" }), "set");
  assert.equal(core.categoryFor({ title: "Floral Print Wide-Leg Cargo Parachute Pants" }), "pants");
  assert.equal(core.categoryFor({}), "unknown");
  assert.equal(core.categoryFor(null), "unknown");
});

test("newRun: every category, bottoms included, shoots all four views (2.174.0)", () => {
  assert.deepEqual(core.newRun("pants").map((s) => s.view), ["front", "side", "back", "full"]);
  assert.deepEqual(core.newRun("skirt").map((s) => s.view), ["front", "side", "back", "full"]);
  assert.match(core.planLabel("skirt"), /waist down, plus one full shot$/);
  for (const c of ["top", "outerwear", "dress", "set", "unknown", undefined]) {
    assert.deepEqual(core.newRun(c).map((s) => s.view), ["front", "side", "back", "full"], String(c));
  }
  assert.match(core.planLabel("pants"), /waist down/);
  assert.match(core.planLabel("top"), /head-to-thigh/);
  assert.match(core.planLabel("unknown"), /full-length/);
});

test("fixNote: one clean line for the studio, never more than 300 characters", () => {
  assert.equal(core.fixNote("  zip-front\n stand   collar,\tno lapels "), "zip-front stand collar, no lapels");
  assert.equal(core.fixNote(""), "");
  assert.equal(core.fixNote(null), "");
  assert.equal(core.fixNote("x".repeat(400)).length, 300);
});

test("redo keeps the render it replaces, and previous puts it back", () => {
  const done = { view: "side", status: "done", url: "https://k/side1.png", approved: true, resolution: "4K" };
  const running = core.redoSlot(done);
  assert.equal(running.status, "running");
  assert.equal(running.url, "");
  assert.equal(running.approved, false);
  assert.deepEqual(running.history, ["https://k/side1.png"]);
  const again = core.redoSlot({ ...running, status: "done", url: "https://k/side2.png" });
  assert.deepEqual(again.history, ["https://k/side1.png", "https://k/side2.png"]);
  const back = core.restorePrevious({ ...again, status: "done", url: "https://k/side3.png" });
  assert.equal(back.url, "https://k/side2.png");
  assert.equal(back.status, "done");
  assert.deepEqual(back.history, ["https://k/side1.png"]);
  // nothing to go back to: the slot is left alone
  assert.equal(core.restorePrevious(done), done);
  // a failed redo also keeps the previous render reachable
  assert.deepEqual(core.redoSlot({ ...done, status: "failed", url: "" }).history, []);
  assert.deepEqual(core.redoSlot({ ...done, url: "" , history: ["https://k/old.png"] }).history, ["https://k/old.png"]);
});

test("the Generate button counts the run's views", () => {
  assert.equal(core.generateLabel(core.newRun("pants")), "Generate 4 views");
  assert.equal(core.generateLabel(core.newRun("top")), "Generate 4 views");
  assert.equal(core.generateLabel([]), "Generate 4 views");
});

test("loading state: chevron delays lead from the middle-left cell; elapsed reads like a stopwatch", () => {
  // row 1 (middle) leads: its cells light at 0/90/180ms, rows 0 and 2 one step behind
  assert.deepEqual(core.PIXEL_DELAYS, [90, 180, 270, 0, 90, 180, 90, 180, 270]);
  assert.ok(core.PIXEL_CYCLE_MS > 270, "a cycle outlasts the sweep, so two fronts are in flight");
  assert.equal(core.elapsedText(0), "0.0s");
  assert.equal(core.elapsedText(12340), "12.3s");
  assert.equal(core.elapsedText(65000), "1m 05.0s");
  assert.equal(core.elapsedText(600500), "10m 00.5s");
  assert.equal(core.elapsedText(-5), "0.0s");
});

test("platesFor: a bottom sees only the models whose legs are trousers; everything else sees them all", () => {
  const models = [
    { id: "studio 05", wears: "pants", lowOk: true, poses: [] },
    { id: "studio 08", wears: "skirt", lowOk: false, poses: [] },
    { id: "studio 09", poses: [] },
    { id: "user-1", userAdded: true, poses: [] },
  ];
  // 2026-10-12: DP and DS share the bottom-half collection; house plates and own sets are not offered
  for (const c of ["pants", "skirt"]) {
    const got = core.platesFor(c, models);
    assert.deepEqual(got.models, []);
    assert.equal(got.filtered, true);
    assert.match(got.note, /No bottoms references/);
  }
  const shared = [...models, { id: "studio 103", referenceKind: "pants", wears: "pants", poses: [] }, { id: "pants-dp62024", referenceKind: "pants", wears: "shorts", poses: [] }];
  assert.deepEqual(core.platesFor("pants", shared).models.map((m) => m.id), ["studio 103", "pants-dp62024"]);
  // a skirt shows legs below its hem: bare-legged bases first
  assert.deepEqual(core.platesFor("skirt", shared).models.map((m) => m.id), ["pants-dp62024", "studio 103"]);
  for (const c of ["top", "outerwear", "dress", "set", "unknown"]) {
    const got = core.platesFor(c, models);
    assert.equal(got.models.length, 4);
    assert.equal(got.filtered, false);
    assert.equal(got.note, "");
  }
});

test("platesFor: tops see every plate; an unloaded catalogue is empty for bottoms and says why", () => {
  const models = [{ id: "studio 01", poses: [] }, { id: "studio 02", poses: [] }];
  assert.equal(core.platesFor("top", models).models.length, 2);
  assert.match(core.platesFor("skirt", models).note, /Refresh models/);
  assert.deepEqual(core.platesFor("pants", undefined).models, []);
});

test("previewFor shows the framing the category's front view is shot on", () => {
  const pose = { preview: "/models/studio 05/front.jpg",
                 previews: { full: "/models/studio 05/front.jpg", crop: "/models/crop 05/front.jpg", low: "/models/low 05/front.jpg" } };
  assert.equal(core.previewFor("pants", pose), "/models/low 05/front.jpg");
  assert.equal(core.previewFor("skirt", pose), "/models/low 05/front.jpg");
  assert.equal(core.previewFor("top", pose), "/models/crop 05/front.jpg");
  assert.equal(core.previewFor("outerwear", pose), "/models/crop 05/front.jpg");
  assert.equal(core.previewFor("dress", pose), "/models/studio 05/front.jpg");
  assert.equal(core.previewFor("pants", { preview: "/models/user/front.jpg" }), "/models/user/front.jpg",
               "an old catalogue or a user plate has no siblings");
  assert.equal(core.previewFor("pants", null), "");
});
test("previewCropFor crops full-length cards to the front view's framing", () => {
  const full = { preview: "/u/celine-det68308/poses/front-01.png", previews: { full: "/u/celine-det68308/poses/front-01.png", crop: "/u/celine-det68308/poses/front-01.png" } };
  assert.deepEqual(core.previewCropFor("top", full), { top: 0, bottom: 0.6 }, "short top: head to thigh");
  assert.deepEqual(core.previewCropFor("top", full, "mid"), { top: 0, bottom: 0.78 }, "mid-length top: head to knee");
  assert.equal(core.previewCropFor("top", full, "long"), null, "long top shoots full-length");
  assert.equal(core.previewCropFor("dress", full), null);
  assert.equal(core.previewCropFor("pants", full), null, "bottoms stay whole");
  assert.equal(core.previewCropFor("top", full, "", true), null, "drafts are uploaded already framed");
  assert.equal(core.previewCropFor("top", { preview: "/models/studio 05/front.jpg", previews: { crop: "/models/crop 05/front.jpg" } }), null,
               "a set with its own head-to-thigh picture shows it whole");
  assert.deepEqual(core.previewCropFor("outerwear", { preview: "/models/studio 103/front.jpg" }), { top: 0, bottom: 0.6 });
  assert.equal(core.previewCropFor("top", null), null);
});

test("hemFor: a longline top is not long, so its front, side and back are head-to-thigh like any top (2.192.0)", () => {
  const known = { type: "Cardigan - Women's", title: "Granny Square Crochet Patchwork Longline Cardigan" };
  assert.equal(core.hemFor(known), "");
  assert.match(core.planLabel("top", core.hemFor(known)), /^top · front, side and back head-to-thigh, plus one full shot/);
  assert.equal(core.hemFor({ title: "Longline Wool Coat" }), "long");
  assert.equal(core.hemFor({ title: "Longline Duster Cardigan" }), "long");
});

test("hemFor: a coat, a duster piece, a knee/midi/maxi length is long; cropped wins; a sleeve is not a hem", () => {
  assert.equal(core.hemFor({ type: "Coat - Women's", title: "Plaid Double Breasted Longline Trench Coat" }), "long");
  assert.equal(core.hemFor({ type: "Coat - Women's", title: "Wool Blend Coat" }), "long");
  assert.equal(core.hemFor({ title: "Ribbed Duster Cardigan" }), "long");
  assert.equal(core.hemFor({ title: "Ankle-Length Wool Coat" }), "long");
  // a knee-length or midi hem is "mid": head-to-knee plates, the full shot as before
  assert.equal(core.hemFor({ title: "Knee-Length Quilted Jacket" }), "mid");
  assert.equal(core.hemFor({ title: "Plaid Midi Shirt Dress" }), "mid");
  assert.equal(core.hemFor({ hem: "mid" }), "mid");
  assert.match(core.planLabel("outerwear", "mid"), /^knee-length outerwear · front, side and back head-to-knee/);
  assert.equal(core.previewFor("outerwear", { previews: { full: "/full.jpg", crop: "/crop.jpg", knee: "/knee.jpg" } }, "mid"), "/knee.jpg");
  assert.equal(core.previewFor("outerwear", { previews: { full: "/full.jpg", crop: "/crop.jpg" } }, "mid"), "/full.jpg");
  assert.equal(core.referencesFor("outerwear", { references: { full: "F", crop: "C" } }, "mid"), "F");
  assert.equal(core.hemFor({ title: "Classic Peacoat" }), "long");
  assert.equal(core.hemFor({ type: "Coat - Women's", title: "Cropped Plaid Coat" }), "short");
  assert.equal(core.hemFor({ type: "Shirt Jacket/Shacket - Women's", title: "Plaid Shacket" }), "");
  assert.equal(core.hemFor({ title: "Long Sleeve Ribbed Top" }), "");
  assert.equal(core.hemFor({ title: "Tailored Waistcoat" }), "");
  assert.equal(core.hemFor({ hem: "short", title: "Longline Coat" }), "short");
  assert.equal(core.hemFor(null), "");
});

test("a long layer plans and previews full-length in every view, like a dress", () => {
  assert.match(core.planLabel("outerwear", "long"), /^long outerwear · full-length front, side, back and full/);
  assert.match(core.planLabel("top", "long"), /^long top · full-length/);
  assert.match(core.planLabel("outerwear", ""), /head-to-thigh/);
  assert.match(core.planLabel("pants", "long"), /waist down/);
  const pose = { previews: { crop: "/crop.jpg", low: "/low.jpg", full: "/full.jpg" }, preview: "/p.jpg" };
  assert.equal(core.previewFor("outerwear", pose, "long"), "/full.jpg");
  assert.equal(core.previewFor("outerwear", pose, ""), "/crop.jpg");
  assert.equal(core.previewFor("outerwear", pose), "/crop.jpg");
  assert.equal(core.previewFor("pants", pose, "long"), "/low.jpg");
});

test("selected views shoot together from independent references", () => {
  const slots = core.newRun("outerwear");
  assert.deepEqual(core.shootOrder(slots, [0, 1, 2, 3]), [[0, 1, 2, 3]]);
  // a Redo of one non-front view is one wave; a Redo of the front too
  assert.deepEqual(core.shootOrder(slots, [2]), [[2]]);
  assert.deepEqual(core.shootOrder(slots, [0]), [[0]]);
  assert.equal(core.anchorFor(slots, "back"), "");                 // nothing rendered yet
  slots[0] = { ...slots[0], status: "done", url: "https://x/front.png" };
  assert.equal(core.anchorFor(slots, "back"), "https://x/front.png");
  assert.equal(core.anchorFor(slots, "full"), "https://x/front.png");
  assert.equal(core.anchorFor(slots, "front"), "");                // the front never anchors to itself
  slots[0] = { ...slots[0], status: "failed", url: "" };
  assert.equal(core.anchorFor(slots, "side"), "");                 // a failed front anchors nothing
});

test("looksFor folds the house character into one card per pose, expressions inside, own plates beside; the rest wait behind 'All models'", () => {
  const plate = (id, extra) => ({ id, name: id, lowOk: true, poses: [{ id: `${id}-front`, label: "Front" }], ...extra });
  const models = [
    plate("studio 01"),                                                       // photographed model: no character
    plate("studio 28", { character: "vision", expression: "neutral", poseKey: "a", pose: "standing straight, arms relaxed at sides", autoPool: true }),
    plate("studio 30", { character: "vision", expression: "smirk", poseKey: "a", pose: "standing straight, arms relaxed at sides", autoPool: true }),
    plate("studio 29", { character: "vision", expression: "smile", poseKey: "a", pose: "standing straight, arms relaxed at sides", autoPool: true }),
    plate("studio 35", { character: "vision", expression: "neutral", poseKey: "b", pose: "standing, weight on one leg, hand in pocket", autoPool: true }),
    plate("studio 40", { character: "vision", expression: "neutral", poseKey: "a", pose: "standing straight, arms relaxed at sides", autoPool: false, lowOk: false }), // wardrobe variant
    plate("user-1", { userAdded: true, name: "Me" }),
  ];
  const r = core.looksFor("top", models);
  assert.deepEqual(r.looks.map((l) => [l.key, l.label, l.own]), [["a", "Arms at sides", false], ["b", "Hand in pocket", false], ["user-1", "Me", true]]);
  // expressions in house order, whatever order the catalog listed them
  assert.deepEqual(r.looks[0].plates.map((p) => p.expression), ["neutral", "smile", "smirk"]);
  assert.deepEqual(r.looks[0].plates.map((p) => p.modelId), ["studio 28", "studio 29", "studio 30"]);
  assert.deepEqual(r.others.map((m) => m.id), ["studio 01", "studio 40"]);
  assert.equal(core.lookOf(r.looks, "studio 30").key, "a");
  assert.equal(core.lookOf(r.looks, "studio 01"), null);
  // a skirt uses the shared bottoms collection, never the house plates
  const skirt = core.looksFor("skirt", [...models, plate("pants-dp62024", { referenceKind: "pants", wears: "shorts" })]);
  assert.deepEqual(skirt.looks.map((l) => l.key), ["pants-dp62024/pants-dp62024-front"]);
  assert.deepEqual(skirt.others, []);
  assert.equal(skirt.filtered, true);
  assert.equal(core.expressionLabel("teeth"), "Big smile");
  assert.equal(core.poseLabel("standing, one arm raised to head, hand in pocket"), "Arm raised");
});


test("saved shots (2.55.0): load puts the newest per view into the slots, keeps the old picture in history, marks what is saved", () => {
  const saved = [
    { id: "f-old", view: "front", url: "https://blob/f-old.jpg", source: "https://fal/f-old.png", savedAt: 1 },
    { id: "f-new", view: "front", url: "https://blob/f-new.jpg", source: "https://fal/f-new.png", savedAt: 9 },
    { id: "b", view: "back", url: "https://blob/b.jpg", savedAt: 5 },
  ];
  assert.deepEqual(core.latestPerView(saved).map((s) => s.id), ["f-new", "b"]);
  // bottoms shoot all four views — a saved back gets its own slot
  let slots = core.newRun("pants");
  slots[0] = { ...slots[0], status: "done", url: "https://fal/render.png" };
  core.latestPerView(saved).forEach((s) => { slots = core.loadSavedShot(slots, s); });
  assert.deepEqual(slots.map((s) => [s.view, s.status, s.url]), [
    ["front", "done", "https://blob/f-new.jpg"], ["side", "queued", ""], ["back", "done", "https://blob/b.jpg"], ["full", "queued", ""]]);
  assert.deepEqual(slots[0].history, ["https://fal/render.png"]);   // the render is one "previous" away
  assert.equal(slots[0].savedId, "f-new");
  // a rendering slot is never replaced
  const running = core.loadSavedShot([{ view: "front", status: "running", url: "" }], saved[1]);
  assert.equal(running[0].status, "running");
  // what counts as saved: the stamped id, the blob URL, or the render URL the set was saved from
  assert.equal(core.savedMatch({ url: "https://fal/f-new.png" }, saved).id, "f-new");
  assert.equal(core.savedMatch({ url: "https://blob/b.jpg" }, saved).id, "b");
  assert.equal(core.savedMatch({ url: "https://fal/other.png" }, saved), null);
  const run = [{ view: "front", status: "done", url: "https://fal/f-new.png" }, { view: "side", status: "done", url: "https://fal/s.png" }, { view: "back", status: "failed", url: "" }];
  assert.deepEqual(core.unsavedShots(run, saved).map((s) => s.view), ["side"]);
});

test("front preview requires an explicit second action and uses category view counts", () => {
  for (const category of ["top", "pants"]) {
    const slots = core.newRun(category);
    assert.deepEqual(core.previewAction(slots, false).indexes, [0]);
    slots[0] = { ...slots[0], status: "failed" };
    assert.equal(core.previewAction(slots, true).kind, "front");
    slots[0] = { ...slots[0], status: "done", url: "/approved-front.png" };
    const next = core.previewAction(slots, true);
    assert.equal(next.kind, "remaining");
    assert.equal(next.indexes.length, 3);
    assert.ok(!next.indexes.includes(0));
    assert.equal(core.previewAction(slots, false).kind, "front", "changed setup cannot reuse the front");
    slots[1] = { ...slots[1], status: "done", url: "/side.png" };
    assert.ok(!core.previewAction(slots, true).indexes.includes(1), "do not buy successful views again");
  }
});

test("selected source controls color; unknown photos clear stale ERP color", () => {
  const groups = [{ color: "WHITE", photos: [{ fullUrl: "/white.jpg" }] },
    { color: "PINK", photos: [{ fullUrl: "/pink.jpg" }, { fullUrl: "/pink-back.jpg" }] },
    { color: null, photos: [{ fullUrl: "/unlabelled.jpg" }] }];
  assert.equal(core.selectedColor(["/pink.jpg", "/pink-back.jpg"], groups), "PINK");
  assert.equal(core.selectedColor(["/white.jpg", "/pink.jpg"], groups), "WHITE");
  assert.equal(core.selectedColor(["/unlabelled.jpg"], groups), "");
  assert.equal(core.selectedColor([], groups), "");
});

test("fit summary does not turn suggested companion garments into fitted tops", () => {
  assert.equal(core.fitLabel({ title: "Oversized Graphic Tee" }), "oversized");
  assert.equal(core.fitLabel({ title: "Tee", description: "pairs with slim jeans" }), "Not specified");
  assert.equal(core.fitLabel({ title: "Slim-fit Tee" }), "fitted");
});

test("explicit front/back assignment never promotes a back or duplicates one image", () => {
  assert.deepEqual(core.assignSource([], "back", "/back.jpg"), []);
  assert.deepEqual(core.assignSource([], "front", "/front.jpg"), ["/front.jpg"]);
  assert.deepEqual(core.assignSource(["/front.jpg"], "back", "/back.jpg"), ["/front.jpg", "/back.jpg"]);
  assert.deepEqual(core.assignSource(["/front.jpg", "/back.jpg"], "back", "/front.jpg"), ["/front.jpg", "/back.jpg"]);
  assert.deepEqual(core.assignSource(["/front.jpg", "/back.jpg"], "front", "/new.jpg"), ["/new.jpg", "/back.jpg"]);
  assert.deepEqual(core.assignSource(["/front.jpg", "/back.jpg"], "front", "/back.jpg"), ["/back.jpg"]);
  assert.deepEqual(core.assignSource(["/front.jpg", "/back.jpg"], "front", ""), []);
});

test("colorway filtering cannot offer another color or silently assign unlabelled photos", () => {
  const groups = [{color:"PINK",photos:[{fullUrl:"/pink.jpg"}]},
    {color:"WHITE",photos:[{fullUrl:"/white.jpg"}]},
    {color:null,photos:[{fullUrl:"/unknown.jpg"}]}];
  assert.deepEqual(core.photosForColor(groups, "pink"), [{fullUrl:"/pink.jpg"}]);
  assert.deepEqual(core.photosForColor(groups, "BLUE"), []);
  assert.deepEqual(core.photosForColor(groups, ""), []);
});


test("approved front masters bypass retired preview URLs without changing framing", () => {
  const pose={preview:"/models/studio 98/front.png",previews:{crop:"/models/crop 98/front.png",low:"/models/low 98/front.png"}};
  assert.equal(core.previewFor("top",pose),"/models/crop 98/front.png?ref=f10f3e9a0ed8b61c");
  assert.equal(core.previewFor("dress",pose),"/models/studio 98/front.png?ref=f10f3e9a0ed8b61c");
  assert.equal(core.previewFor("pants",pose),"/models/low 98/front.png");
});

test("Faire size-pack labels still match the garment color without merging real colors", () => {
  assert.equal(core.garmentColor("Pink / S-M-L(2-2-2)"), "Pink");
  assert.equal(core.garmentColor("BLUE / 1XL-2XL-3XL(3-2-1)"), "BLUE");
  assert.equal(core.garmentColor("CREAM / ONE(6)"), "CREAM");
  assert.equal(core.garmentColor("Burgundy / Sm-Ml(3-3)"), "Burgundy"); // 2.142.0: SM-ML packs no longer make a second tab
  assert.equal(core.garmentColor("NAVY/BLUE"), "NAVY/BLUE");
  assert.equal(core.garmentColor("Burnt Orange / L"), "Burnt Orange");
  assert.equal(core.garmentColor("Burnt Orange / S-M"), "Burnt Orange");
  assert.equal(core.garmentColor("BLACK / WHITE"), "BLACK / WHITE");
  const photo = {filename:"DET62209 PINK_1.jpg",fullUrl:"/pink.jpg"};
  const groups = core.groupByColor("DET62209", ["Pink / S-M-L(2-2-2)", "WHITE"], [photo]);
  assert.deepEqual(core.photosForColor(groups,"PINK"), [photo]);
  assert.deepEqual(core.photosForColor(groups,"WHITE"), []);
});

test('redo and restore cannot inherit an ERP path belonging to a different render',()=>{
  const uploaded={view:'front',status:'done',url:'https://image/new.jpg',uploaded:'/style/old.jpg',uploadFilename:'old.jpg',approved:true,history:['https://image/previous.jpg']};
  for(const slot of [core.redoSlot(uploaded),core.restorePrevious(uploaded)]){
    assert.equal(slot.uploaded,undefined);assert.equal(slot.uploadFilename,undefined);assert.equal(slot.approved,false);
  }
});

 test("three-view workspaces migrate by view without losing images or approvals",()=>{
 const old=[{view:"front",url:"/front.png",approved:true},{view:"side",url:"/side.png"},{view:"full",url:"/full.png",jobId:"old-job"}];
 const migrated=core.restoreSlots("pants",old);
 assert.deepEqual(migrated.map(s=>s.view),["front","side","back","full"]);
 assert.equal(migrated[0],old[0]);assert.equal(migrated[3],old[2]);assert.equal(migrated[2].status,"queued");
 });
 test("DONUTS is only offered for bottoms",()=>{
 const m={id:"studio 103",categories:["pants","skirt"],lowOk:true};
 assert.equal(core.platesFor("top",[m]).models.length,0);assert.equal(core.platesFor("pants",[m]).models.length,1);
 });


test("selection actions name one or two views and count larger selections", () => {
  assert.equal(core.viewSelectionLabel([]), "selected views");
  assert.equal(core.viewSelectionLabel(["front"]), "front");
  assert.equal(core.viewSelectionLabel(["side", "front", "front"]), "front and side");
  assert.equal(core.viewSelectionLabel(["front", "back", "full"]), "selected 3 views");
  assert.equal(core.viewSelectionLabel(["front", "side", "back", "full"]), "all 4 views");
  assert.equal(core.viewSelectionLabel(["full"]), "full shot");
});
test('pixel-preservation provenance belongs to its image through redo, history and library loading',()=>{
 const original={view:'front',status:'done',url:'protected.png',editMode:'garment-only',preservation:{verified:true},uploaded:'/style/protected.png'};
 const redo=core.redoSlot(original);assert.equal(redo.preservation,undefined);assert.equal(redo.editMode,undefined);
 const previous=core.restorePrevious({...redo,url:'new-native.png',editMode:'native'});
 assert.equal(previous.url,original.url);assert.equal(previous.editMode,'garment-only');assert.equal(previous.preservation.verified,true);
 const loaded=core.loadSavedShot([original],{id:'saved',view:'front',url:'native.jpg'})[0];
 assert.equal(loaded.preservation,undefined);assert.equal(loaded.uploaded,undefined);
 assert.equal(core.restorePrevious(loaded).editMode,'garment-only');
 const protectedSaved=core.loadSavedShot([],{id:'saved',view:'front',url:'protected-saved.png',editMode:'garment-only'})[0];
 assert.equal(protectedSaved.editMode,'garment-only');assert.equal(protectedSaved.preservation,undefined);
});

test('managed models expose every pose and select the exact pose card',()=>{
 const m={id:'custom-1',name:'Celine',userAdded:true,managed:true,poses:[{id:'a',label:'Relaxed',preview:'https://store/a.png'},{id:'b',label:'Pockets',preview:'https://store/b.png'}]};
 const {looks}=core.looksFor('top',[m]);
 assert.equal(looks.length,2);assert.equal(core.lookOf(looks,m.id,'b').plates[0].poseId,'b');
 assert.equal(core.previewFor('top',m.poses[1]),'https://store/b.png');
});

 test("pants bento is shared, ordered and contains each reference once",()=>{
 const ids=["pants-dp60197b","pants-dp62024","studio 103","pants-dp67305"];
 const models=ids.map(id=>({id,name:id,referenceKind:"pants",categories:["pants"],poses:[{id:"pose"}]}));
 models.push({id:"studio 98",character:"celine",lowOk:true,poses:[{id:"pose"}]});
 const {looks,others}=core.looksFor("pants",models);
 assert.deepEqual(looks.map(l=>l.plates[0].modelId),["studio 103","pants-dp62024","pants-dp67305","pants-dp60197b"]);
 assert.deepEqual(others,[]);assert(looks.every(l=>l.plates.length===1));
 assert.equal(core.platesFor("top",models).models.length,1);
 });

test("a saved full shot loads into the pants full slot (2.174.0)",()=>{
 const slots=core.loadSavedShot(core.newRun("pants"),{id:"old",view:"full",url:"/old.png"});
 assert.deepEqual([slots[3].view,slots[3].status,slots[3].url],["full","done","/old.png"]);
});

test("fullBaseIssue: bottoms need a full-body photo unless the set has its own full view",()=>{
 const refs={front:"/f.png",side:"/s.png",back:"/b.png"};const pose={references:{low:refs}};
 assert.equal(core.fullBaseIssue("pants",pose,"","") ,core.FULL_BASE_MISSING);
 assert.equal(core.fullBaseIssue("skirt",pose,"",""),core.FULL_BASE_MISSING);
 assert.equal(core.fullBaseIssue("pants",pose,"","https://system.davidani.com/upload/style/X.jpg"),"");
 assert.equal(core.fullBaseIssue("pants",{references:{low:{...refs,full:"/full.png"}}},"",""),"");
 assert.equal(core.fullBaseIssue("top",pose,"",""),"");
});

test('direct outfit sources require exact style color view and reject ambiguous revisions',()=>{
  const p=(filename)=>({filename,fullUrl:'https://system.davidani.com/upload/style/'+encodeURIComponent(filename)});
  const front=p('DWT68142 BURGUNDY MODEL FRONT.jpg'),side=p('DWT68142 BURGUNDY MODEL SIDE.jpg');
  assert.deepEqual(core.matchOutfitSources('DWT68142','BURGUNDY',[front,side,p('DWT68142 BLUE MODEL BACK.jpg'),p('DWT68142 BURGUNDY MODEL BACK 2.png')]),{front:front.fullUrl,side:side.fullUrl});
  assert.deepEqual(core.matchOutfitSources('DWT68142','BURGUNDY',[front,front]),{});
  assert.deepEqual(core.matchOutfitSources('DWT68142','',[front]),{});
});

test('simple swap rejects cropped references for full outfits even when every thumbnail exists', () => {
  const refs = reframed => Object.fromEntries(core.VIEWS.map(view => [view, {publicPath: `/${view}.png`, reframed: view !== 'full' && reframed}]));
  const pose = {references:{crop:refs(false),full:refs(true)}};
  assert.equal(core.simpleReferenceIssue('top',pose,''),'');
  assert.match(core.simpleReferenceIssue('set',pose,''),/full-length/);
  assert.match(core.simpleReferenceIssue('dress',pose,''),/full-length/);
  assert.match(core.simpleReferenceIssue('outerwear',pose,'long'),/full-length/);
  assert.equal(core.simpleReferenceIssue('set',pose,'',['full']),'');
  assert.match(core.simpleReferenceIssue('top',undefined,''),/missing/);
  delete pose.references.crop.side;
  assert.match(core.simpleReferenceIssue('top',pose,''),/missing/);
  assert.equal(core.simpleReferenceIssue('top',pose,'',['front']),'');
});

test("her draft reference sets lead the picker, newest first, named without the Draft · author prefix", () => {
  const set = (id, name, createdAt) => ({ id, name, userAdded: true, createdAt, poses: [{ id: id + "-pose", label: name, views: {} }] });
  const models = [{ id: "studio 97", name: "Vision", character: "vision", poseKey: "p1", pose: "relaxed", poses: [{ id: "a" }] },
    set("user-old", "Draft · Jeonga · Linen", "2026-09-20T00:00:00Z"), set("user-mine", "My upload", "2026-09-21T00:00:00Z"),
    set("user-new", "Draft · Jeonga · Blue set", "2026-09-24T00:00:00Z")];
  const { looks } = core.looksFor("top", models);
  assert.deepEqual(looks.slice(0, 2).map(l => [l.label, l.draft]), [["Blue set", true], ["Linen", true]]);
  assert.ok(looks.slice(2).every(l => !l.draft));
  assert.equal(core.isDraftSet(models[1]), true); assert.equal(core.isDraftSet(models[2]), false);
});

test("Simple refuses an uploaded set view that has no face outline, and accepts it with one", () => {
  const ref = (auto) => ({ publicPath: "https://blob.example/user-models/x/front.jpg", reframed: false, ...(auto ? { autoContour: { kind: "contour" } } : {}) });
  const pose = { references: { crop: { front: ref(true), side: ref(false), back: ref(true), full: ref(true) } } };
  assert.match(core.simpleReferenceIssue("top", pose, ""), /outline the face in the side photo/);
  pose.references.crop.side = ref(true);
  assert.equal(core.simpleReferenceIssue("top", pose, ""), "");
  // Installed library references are relative paths with reviewed contours on the studio side.
  assert.equal(core.simpleReferenceIssue("top", { references: { crop: { front: { publicPath: "/models/crop 97/front.png" }, side: { publicPath: "/models/crop 97/side.png" }, back: { publicPath: "/models/crop 97/back.png" }, full: { publicPath: "/models/studio 97/full.png" } } } }, ""), "");
});

test("inputsFor shows the exact pose photo each render used and the previous run; history keeps its own pose", () => {
  const ref = (u) => ({ humanModelId: "studio 97", view: "front", publicPath: "/models/studio 97/front.png", url: u });
  const first = { view: "front", status: "done", url: "https://k/f1.png", reference: ref("https://davidani-studio.vercel.app/models/studio%2097/front.png") };
  assert.deepEqual(core.inputsFor(first), { pose: "https://davidani-studio.vercel.app/models/studio%2097/front.png", previous: null, garments: null });
  const redo = core.redoSlot(first);
  const second = { ...redo, status: "done", url: "https://k/f2.png", reference: ref("https://blob.example/user-models/x/front.jpg") };
  assert.deepEqual(core.inputsFor(second), { pose: "https://blob.example/user-models/x/front.jpg", previous: "https://k/f1.png", garments: null });
  const back = core.restorePrevious(second);
  assert.equal(back.url, "https://k/f1.png");
  assert.equal(core.inputsFor(back).pose, "https://davidani-studio.vercel.app/models/studio%2097/front.png", "restored render shows its own pose, not the newer one");
  // Older history saved before poses were recorded: say unavailable rather than guess.
  const legacy = core.restorePrevious({ ...second, historyProvenance: {} });
  assert.equal(core.inputsFor(legacy).pose, null);
  assert.equal(core.inputsFor({ reference: { publicPath: "/models/studio 97/front.png" } }).pose, null, "relative paths are not shown");
  assert.equal(core.inputsFor({ reference: { url: "javascript:alert(1)" } }).pose, null);
});

test("Pose only is the default; only 'reference' is Fit + pose", () => {
  assert.equal(core.fitSourceOf("reference"), "reference");
  for (const v of ["style", "", undefined, null, "REFERENCE", "pose"]) assert.equal(core.fitSourceOf(v), "style");
  assert.deepEqual(Object.keys(core.FIT_SOURCES), ["style", "reference"], "Pose only is listed first");
});

test("saved work from before 2.181.0 reopens as Fit + pose; untouched styles start on Pose only", () => {
  assert.equal(core.savedFitSource({ runKey: "[1]" }), "reference", "rendered before the switch existed");
  assert.equal(core.savedFitSource({ runKey: "" }), "style");
  assert.equal(core.savedFitSource(undefined), "style");
  assert.equal(core.savedFitSource({ runKey: "[1]", fitSource: "style" }), "style");
  assert.equal(core.savedFitSource({ fitSource: "reference" }), "reference");
});

test("otherColorNotes reads other colours' render and fix notes, newest first, never this colour's", () => {
  const drafts = {
    "NAVY": { fixNote: "looser body", slots: [{ note: "sleeves to the wrist", startedAt: 300, view: "front" }, { note: "  ", startedAt: 400, view: "side" }] },
    "BLACK": { slots: [{ note: "Sleeves to the wrist", startedAt: 100, view: "back" }, { note: "hem at the hip", startedAt: 500, view: "side" }, null] },
    "IVORY": { fixNote: "own colour note", slots: [{ note: "own render note", startedAt: 900, view: "front" }] },
  };
  assert.deepEqual(core.otherColorNotes(drafts, "ivory"), [
    "BLACK side: hem at the hip",
    "NAVY front: sleeves to the wrist",
    "NAVY: looser body",
  ], "case-insensitive duplicate dropped, blank notes skipped, own colour excluded");
  assert.deepEqual(core.otherColorNotes(drafts, "IVORY", 1), ["BLACK side: hem at the hip"]);
  assert.deepEqual(core.otherColorNotes(undefined, "IVORY"), []);
  assert.deepEqual(core.otherColorNotes({ " ivory ": { fixNote: "x" } }, "IVORY"), [], "colour keys compare like colorKey");
});

test("sync banner names who saved the setup or is rendering (2.191.0)", () => {
  const jeonga = { id: "jeonga", name: "Jeonga", at: "2026-11-02T21:48:35.000Z" };
  const david = { id: "david", name: "David", owner: true, at: "2026-11-02T21:40:00.000Z" };
  const running = { kind: "shot", status: "running", createdAt: "2026-11-02T21:48:36.000Z", by: jeonga };
  // David's extension (no viewer): Jeonga saved and is rendering
  assert.deepEqual(core.sharedEditor({ fieldsBy: { studio: jeonga }, jobs: { a: running } }, null),
    { self: false, name: "Jeonga", at: running.createdAt, rendering: true });
  assert.deepEqual(core.sharedEditor({ fieldsBy: { studio: jeonga }, jobs: { a: { ...running, status: "done" } } }, null),
    { self: false, name: "Jeonga", at: jeonga.at, rendering: false });
  // David in another tab, seen from his extension; and seen from Jeonga's add-on
  assert.equal(core.sharedEditor({ fieldsBy: { studio: david }, jobs: {} }, null).self, true);
  assert.deepEqual(core.sharedEditor({ fieldsBy: { studio: david }, jobs: {} }, "jeonga"), { self: false, name: "David", at: david.at, rendering: false });
  // her own render in another tab is not "someone else is generating"
  assert.equal(core.sharedEditor({ fieldsBy: { studio: jeonga }, jobs: { a: running } }, "jeonga").self, true);
  // older saves carry no name
  assert.equal(core.sharedEditor({ fields: {}, jobs: {} }, null), null);
  assert.equal(core.sharedEditor(null, null), null);

  assert.match(core.syncConflictText(null, "").message, /^Another session saved/);
  assert.equal(core.syncConflictText(null, "").use, "Use saved version");
  assert.match(core.syncConflictText({ self: true, name: "David" }, "1:40 PM").message, /^You saved a different setup in another tab/);
  const live = core.syncConflictText({ self: false, name: "Jeonga", rendering: true }, "1:48 PM");
  assert.equal(live.message, "Jeonga is generating this style now. Use Jeonga's version to see it, or keep your setup to replace it.");
  assert.equal(live.use, "Use Jeonga's version");
  assert.equal(core.syncConflictText({ self: false, name: "David" }, "1:40 PM").message, "David saved a different setup at 1:40 PM. Keep your setup or use David's version to continue.");
  assert.equal(core.syncConflictText({ self: false, name: "David" }, "").message, "David saved a different setup. Keep your setup or use David's version to continue.");
});

test("2.194.0: Compare gets the garment photos each render was sent; Redo and Previous keep them with their render", () => {
  const g1 = core.garmentInputs(["https://erp/f.jpg", "https://erp/b.jpg"], "https://erp/s.jpg", false);
  assert.deepEqual(g1, [["https://erp/f.jpg", "Garment front"], ["https://erp/b.jpg", "Garment back"], ["https://erp/s.jpg", "Garment side"]]);
  assert.deepEqual(core.garmentInputs(["https://erp/o.jpg"], "https://erp/s.jpg", true), [["https://erp/o.jpg", "Outfit photo"]], "an outfit edit has no garment side");
  assert.deepEqual(core.garmentInputs([null, ""], "", false), []);
  const first = { view: "front", status: "done", url: "https://k/f1.png", garmentInputs: g1 };
  assert.deepEqual(core.inputsFor(first).garments, g1);
  const redo = core.redoSlot(first);
  assert.equal(redo.garmentInputs, undefined, "a running redo does not claim the old photos");
  const g2 = core.garmentInputs(["https://erp/f2.jpg"], "", false);
  const second = { ...redo, status: "done", url: "https://k/f2.png", garmentInputs: g2 };
  assert.deepEqual(core.inputsFor(second).garments, g2);
  assert.deepEqual(core.inputsFor(core.restorePrevious(second)).garments, g1, "the restored render shows its own garment photos");
  assert.equal(core.inputsFor({ view: "front", url: "x" }).garments, null, "not recorded = null, never a guess");
  assert.equal(core.inputsFor({ garmentInputs: [["", "Garment front"], "junk"] }).garments, null);
});

test("2.194.0: setupChanges names what moved since a run, so Redo can say why it waits", () => {
  const key = (over = {}) => JSON.stringify(Object.values({ photos: ["f", "b"], model: "m", pose: "p", engine: "gpt25", known: { styleCode: "DCJ67197", hem: "", title: "Longline Cardigan" }, mode: "simple", ...over }));
  assert.deepEqual(core.setupChanges(key(), key()), []);
  // DCJ67197: saved under 2.191 with hem "long"; 2.192.0 works the hem out again as "" (keys in another order too)
  assert.deepEqual(core.setupChanges(key({ known: { hem: "long", title: "Longline Cardigan", styleCode: "DCJ67197" } }), key()), ["the framing rule"]);
  assert.deepEqual(core.setupChanges(key({ known: { hem: "", title: "Other", styleCode: "DCJ67197" } }), key()), ["the style details"]);
  assert.deepEqual(core.setupChanges(key({ model: "m2", pose: "p2" }), key()), ["the model", "the pose"]);
  assert.deepEqual(core.setupChanges(key({ photos: ["f2"] }), key()), ["the garment photos"]);
  assert.deepEqual(core.setupChanges(key({ engine: "nano" }), key({ mode: "direct" })), ["the image engine", "the editing method"]);
  assert.deepEqual(core.setupChanges(JSON.stringify([[], "auto", "", "gpt25", {}, "direct", { front: "a" }]), JSON.stringify([[], "auto", "", "gpt25", {}, "direct", { front: "b" }])), ["the outfit or pose choice"]);
  assert.deepEqual(core.setupChanges("", key()), [], "a loaded picture has no recorded setup");
  assert.deepEqual(core.setupChanges("not json", key()), []);
  assert.equal(core.setupChangeNote(["the framing rule"], true), "This front was made with an older setup (the framing rule changed). Redo makes a new front with your note; the other views follow it.");
  assert.equal(core.setupChangeNote([], false), "The front was made with an older setup. Tick Front and redo it first.");
});
test('the face-check flag belongs to its image through redo, previous and library loading (2.198.0)',()=>{
 const faceCheck={ok:false,reasons:['The AI head does not line up with the real face.'],attempts:2};
 const flagged={view:'front',status:'done',url:'flagged.png',editMode:'simple',faceCheck};
 const redo=core.redoSlot(flagged);assert.equal(redo.faceCheck,undefined,'a new render starts without the old flag');
 const previous=core.restorePrevious({...redo,status:'done',url:'clean.png',faceCheck:{ok:true,reasons:[]}});
 assert.equal(previous.url,'flagged.png');assert.deepEqual(previous.faceCheck,faceCheck);
 const loaded=core.loadSavedShot([flagged],{id:'saved',view:'front',url:'library.jpg'})[0];
 assert.equal(loaded.faceCheck,undefined,'a saved shot from the library carries no check');
 assert.deepEqual(core.restorePrevious(loaded).faceCheck,faceCheck);
 const same=core.loadSavedShot([flagged],{id:'saved',view:'front',url:'flagged.png'})[0];
 assert.deepEqual(same.faceCheck,faceCheck,'the same picture keeps its flag');
});

// 2.197.0: the reference set viewer (model_shots.js openSetViewer).
test("setFramings lists only the framings a set has photos for, in a fixed order", () => {
  const ref = { publicPath: "/models/x/front.png" };
  assert.deepEqual(core.setFramings({ references: { full: { front: ref }, crop: { side: ref }, low: {} } }), ["crop", "full"]);
  assert.deepEqual(core.setFramings({}), []);
  assert.deepEqual(core.setFramings(null), []);
});
test("viewerFraming opens on the framing this style would use, else the nearest one the set has", () => {
  const ref = { publicPath: "/p.png" }, all = { references: { crop: { front: ref }, full: { front: ref }, low: { front: ref } } };
  assert.equal(core.viewerFraming("top", "", all), "crop");
  assert.equal(core.viewerFraming("dress", "", all), "full");
  assert.equal(core.viewerFraming("pants", "", all), "low");
  assert.equal(core.viewerFraming("top", "mid", all), "full", "knee falls back to full, as referencesFor does");
  assert.equal(core.viewerFraming("top", "", { references: { full: { front: ref } } }), "full");
  assert.equal(core.viewerFraming("top", "", {}), "");
  assert.equal(core.FRAMING_LABEL.crop, "Tops · head to thigh");
  assert.equal(core.FRAMING_LABEL.low, "Bottoms · waist down");
});
test("faceFocus zooms to the face outline, then the protected head rows, then a framing default", () => {
  const contour = { kind: "contour", width: 1000, height: 1500, points: [[400, 100], [600, 100], [600, 280], [400, 280]] };
  const f = core.faceFocus({ autoContour: contour }, "full");
  assert.equal(f.fx, 0.5); assert.equal(Math.round(f.fy * 1000), 127);
  assert.equal(Math.round(f.scale * 100), 458, "head box (12% of the height) fills about 55% of the stage");
  assert.equal(core.faceFocus({ autoContour: { ...contour, points: [[0, 0], [1000, 0], [1000, 1500]] } }, "full").scale, 1.5, "clamped to at least 1.5x");
  assert.equal(core.faceFocus({ autoContour: { kind: "no-head", width: 1, height: 1 } }, "full"), null);
  assert.equal(core.faceFocus({ publicPath: "/p.png" }, "low"), null, "a waist-down photo has no face");
  const p = core.faceFocus({ protection: { width: 800, height: 1200, protectedRows: 300 } }, "crop");
  assert.deepEqual([p.fx, p.fy, p.scale], [0.5, 0.125, 2.2]);
  assert.deepEqual(core.faceFocus({ publicPath: "/p.png" }, "full"), { fx: 0.5, fy: 0.1, scale: 3.2 });
  assert.deepEqual(core.faceFocus({ publicPath: "/p.png" }, "crop"), { fx: 0.5, fy: 0.17, scale: 2.2 });
  assert.equal(core.faceFocus(null, "full"), null);
});
test("setKind names a set before the server answers", () => {
  assert.deepEqual(core.setKind({ userAdded: true, name: "Draft · Jeonga · Blue linen set" }), { kind: "team", name: "Blue linen set", author: "Jeonga" });
  assert.deepEqual(core.setKind({ userAdded: true, name: "Recast Chloe" }), { kind: "saved", name: "Recast Chloe", author: "" });
  assert.deepEqual(core.setKind({ id: "studio 97", name: "Vision 1" }), { kind: "house", name: "Vision 1", author: "" });
  assert.equal(core.setKindLabel({ kind: "team", author: "Jeonga" }), "Team set · Jeonga");
  assert.equal(core.setKindLabel({ kind: "team", author: "Jeonga", mine: true }), "Your set");
  assert.equal(core.setKindLabel({ kind: "saved" }), "Saved set");
  assert.equal(core.setKindLabel({ kind: "house" }), "House set");
});

test("2.199.0 garment facts are gone: no facts code, and a front made with them is named as such", () => {
  for (const name of ["FACT_OPTIONS", "factFields", "factsOf", "factsState", "factsForRender", "factsSummary"]) assert.equal(core[name], undefined, name);
  const base = [["f"], "m", "p", "gpt25", { hem: "" }, "simple"];
  const k = (...rest) => JSON.stringify([...base, ...rest]);
  assert.deepEqual(core.setupChanges(k({ garmentFacts: { topLength: "cropped" } }), k()), ["the garment facts"]);
  assert.deepEqual(core.setupChanges(k("pose-only", { garmentFacts: { topLength: "cropped" } }), k("pose-only")), ["the garment facts"]);
  assert.deepEqual(core.setupChanges(k(), k("pose-only")), ["the outfit or pose choice"]);
});

// 2.201.0 (David, 2026-11-03): DET60372 Pink has only a front photo; Deep Blue has its back and side. Pink borrows
// them for shape and print placement only. A borrow is marked apart from picked/garmentSide and never lent on.
test("2.201.0 borrowed colourway photos: who lends, when the offer shows, the labels and the setup key", () => {
  const f = "https://erp/pink-f.jpg", b = "https://erp/db-b.jpg", s = "https://erp/db-s.jpg";
  assert.equal(core.borrowDonor({ PINK: { picked: [f] } }, "PINK"), null, "only itself");
  assert.equal(core.borrowDonor({ PINK: { picked: [f] }, BLACK: { picked: ["https://erp/k-f.jpg"], garmentBorrowed: { back: { url: b, color: "DEEP BLUE" } } } }, "PINK"), null, "a borrowed photo is never lent on");
  const drafts = {
    PINK: { picked: [f] },
    "DEEP BLUE": { picked: ["https://erp/db-f.jpg", b], garmentSide: s, slots: [{ startedAt: 10 }] },
    BLACK: { picked: ["https://erp/k-f.jpg", "https://erp/k-b.jpg"], slots: [{ startedAt: 99 }] },
  };
  assert.deepEqual(core.borrowDonor(drafts, "pink "), { key: "DEEP BLUE", back: b, side: s }, "back + side beats back only, even when newer");
  const tie = { PINK: { picked: [f] }, NAVY: { picked: ["https://erp/n-f.jpg", "https://erp/n-b.jpg"], slots: [{ startedAt: 5 }] }, BLACK: { picked: ["https://erp/k-f.jpg", "https://erp/k-b.jpg"], slots: [{ startedAt: 50 }, {}] } };
  assert.deepEqual(core.borrowDonor(tie, "PINK"), { key: "BLACK", back: "https://erp/k-b.jpg" }, "a tie goes to the newer run");
  assert.deepEqual(core.borrowDonor({ PINK: { picked: [f] }, NAVY: { picked: ["https://erp/n-f.jpg"], garmentSide: "https://erp/n-f.jpg" } }, "PINK"), null, "a side that is one of its picked photos is not a side");

  const donor = core.borrowDonor(drafts, "PINK");
  const ok = { editMode: "simple", picked: [f], garmentSide: "", garmentBorrowed: {}, declined: false };
  assert.equal(core.borrowOffer(ok, donor), true);
  for (const [why, over] of [["direct", { editMode: "direct" }], ["no front", { picked: [] }], ["own side", { garmentSide: "https://erp/p-s.jpg" }],
    ["own back", { picked: [f, "https://erp/p-b.jpg"] }], ["already borrowed", { garmentBorrowed: { side: { url: s, color: "DEEP BLUE" } } }], ["declined", { declined: true }]])
    assert.equal(core.borrowOffer({ ...ok, ...over }, donor), false, why);
  assert.equal(core.borrowOffer(ok, null), false, "no donor");
  assert.equal(core.colorTitle("DEEP BLUE"), "Deep Blue");
  assert.equal(core.colorTitle(" light  denim "), "Light Denim");

  assert.deepEqual(core.garmentInputs([f, b], s, false, { back: "DEEP BLUE", side: "DEEP BLUE" }),
    [[f, "Garment front"], [b, "Garment back · Deep Blue, shape only"], [s, "Garment side · Deep Blue, shape only"]]);
  assert.deepEqual(core.garmentInputs([f, b], s, false, { side: "DEEP BLUE" }), [[f, "Garment front"], [b, "Garment back"], [s, "Garment side · Deep Blue, shape only"]]);
  assert.deepEqual(core.garmentInputs([f, b], s, false), [[f, "Garment front"], [b, "Garment back"], [s, "Garment side"]], "no borrow, no change");

  assert.deepEqual(core.borrowKeyPart({}), []);
  assert.deepEqual(core.borrowKeyPart(undefined), []);
  assert.deepEqual(core.borrowKeyPart({ side: { url: s, color: "DEEP BLUE" } }), [{ borrowed: { side: s } }]);
  const base = [["f"], "m", "p", "gpt25", { hem: "" }, "simple"];
  const k = (...rest) => JSON.stringify([...base, ...rest]);
  assert.deepEqual(core.setupChanges(k(), k(...core.borrowKeyPart({ side: { url: s, color: "DEEP BLUE" } }))), ["the borrowed photos"]);
  assert.deepEqual(core.setupChanges(k("pose-only"), k("pose-only", ...core.borrowKeyPart({ back: { url: b, color: "DEEP BLUE" } }))), ["the borrowed photos"]);
  assert.deepEqual(core.setupChanges(k({ borrowed: { back: b } }), k("pose-only", { borrowed: { back: b } })), ["the outfit or pose choice"]);
  assert.deepEqual(core.setupChanges(k({ borrowed: { back: b } }, { garmentFacts: { fit: "boxy" } }), k({ garmentFacts: { fit: "boxy" } }, { borrowed: { back: b } })), [], "order of tagged parts does not matter");
});

test("2.200.0 views made from an earlier front are found, and a front Redo marks the older ones", () => {
  const done = (view, url, extra = {}) => ({ view, status: "done", url, ...extra });
  // Made with a recorded front: out of date only when the front showing now is another one.
  let slots = [done("front", "f2", { history: ["f1"] }), done("side", "s", { fromFront: "f1" }), done("back", "b", { fromFront: "f2" }), done("full", "u", { fromFront: "" })];
  assert.deepEqual(core.staleViews(slots), [1]);
  // No front, or a view still rendering: nothing to redo.
  assert.deepEqual(core.staleViews([{ view: "front", status: "running", url: "" }, done("side", "s", { fromFront: "f1" })]), []);
  assert.deepEqual(core.staleViews([done("front", "f2"), { view: "side", status: "running", url: "", fromFront: "f1" }]), []);
  // Views from before 2.200.0 (no record) take the front a Redo replaced; recorded ones keep theirs.
  slots = core.markOlderFront([done("front", "f2", { history: ["f1"] }), done("side", "s"), done("back", "b", { fromFront: "f2" }), { view: "full", status: "queued", url: "" }], "f1");
  assert.equal(slots[1].fromFront, "f1");
  assert.equal(slots[2].fromFront, "f2");
  assert.equal(slots[3].fromFront, undefined);
  assert.equal(slots[0].fromFront, undefined);
  assert.deepEqual(core.staleViews(slots), [1]);
  assert.equal(core.markOlderFront(slots, ""), slots);
  // Undo of the front brings the old front back, so its views are current again.
  const undone = core.restorePrevious(slots[0]);
  assert.equal(undone.url, "f1");
  assert.deepEqual(core.staleViews([undone, ...slots.slice(1)]), [2]);
  // A Redo of a view keeps the front it was made from for Undo.
  const redone = core.redoSlot(done("side", "s", { fromFront: "f1" }));
  assert.equal(core.restorePrevious({ ...redone, status: "done", url: "s2", fromFront: "f2" }).fromFront, "f1");
  // Saved before 2.200.0 (DET60372 Deep Blue): no record, so a Simple view that started before the front is older.
  const legacy = [done("front", "f2", { startedAt: 300, editMode: "simple" }), done("side", "s", { startedAt: 100, editMode: "simple" }),
    done("back", "b", { startedAt: 400, editMode: "simple" }), done("full", "u", { startedAt: 100, editMode: "native" }), done("side", "x", { editMode: "simple" })];
  assert.deepEqual(core.staleViews(legacy), [1]);
  // Undo of that front puts its start time back too, so the views match again.
  const legacyRedo = { ...core.redoSlot(done("front", "f1", { startedAt: 50, editMode: "simple" })), startedAt: 300 };
  const legacyUndo = core.restorePrevious({ ...legacyRedo, status: "done", url: "f2" });
  assert.equal(legacyUndo.startedAt, 50);
  assert.deepEqual(core.staleViews([legacyUndo, legacy[1]]), []);
});
