"use client";

// The web Model Studio (Simple garment swap), ported from the Faire extension's Model Studio panel:
// style → ERP photos → Front/Back/Side → person and look → front preview → remaining views anchored on it →
// keep, download, save. One workspace record per style keeps the setup and the running jobs across reloads.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ImageIcon } from "lucide-react";
import StudioHeader from "@/components/StudioHeader";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import core, { type View } from "@/lib/model-shots-core";
import { applyPreset, questionsFor, recipeLine, type Question } from "@/lib/model-studio/intake";
import {
  buildHealRequest, colorKey, downloadName, emptyState, knownFor, personOfModel, redoNote, setupKeyFor, setupOf, slotFromResult, stylePerson,
} from "@/lib/model-studio/request";
import { healedSlot, isOverdue, LOST_TASK_MS, slotsFor, startViews, takeVariant } from "@/lib/model-studio/run";
import type { Catalogue, ColorSetup, Gallery, SavedShot, Slot, StudioState } from "@/lib/model-studio/types";
import { ApiError, downloadAs, healShot, loadCatalogue, loadGallery, loadSaved, loadWorkspace, makeLookSheet, pollShot, saveShots, submitShot } from "./api";
import { Tag, Thumb } from "./bits";
import IntakeCard, { type IntakeAnswer } from "./IntakeCard";
import ModelPicker, { lookGroups } from "./ModelPicker";
import { RenderSettings, RunBar } from "./RunBar";
import { LookSheetPanel, TakesStrip } from "./RunExtras";
import StylePanel, { colorsOf, groupsFor, type Load, type Role } from "./StylePanel";
import ViewCard from "./ViewCard";
import { useWorkspace } from "./useWorkspace";

export const POLL_MS = 4000;
const assignSource = core.assignSource as (picked: string[], role: "front" | "back", url: string) => string[];
const message = (err: unknown, fallback: string) => (err instanceof Error && err.message ? err.message : fallback);

/** Every slot and take of every colour, so a run keeps polling after the colour tab changes. */
function eachSlot(state: StudioState, fn: (slot: Slot) => void) {
  for (const d of Object.values(state.drafts)) for (const s of [...(d.slots || []), ...(d.takes || [])]) fn(s);
}

/** Replace the slot or take that was sent with this request id, wherever it is. */
function patchRequest(state: StudioState, requestId: string, fn: (slot: Slot) => Slot): StudioState {
  const drafts: StudioState["drafts"] = {};
  let hit = false;
  for (const [k, d] of Object.entries(state.drafts)) {
    const map = (list: Slot[] | undefined) => list?.map((s) => (s.request?.requestId === requestId ? ((hit = true), fn(s)) : s));
    drafts[k] = { ...d, slots: map(d.slots) || [], ...(d.takes ? { takes: map(d.takes) } : {}) };
  }
  return hit ? { ...state, drafts } : state;
}

/** After a reload: a view sent but never given a task id cannot be confirmed, so it offers Resume. */
function reopen(studio: StudioState): StudioState {
  const fix = (s: Slot): Slot => (s.status === "running" && !s.jobId ? { ...s, pending: true, phase: undefined } : s);
  const drafts = Object.fromEntries(Object.entries(studio.drafts || {}).map(([k, d]) => [k, { ...d, slots: (d.slots || []).map(fix), ...(d.takes ? { takes: d.takes.map(fix) } : {}) }]));
  return { ...emptyState(studio.style), ...studio, drafts };
}

export default function ModelStudio() {
  const [state, setState] = useState<StudioState | null>(null);
  const [gallery, setGallery] = useState<Load<Gallery>>({ status: "idle" });
  const [catalogue, setCatalogue] = useState<Load<Catalogue>>({ status: "loading" });
  const [saved, setSaved] = useState<SavedShot[]>([]);
  const [opening, setOpening] = useState(false);
  const [notice, setNotice] = useState("");
  const [sheet, setSheet] = useState<{ status: "idle" | "loading" | "error"; error: string }>({ status: "idle", error: "" });
  const [healing, setHealing] = useState<number | null>(null);
  const [busy, setBusy] = useState<"" | "download" | "save">("");
  const [skipped, setSkipped] = useState<Question["id"][]>([]);
  const personTouched = useRef(false);
  const ws = useWorkspace(state);
  const stateRef = useRef(state);
  stateRef.current = state;

  const fetchCatalogue = useCallback(() => {
    setCatalogue({ status: "loading" });
    loadCatalogue().then((data) => setCatalogue({ status: "ready", data }), (err) => setCatalogue({ status: "error", error: message(err, "The model library did not load.") }));
  }, []);

  const open = useCallback(async (style: string) => {
    setGallery({ status: "loading" });
    setOpening(true);
    setNotice("");
    setSkipped([]);
    setSheet({ status: "idle", error: "" });
    personTouched.current = false;
    try { window.history.replaceState(null, "", `?style=${encodeURIComponent(style)}`); } catch { /* not in a browser */ }
    const [g, s, w] = await Promise.allSettled([loadGallery(style), loadSaved(style), loadWorkspace(style)]);
    const data = g.status === "fulfilled" ? g.value : undefined;
    const code = data?.style || style;
    setGallery(data ? { status: "ready", data } : { status: "error", error: message(g.status === "rejected" ? g.reason : null, "The ERP did not answer.") });
    setSaved(s.status === "fulfilled" ? s.value : []);
    let studio = emptyState(code);
    let rev = 0, at: string | null = null;
    if (w.status === "fulfilled") {
      rev = w.value.revision || 0;
      at = w.value.savedAt;
      if (w.value.studio && typeof w.value.studio === "object") studio = reopen(w.value.studio as StudioState);
    } else setNotice(`The saved setup for ${code} could not be read (${message(w.reason, "workspace error")}). Changes you make may ask to be merged.`);
    if (!studio.color) studio.color = colorsOf(data)[0]?.label || "";
    const k = colorKey(studio.color);
    if (!studio.drafts[k]) studio = { ...studio, drafts: { ...studio.drafts, [k]: applyPreset(setupOf(studio)) } };
    if (studio.person) personTouched.current = true;
    ws.adopt(rev, at);
    setState(studio);
    setOpening(false);
  }, [ws]);

  useEffect(() => {
    fetchCatalogue();
    const style = new URLSearchParams(window.location.search).get("style");
    if (style) void open(style.toUpperCase());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // One person per colour gallery: a style already shot on someone opens on that person.
  const defaultPerson = useMemo(() => (state ? stylePerson(state, catalogue.data || null, saved) : ""), [state, catalogue.data, saved]);
  useEffect(() => {
    if (!state || personTouched.current || !defaultPerson || state.person) return;
    personTouched.current = true;
    setState((s) => (s ? { ...s, person: defaultPerson } : s));
  }, [state, defaultPerson]);

  // Poll every running task, of every colour.
  const inFlight = useRef(new Set<string>());
  useEffect(() => {
    const tick = () => {
      const s = stateRef.current;
      if (!s) return;
      const now = Date.now();
      eachSlot(s, (slot) => {
        const id = slot.request?.requestId;
        if (!id || slot.status !== "running" || slot.pending || !slot.jobId || inFlight.current.has(slot.jobId)) return;
        if (isOverdue(slot, now)) { setState((cur) => cur && patchRequest(cur, id, (x) => ({ ...x, pending: true }))); return; }
        const job = slot.jobId;
        inFlight.current.add(job);
        pollShot(job)
          .then(({ task }) => {
            if (task.status === "running") return;
            setState((cur) => cur && patchRequest(cur, id, (x) => (x.jobId === job ? slotFromResult(x, task.status === "failed" ? { ok: false, ...task.result } : task.result) : x)));
          })
          .catch((err) => {
            if (err instanceof ApiError && err.status === 404 && now - (slot.startedAt || now) > LOST_TASK_MS) {
              setState((cur) => cur && patchRequest(cur, id, (x) => ({ ...x, pending: true })));
            }
          })
          .finally(() => inFlight.current.delete(job));
      });
    };
    const t = setInterval(tick, POLL_MS);
    return () => clearInterval(t);
  }, []);

  // ---- derived -------------------------------------------------------------------------------------------
  const setup = state ? setupOf(state) : null;
  const known = useMemo(() => (state ? knownFor(state) : {}), [state]);
  const category = core.categoryFor(known);
  const hem = core.hemFor(known);
  const planLabel = core.planLabel(category, hem);
  const bottoms = core.isBottoms(category);
  const slots = setup ? slotsFor(setup, known) : [];
  const key = setup ? setupKeyFor(setup, known) : "";
  const sameSetup = Boolean(setup?.runKey) && setup?.runKey === key;
  const model = catalogue.data?.models.find((m) => m.id === setup?.humanModelId);
  const pose = model?.poses.find((p) => p.id === setup?.poseId) || model?.poses[0];
  const baseIssue = setup ? core.fullBaseIssue(category, pose, hem, setup.fullBase) : "";
  const waiting: View[] = baseIssue ? ["full"] : [];
  const action = core.previewAction(slots, sameSetup, waiting);
  const front = slots.find((s) => s.view === "front");
  const frontDone = front?.status === "done" && Boolean(front.url);
  const changes = setup?.runKey && !sameSetup ? core.setupChanges(setup.runKey, key) : [];
  const changeNote = changes.length && frontDone ? core.setupChangeNote(changes, true) : "";
  const stale = core.staleViews(slots);
  const takes = setup?.takes || [];
  const running = slots.some((s) => s.status === "running" && !s.pending) || takes.some((t) => t.status === "running" && !t.pending);
  const kept = core.approvedShots(slots);
  const groups = groupsFor(gallery.data, state?.color || "");
  const colourPhotos = groups[0]?.photos || [];
  const personName = catalogue.data?.people.find((p) => p.id === state?.person)?.name || "";
  const questions = state && setup ? questionsFor(state, setup, colourPhotos.length >= 2).filter((q) => !skipped.includes(q.id)) : [];
  const blocker = !setup?.picked[0] ? "Assign a Front photo to start." : running ? "Rendering… results land here as each view finishes." : "";

  // ---- state helpers --------------------------------------------------------------------------------------
  const updateSetup = useCallback((fn: (s: ColorSetup, st: StudioState) => ColorSetup) => {
    setState((s) => (s ? { ...s, drafts: { ...s.drafts, [colorKey(s.color)]: fn(setupOf(s), s) } } : s));
  }, []);
  const setSlots = (fn: (slots: Slot[]) => Slot[]) => updateSetup((s, st) => ({ ...s, slots: fn(slotsFor(s, knownFor(st))) }));

  const firstLookOf = (person: string): { humanModelId: string; poseId: string } => {
    const looks = catalogue.data ? lookGroups(catalogue.data, category).people.find((p) => p.id === person)?.looks || [] : [];
    // A long hem needs a set whose back and side are full length too (plates.json full_length), else its hem is cut.
    const full = (modelId: string) => Boolean(catalogue.data?.models.find((m) => m.id === modelId)?.fullLength);
    const plate = (hem === "long" ? looks.flatMap((l) => l.plates).find((p) => full(p.modelId)) : undefined) || looks[0]?.plates[0];
    return plate ? { humanModelId: plate.modelId, poseId: plate.poseId } : { humanModelId: core.AUTO_MODEL, poseId: "" };
  };

  const setPerson = (person: string) => {
    personTouched.current = true;
    const pick = person ? firstLookOf(person) : { humanModelId: core.AUTO_MODEL, poseId: "" };
    setState((s) => (s ? { ...s, person, drafts: { ...s.drafts, [colorKey(s.color)]: { ...setupOf(s), ...pick } } } : s));
  };

  const setColor = (color: string) => {
    setSheet({ status: "idle", error: "" });
    setState((s) => {
      if (!s) return s;
      const k = colorKey(color);
      if (s.drafts[k]) return { ...s, color };
      const fresh = applyPreset({ ...setupOf(s, color), ...(s.person ? firstLookOf(s.person) : {}) });
      return { ...s, color, drafts: { ...s.drafts, [k]: fresh } };
    });
  };

  const assign = (role: Role, url: string) => updateSetup((s) => {
    if (role === "front") return { ...s, picked: assignSource(s.picked, "front", url) };
    if (role === "back") return { ...s, picked: url ? assignSource(s.picked, "back", url) : s.picked.slice(0, 1) };
    if (role === "side") return { ...s, garmentSide: url };
    return { ...s, fullBase: url };
  });

  // ---- running --------------------------------------------------------------------------------------------
  const submit = (request: NonNullable<Slot["request"]>) => {
    const id = request.requestId;
    submitShot(request).then(
      (r) => setState((cur) => cur && patchRequest(cur, id, (x) => (r.taskId ? { ...x, jobId: r.taskId, phase: "rendering" } : slotFromResult(x, { ok: Boolean(r.url), ...r })))),
      (err) => setState((cur) => cur && patchRequest(cur, id, (x) => ({ ...x, status: "failed", phase: undefined, error: message(err, "The studio did not take this render.") }))),
    );
  };

  const start = (indexes: number[], notes?: Record<number, string>) => {
    if (!state || !setup || !indexes.length) return;
    const plan = startViews(state, setup, known, indexes, { notes });
    const runsFront = indexes.some((i) => slots[i]?.view === "front");
    updateSetup((s) => ({
      ...s, slots: plan.slots,
      ...(runsFront ? { runKey: key, takes: plan.takes.length ? plan.takes : undefined } : {}),
    }));
    plan.requests.forEach((r) => submit(r.request));
    plan.takes.forEach((t) => t.request && submit(t.request));
  };

  const run = () => start(action.indexes);
  const redo = (index: number, note: string) => start([index], { [index]: redoNote(note, slots, index) });
  const resume = (slot: Slot | undefined) => {
    const request = slot?.request;
    if (!request) return;
    setState((cur) => cur && patchRequest(cur, request.requestId, (x) => ({ ...x, pending: false, phase: "submitting", jobId: undefined })));
    submit(request);
  };

  const heal = async (index: number) => {
    const slot = slots[index];
    const body = slot && buildHealRequest(slot);
    if (!body) return;
    setHealing(index);
    try {
      const r = await healShot(body);
      setSlots((list) => list.map((s, i) => (i === index && s.url === slot.url ? healedSlot(s, r) : s)));
    } catch (err) {
      setNotice(message(err, "Heal did not finish."));
    } finally {
      setHealing(null);
    }
  };

  const makeSheet = async () => {
    if (!state || !setup || !front?.url) return;
    setSheet({ status: "loading", error: "" });
    try {
      const r = await makeLookSheet({
        frontRenderUrl: front.url, frontPhotoUrl: setup.picked[0] || undefined, hem: hem || undefined, backPhotoUrl: setup.picked[1] || undefined, sidePhotoUrl: setup.garmentSide || undefined,
        title: state.title || undefined, color: state.color || undefined,
        humanModelId: front.humanModelId || setup.humanModelId, poseId: front.poseId || setup.poseId,
      });
      updateSetup((s) => ({ ...s, sheetUrl: r.url }));
      setSheet({ status: "idle", error: "" });
    } catch (err) {
      setSheet({ status: "error", error: message(err, "The look sheet did not render.") });
    }
  };

  const download = async () => {
    if (!state) return;
    setBusy("download");
    try {
      for (const s of kept) await downloadAs(s.url, downloadName(state.style, s, state.color));
    } catch (err) {
      setNotice(message(err, "A download failed."));
    } finally {
      setBusy("");
    }
  };

  const saveSet = async () => {
    if (!state || !setup) return;
    setBusy("save");
    try {
      const r = await saveShots(state.style, kept.map((s) => ({ view: s.view, url: s.url, humanModelId: s.humanModelId || setup.humanModelId, engine: s.engine, editMode: s.editMode, note: s.note || undefined })));
      setSaved(r.shots);
      setSlots((list) => list.map((s) => { const m = core.savedMatch(s, r.shots); return m ? { ...s, savedId: m.id } : s; }));
    } catch (err) {
      setNotice(message(err, "The set was not saved."));
    } finally {
      setBusy("");
    }
  };

  const loadSavedSet = () => setSlots((list) => core.latestPerView(saved).reduce((acc, shot) => core.loadSavedShot(acc, shot), list));

  const answer = (a: IntakeAnswer) => {
    if (a.id === "person") setPerson(a.person);
    else assign(a.id, a.url);
  };

  // ---- view -----------------------------------------------------------------------------------------------
  const conflictText = core.syncConflictText(null);
  const saveText = ws.status === "saving" ? "Saving setup…" : ws.status === "saved" ? `Setup saved${ws.savedAt ? ` ${new Date(ws.savedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : ""}` : ws.status === "error" && !ws.conflict ? `Not saved: ${ws.error}` : "";
  const styleThumb = groups[0]?.photos[0]?.thumb || gallery.data?.groups[0]?.photos[0]?.thumb;

  return (
    <>
    {/* Paper's shell styles are @scope'd to stop at .kobra, so the shared header sits outside the Kobra wrapper. */}
    <StudioHeader active="model" title="Model Studio" subtitle="Simple garment swap: front preview first, then the other views follow it." />
    <main className="kobra min-h-dvh bg-[#fafafa]">
      <div className="ms-layout mx-auto grid max-w-[1440px] gap-4 px-4 py-4 min-[481px]:px-6 lg:grid-cols-[minmax(360px,440px)_minmax(0,1fr)] lg:items-start">
        <div className="ms-left flex min-w-0 flex-col gap-4" id="ms-style">
          <StylePanel state={state} setup={setup} gallery={gallery} bottoms={bottoms} planLabel={planLabel}
            onOpen={(s) => void open(s)} onColor={setColor} onAssign={assign}
            onField={(field, value) => setState((s) => (s ? { ...s, [field]: value } : s))} />
          {state && setup && (
            <>
              <ModelPicker catalogue={catalogue} setup={setup} person={state.person} personHint={Boolean(state.person) && state.person === defaultPerson && Object.keys(state.drafts).length > 1}
                category={category} hem={hem} onPerson={setPerson} onRetry={fetchCatalogue}
                onPick={(humanModelId, poseId) => {
                  personTouched.current = true;
                  const person = personOfModel(catalogue.data || null, humanModelId);
                  setState((s) => (s ? { ...s, person: person || s.person, drafts: { ...s.drafts, [colorKey(s.color)]: { ...setupOf(s), humanModelId, poseId } } } : s));
                }}
                onFit={(fitSource) => updateSetup((s) => ({ ...s, fitSource }))} />
              <RenderSettings engine={setup.engine} variantCount={setup.variantCount ?? 1} frontNext={action.kind === "front"}
                onEngine={(engine) => updateSetup((s) => ({ ...s, engine }))} onVariants={(variantCount) => updateSetup((s) => ({ ...s, variantCount }))} />
            </>
          )}
        </div>

        <div className="ms-right flex min-w-0 flex-col gap-4">
          {ws.conflict && (
            <Alert variant="warning" className="rounded-[12px]">
              <AlertTitle>This style was saved somewhere else</AlertTitle>
              <AlertDescription>{conflictText.message}</AlertDescription>
              <AlertAction className="flex gap-1.5">
                <Button size="sm" onClick={ws.keepMine}>Keep my setup</Button>
                <Button size="sm" variant="outline" onClick={() => { const c = ws.conflict!; if (c.studio) { ws.adopt(c.revision, c.savedAt); setState(reopen(c.studio)); } }}>{conflictText.use}</Button>
              </AlertAction>
            </Alert>
          )}
          {notice && (
            <Alert variant="error" className="rounded-[12px]">
              <AlertDescription>{notice}</AlertDescription>
              <AlertAction><Button size="sm" variant="ghost" onClick={() => setNotice("")}>Dismiss</Button></AlertAction>
            </Alert>
          )}

          {!state && !opening && (
            <Empty className="max-w-none rounded-[12px] border border-dashed border-border bg-card py-16">
              <EmptyHeader>
                <EmptyMedia variant="icon"><ImageIcon aria-hidden /></EmptyMedia>
                <EmptyTitle>Open a style to start</EmptyTitle>
                <EmptyDescription>Type a style code on the left. The ERP photos load by colour; pick the front, back and side, choose who wears it, then make the front preview.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}

          {opening && (
            <div className="space-y-4" aria-busy="true" aria-label="Opening style">
              <Skeleton className="h-28 rounded-[12px]" />
              <Skeleton className="h-14 rounded-[12px]" />
              <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="aspect-[2/3] rounded-[12px]" />)}</div>
            </div>
          )}

          {state && setup && !opening && (
            <>
              <div className="flex items-center gap-3">
                <Thumb src={styleThumb} alt={state.style} className="h-14 w-10 shrink-0 rounded-[6px]" label="" />
                <div className="min-w-0">
                  <h1 className="truncate text-[18px] font-semibold tracking-[-0.02em]">{state.style}{state.color ? ` · ${state.color}` : ""}</h1>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5"><Tag>{planLabel}</Tag>{state.title && <span className="truncate text-[12px] text-muted-foreground">{state.title}</span>}</div>
                </div>
              </div>

              <IntakeCard recipe={recipeLine(state, setup, personName)} questions={questions} people={catalogue.data?.people || []}
                firstPhoto={colourPhotos[0]?.full || ""} secondPhoto={colourPhotos[1]?.full || ""}
                onAnswer={answer} onSkip={(id) => { if (id === "person") personTouched.current = true; setSkipped((s) => [...s, id]); }} />

              <RunBar label={action.label} canRun={Boolean(setup.picked[0]) && !running} blocker={blocker} changeNote={changeNote}
                summary={baseIssue || core.runSummary(slots)} staleCount={stale.length} kept={kept.length} savedCount={saved.length} busy={busy} saveText={saveText}
                onRun={run} onRedoStale={() => start(stale)} onDownload={() => void download()} onSave={() => void saveSet()} onLoadSaved={loadSavedSet} />

              {takes.length > 0 && (
                <TakesStrip takes={takes} onResume={(i) => resume(takes[i])}
                  onUse={(i) => updateSetup((s, st) => ({ ...s, slots: takeVariant(slotsFor(s, knownFor(st)), s.takes || [], i), takes: undefined }))} />
              )}

              <div className="ms-views grid grid-cols-2 gap-3 xl:grid-cols-4">
                {slots.map((slot, i) => (
                  <ViewCard key={`${slot.view}-${i}`} slot={slot} index={i} stale={stale.includes(i)} healing={healing === i}
                    waiting={slot.view === "full" ? baseIssue : ""}
                    actions={{
                      onRedo: redo, onResume: (idx) => resume(slots[idx]), onHeal: (idx) => void heal(idx),
                      onPrevious: (idx) => setSlots((list) => list.map((s, j) => (j === idx ? core.restorePrevious(s) : s))),
                      onKeep: (idx) => setSlots((list) => list.map((s, j) => (j === idx ? { ...s, approved: !s.approved } : s))),
                    }} />
                ))}
              </div>

              {frontDone && (
                <LookSheetPanel sheetUrl={setup.sheetUrl || ""} useSheet={Boolean(setup.useSheet)} status={sheet.status} error={sheet.error}
                  onMake={() => void makeSheet()} onToggle={(on) => updateSetup((s) => ({ ...s, useSheet: on }))} />
              )}
            </>
          )}
        </div>
      </div>
    </main>
    </>
  );
}
