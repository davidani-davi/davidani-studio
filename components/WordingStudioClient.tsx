"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { upload } from "@vercel/blob/client";
import StudioHeader from "@/components/StudioHeader";
import type { PublicJob } from "@/lib/wording-studio/jobs";
import type { Category } from "@/lib/wording-studio/types";

const WAIT_MS = 120_000;
const POLL_MS = 4000;
const MAX_CHOICES = 3;
const MAX_LINE = 24;
const CATEGORY_LABELS: [Category, string][] = [["top", "Top"], ["set", "Set"], ["outerwear", "Outerwear"], ["dress", "Dress"], ["skirt", "Skirt"], ["pants", "Pants"]];
const TERMINAL = new Set(["done", "failed", "ideas_ready"]);

/** True when the job should have started but the Mac mini has not picked it up (or stopped answering). */
export function isWaiting(job: PublicJob, now: number): boolean {
  if (job.status === "queued_ideas" || job.status === "queued_mockups") return now - job.queuedAt > WAIT_MS;
  if (job.status === "ideas_running" || job.status === "mockups_running") return typeof job.leaseUntil === "number" && job.leaseUntil < now;
  return false;
}

function Photo({ src, alt, className }: { src: string; alt: string; className?: string }) {
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");
  return (
    <div className={`ws-photo ${className ?? ""}`}>
      {state !== "ok" && <div className={state === "error" ? "ws-photo-fallback" : "ws-skel ws-fill"}>{state === "error" ? "No preview" : null}</div>}
      <img src={src} alt={alt} className={`ws-fade ${state === "ok" ? "ws-in" : ""}`} onLoad={() => setState("ok")} onError={() => setState("error")} />
    </div>
  );
}

function Evidence({ text }: { text: string }) {
  const proven = text && text !== "untested";
  return <span className={`ws-chip ${proven ? "ws-chip-proven" : ""}`}>{proven ? text : "Not proven yet"}</span>;
}

function Wording({ lines, smallTop, smallBottom }: { lines: string[]; smallTop?: string; smallBottom?: string }) {
  return (
    <div className="ws-wording">
      {smallTop && <div className="ws-small">{smallTop}</div>}
      {lines.map((l, i) => <div key={i} className="ws-main">{l}</div>)}
      {smallBottom && <div className="ws-small">{smallBottom}</div>}
    </div>
  );
}

const downloadHref = (url: string, n: number, job: PublicJob) =>
  `/api/download?url=${encodeURIComponent(url)}&name=${encodeURIComponent(`${job.style || "wording"}-mockup-${n}.jpg`)}`;

export function JobView({ job, now, onChoose, onRestart, busy = false }: { job: PublicJob; now: number; onChoose: (c: string[][]) => void; onRestart: () => void; busy?: boolean }) {
  const [picked, setPicked] = useState<string[]>([]);
  const [own, setOwn] = useState("");
  const ownLines = own.split("\n").map((l) => l.trim()).filter(Boolean);
  const ownError = ownLines.length > 3 ? "Use up to 3 lines." : ownLines.some((l) => l.length > MAX_LINE) ? `Keep each line to ${MAX_LINE} characters.` : "";
  const slots = MAX_CHOICES - (ownLines.length ? 1 : 0);
  const count = picked.length + (ownLines.length ? 1 : 0);
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length < slots ? [...p, id] : p));
  const choose = () => onChoose([...job.ideas.filter((i) => picked.includes(i.id)).map((i) => i.main), ...(ownLines.length ? [ownLines] : [])]);

  if (isWaiting(job, now)) {
    return (
      <section className="ws-panel ws-notice" role="status">
        <strong>Waiting for the studio computer…</strong>
        <p>Jobs run on the Mac mini. This one starts as soon as it answers; you can leave this page and come back.</p>
      </section>
    );
  }
  if (job.status === "failed") {
    return (
      <section className="ws-panel ws-error" role="alert">
        <strong>This job stopped</strong>
        <p>{job.error || "Something went wrong."}</p>
        <button type="button" className="ws-btn" onClick={onRestart}>Start again</button>
      </section>
    );
  }
  if (job.status === "queued_ideas" || job.status === "ideas_running") {
    return (
      <section aria-busy="true">
        <h2 className="ws-h2">Finding ideas… <span className="ws-muted">checking our Faire sales and competitor bestsellers, about a minute</span></h2>
        <div className="ws-ideas">{Array.from({ length: 8 }, (_, i) => <div key={i} data-testid="ws-skeleton-idea" className="ws-card ws-skel-card"><div className="ws-skel ws-skel-line ws-w60" /><div className="ws-skel ws-skel-line ws-w40" /><div className="ws-skel ws-skel-chip" /></div>)}</div>
      </section>
    );
  }
  if (job.status === "ideas_ready") {
    return (
      <section>
        <h2 className="ws-h2">Pick up to 3 <span className="ws-muted">or write your own</span></h2>
        <div className="ws-ideas">
          {job.ideas.map((idea) => {
            const on = picked.includes(idea.id);
            return (
              <label key={idea.id} className={`ws-card ws-idea ${on ? "ws-on" : ""}`}>
                <input type="checkbox" checked={on} onChange={() => toggle(idea.id)} aria-label={idea.main.join(" ")} />
                <div className="ws-idea-body">
                  <Wording lines={idea.main} smallTop={idea.small_top} smallBottom={idea.small_bottom} />
                  <Evidence text={idea.evidence} />
                  {idea.why && <p className="ws-why">{idea.why}</p>}
                </div>
              </label>
            );
          })}
        </div>
        <div className="ws-own">
          <label htmlFor="ws-own-input" className="ws-label">Your own wording</label>
          <textarea id="ws-own-input" rows={3} value={own} onChange={(e) => setOwn(e.target.value.toUpperCase())} placeholder={"One line per row, e.g.\nWALK BY\nFAITH"} />
          {ownError && <p className="ws-field-error">{ownError}</p>}
        </div>
        <div className="ws-actions">
          <button type="button" className="ws-btn ws-primary" disabled={count === 0 || !!ownError || busy} onClick={choose}>
            {busy ? "Starting…" : `Mock up (${count})`}
          </button>
          <span className="ws-muted">Each mockup takes about 2 minutes on the Mac mini.</span>
        </div>
      </section>
    );
  }
  const tiles = job.status === "done" ? job.mockups : job.chosen.map((wording) => ({ wording, url: "" }));
  return (
    <section aria-busy={job.status !== "done"}>
      <h2 className="ws-h2">{job.status === "done" ? "Mockups" : "Making mockups…"} {job.status !== "done" && <span className="ws-muted">one at a time, about 2 minutes each</span>}</h2>
      <div className="ws-tiles">
        {tiles.map((m, i) => (
          <figure key={i} className="ws-tile">
            {m.url ? <Photo src={m.url} alt={m.wording.join(" ")} className="ws-tile-img" /> : <div className="ws-skel ws-tile-img" />}
            <figcaption>
              <span>{m.wording.join(" / ")}</span>
              {m.url && <a className="ws-btn" href={downloadHref(m.url, i + 1, job)}>Download</a>}
            </figcaption>
          </figure>
        ))}
      </div>
      {job.status === "done" && <button type="button" className="ws-btn" onClick={onRestart}>New job</button>}
    </section>
  );
}

async function api<T>(input: string, init?: RequestInit): Promise<T> {
  const r = await fetch(input, { cache: "no-store", ...init, headers: { "content-type": "application/json", ...(init?.headers || {}) } });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
  return d as T;
}

const STATUS_LABEL: Record<string, string> = { queued_ideas: "Waiting", ideas_running: "Finding ideas", ideas_ready: "Pick wording", queued_mockups: "Waiting", mockups_running: "Mocking up", done: "Done", failed: "Stopped" };

function extOf(f: File) {
  const t = f.type.toLowerCase(), n = f.name.toLowerCase();
  if (t.includes("heic") || n.endsWith(".heic")) return { ext: "heic", type: "image/heic" };
  if (t.includes("heif") || n.endsWith(".heif")) return { ext: "heif", type: "image/heif" };
  if (t.includes("png")) return { ext: "png", type: "image/png" };
  if (t.includes("webp")) return { ext: "webp", type: "image/webp" };
  return { ext: "jpg", type: "image/jpeg" };
}

export default function WordingStudioClient() {
  const [jobs, setJobs] = useState<PublicJob[] | null>(null);
  const [job, setJob] = useState<PublicJob | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [style, setStyle] = useState("");
  const [note, setNote] = useState("");
  const [category, setCategory] = useState<Category>("top");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  const loadList = useCallback(() => api<{ jobs: PublicJob[] }>("/api/wording-studio").then((d) => setJobs(d.jobs)).catch(() => setJobs((j) => j ?? [])), []);
  useEffect(() => { loadList(); const id = new URLSearchParams(location.search).get("job"); if (id) api<{ job: PublicJob }>(`/api/wording-studio?id=${id}`).then((d) => setJob(d.job)).catch(() => {}); }, [loadList]);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  useEffect(() => {
    if (!job || TERMINAL.has(job.status)) return;
    const t = setInterval(() => api<{ job: PublicJob }>(`/api/wording-studio?id=${job.id}`).then((d) => { setJob(d.job); if (TERMINAL.has(d.job.status)) loadList(); }).catch(() => {}), POLL_MS);
    return () => clearInterval(t);
  }, [job, loadList]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const open = (j: PublicJob | null) => { setJob(j); history.replaceState(null, "", j ? `?job=${j.id}` : location.pathname); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const pick = (f: File | undefined) => { if (!f) return; setFile(f); setPreview(URL.createObjectURL(f)); setError(""); };

  async function start() {
    if (!file) return;
    setBusy("Uploading photo…"); setError("");
    try {
      const { ext, type } = extOf(file);
      const blob = await upload(`wording-studio-uploads/${crypto.randomUUID()}.${ext}`, file, { access: "public", handleUploadUrl: "/api/wording-studio/upload", contentType: type });
      setBusy("Starting…");
      const d = await api<{ job: PublicJob }>("/api/wording-studio", { method: "POST", body: JSON.stringify({ photoUrl: blob.url, style, note, category }) });
      setFile(null); setPreview(""); setStyle(""); setNote("");
      open(d.job); loadList();
    } catch (e: any) { setError(e?.message || "Upload failed."); }
    finally { setBusy(""); }
  }

  async function choose(chosen: string[][]) {
    if (!job) return;
    setBusy("Starting…");
    try { const d = await api<{ job: PublicJob }>("/api/wording-studio", { method: "PATCH", body: JSON.stringify({ id: job.id, chosen }) }); setJob(d.job); loadList(); }
    catch (e: any) { setError(e?.message || "Could not start the mockups."); }
    finally { setBusy(""); }
  }

  return (
    <main className="flex min-h-screen flex-col bg-neutral-50">
      <StudioHeader active="wording" title="Wording Studio" subtitle="Swap the words on a garment for wording with Faire sales proof, then see it mocked up." />
      <div className="ws-page">
        {job ? (
          <div className="ws-job">
            <aside className="ws-job-side">
              <Photo src={job.photoUrl} alt="Garment" className="ws-job-photo" />
              <dl className="ws-meta">
                {job.style && <><dt>Style</dt><dd>{job.style}</dd></>}
                <dt>Type</dt><dd>{CATEGORY_LABELS.find(([c]) => c === job.category)?.[1]}</dd>
                {job.note && <><dt>Note</dt><dd>{job.note}</dd></>}
              </dl>
              <button type="button" className="ws-btn" onClick={() => open(null)}>New job</button>
            </aside>
            <div className="ws-job-main">
              {error && <p className="ws-field-error" role="alert">{error}</p>}
              <JobView key={job.id + job.status} job={job} now={now} onChoose={choose} onRestart={() => open(null)} busy={!!busy} />
            </div>
          </div>
        ) : (
          <section className="ws-panel ws-new">
            <h2 className="ws-h2">New job</h2>
            <div className="ws-new-grid">
              <button type="button" className={`ws-drop ${preview ? "ws-has" : ""}`} onClick={() => fileInput.current?.click()}
                onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); pick(e.dataTransfer.files[0]); }}>
                {preview ? <Photo src={preview} alt="Chosen photo" className="ws-fill" /> : <span><strong>Choose a photo</strong><br />of the garment with its wording, or drop it here</span>}
              </button>
              <input ref={fileInput} type="file" accept="image/*,.heic,.heif" hidden onChange={(e) => pick(e.target.files?.[0])} />
              <div className="ws-fields">
                <label className="ws-label" htmlFor="ws-style">Style number <span className="ws-muted">optional</span></label>
                <input id="ws-style" value={style} onChange={(e) => setStyle(e.target.value.toUpperCase())} placeholder="DT78036" />
                <label className="ws-label" htmlFor="ws-cat">Garment</label>
                <select id="ws-cat" value={category} onChange={(e) => setCategory(e.target.value as Category)}>
                  {CATEGORY_LABELS.map(([c, l]) => <option key={c} value={c}>{l}</option>)}
                </select>
                <label className="ws-label" htmlFor="ws-note">Note for the mockup <span className="ws-muted">optional</span></label>
                <textarea id="ws-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. remove the charm at the neckline" />
                {error && <p className="ws-field-error" role="alert">{error}</p>}
                <button type="button" className="ws-btn ws-primary" disabled={!file || !!busy} onClick={start}>{busy || "Find wording"}</button>
              </div>
            </div>
          </section>
        )}

        <section className="ws-history">
          <h2 className="ws-h2">Past jobs</h2>
          {jobs === null ? (
            <div className="ws-rows">{Array.from({ length: 3 }, (_, i) => <div key={i} className="ws-row"><div className="ws-skel ws-thumb" /><div className="ws-skel ws-skel-line ws-w40" /></div>)}</div>
          ) : jobs.length === 0 ? (
            <p className="ws-muted">No jobs yet. Your first one will show here.</p>
          ) : (
            <div className="ws-rows">
              {jobs.map((j) => (
                <button key={j.id} type="button" className={`ws-row ${job?.id === j.id ? "ws-on" : ""}`} onClick={() => open(j)}>
                  <Photo src={j.mockups[0]?.url || j.photoUrl} alt="" className="ws-thumb" />
                  <span className="ws-row-text"><strong>{j.chosen[0]?.join(" ") || j.style || "Untitled"}</strong><span className="ws-muted">{new Date(j.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span></span>
                  <span className={`ws-chip ${j.status === "done" ? "ws-chip-proven" : j.status === "failed" ? "ws-chip-bad" : ""}`}>{STATUS_LABEL[j.status]}</span>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
