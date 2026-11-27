"use client";

// Photoshoot Studio (Kobra redesign, 2026-11-27): product photos and one shoot-day
// reference on the left, the run and its shots on the right. Same API calls as before
// (/api/user-references, /api/prompt-studio/photoshoot, /api/generate); what changed
// is the look, the render-status card per shot, Retry on a failed shot, and download.
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Download, ExternalLink, ImageIcon, ImagePlus, Play, Plus } from "lucide-react";
import StudioHeader from "@/components/StudioHeader";
import { RenderStatus } from "@/components/kit/RenderStatus";
import { Section, Segmented, Tag, Thumb } from "@/components/model-studio/bits";
import { downloadAs } from "@/components/model-studio/api";
import { Alert, AlertAction, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { PHOTOSHOOT_REFERENCES } from "@/lib/photoshoot-references";
import {
  anchorFor, renderStatusOf, runSummary, SHOT_COUNTS, SHOT_ESTIMATE_MS, shotFileName, type Shot, type ShotReference,
} from "@/lib/photoshoot-run";
import type { UploadedImage } from "@/components/types";
import { resizeIfNeeded } from "@/lib/image-resize";
import { uploadImages } from "@/lib/upload-images";
import { cn } from "@/lib/utils";

const REFERENCE_USAGE_KEY = "davidani:photoshoot-reference-usage:v1";
const CANVAS = "2K · auto";

async function json(input: string, init?: RequestInit) {
  const response = await fetch(input, init);
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error || `HTTP ${response.status}`);
  return data;
}

function readUsage(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(REFERENCE_USAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

export default function PhotoshootStudioClient() {
  const productInput = useRef<HTMLInputElement>(null);
  const referenceInput = useRef<HTMLInputElement>(null);
  const [products, setProducts] = useState<UploadedImage[]>([]);
  const [userReferences, setUserReferences] = useState<ShotReference[]>([]);
  const [selectedReferenceId, setSelectedReferenceId] = useState<string>(PHOTOSHOOT_REFERENCES[0]?.id ?? "");
  const [shotCount, setShotCount] = useState(4);
  const [uploadingProduct, setUploadingProduct] = useState(false);
  const [uploadingReference, setUploadingReference] = useState(false);
  // How many runs are going: the main sequence and any Retry started beside it.
  const [active, setActive] = useState(0);
  const running = active > 0;
  const [shots, setShots] = useState<Shot[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<string>("");
  // The run's own products, so a Retry after a new upload still shoots the same style.
  const runProducts = useRef<UploadedImage[]>([]);
  const shotsRef = useRef<Shot[]>([]);
  shotsRef.current = shots;

  const references = useMemo<ShotReference[]>(
    () => [...PHOTOSHOOT_REFERENCES.map((item) => ({ ...item, builtIn: true })), ...userReferences],
    [userReferences]
  );
  const selected = references.find((item) => item.id === selectedReferenceId);
  const doneShots = shots.filter((s) => s.status === "done" && s.url);

  useEffect(() => {
    json("/api/user-references")
      .then((data) =>
        setUserReferences(
          (data.references || []).map((item: any) => ({ id: `saved-${item.id}`, label: item.label, url: item.imageUrl }))
        )
      )
      .catch(() => undefined);
  }, []);

  async function uploadProducts(files: FileList) {
    setUploadingProduct(true);
    setError(null);
    try {
      // Shrunk in the browser, then sent straight to storage (lib/upload-images.ts).
      setProducts(await uploadImages("Product upload", Array.from(files).slice(0, 6)));
      setShots([]);
    } catch (err: any) {
      setError(err?.message || "Product upload failed");
    } finally {
      setUploadingProduct(false);
    }
  }

  async function uploadReference(file: File) {
    setUploadingReference(true);
    setError(null);
    try {
      const resized = await resizeIfNeeded(file);
      const form = new FormData();
      form.append("file", resized);
      form.append("label", file.name.replace(/\.[^.]+$/, ""));
      const data = await json("/api/user-references", { method: "POST", body: form });
      const added = { id: `saved-${data.reference.id}`, label: data.reference.label, url: data.reference.imageUrl };
      setUserReferences((current) => [...current, added]);
      setSelectedReferenceId(added.id);
    } catch (err: any) {
      setError(err?.message || "Reference upload failed");
    } finally {
      setUploadingReference(false);
    }
  }

  const patch = (id: string, next: Partial<Shot>) =>
    setShots((current) => current.map((s) => (s.id === id ? { ...s, ...next } : s)));

  async function runOne(item: Shot, identityAnchorUrl?: string): Promise<string | undefined> {
    const items = runProducts.current;
    patch(item.id, { status: "running", phase: "analyzing", startedAt: Date.now(), error: undefined, failedAt: undefined, url: undefined });
    let step: "analyzing" | "generating" = "analyzing";
    try {
      const promptData = await json("/api/prompt-studio/photoshoot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageUrls: items.map((product) => product.url),
          referenceId: item.reference.builtIn ? item.reference.id : undefined,
          referenceUrl: item.reference.builtIn ? undefined : item.reference.url,
          count: 1,
          direction: "balanced",
          variationIndex: item.variationIndex,
          hasIdentityAnchor: Boolean(identityAnchorUrl),
        }),
      });
      step = "generating";
      patch(item.id, { phase: "generating", shotVariation: promptData.shotVariation });
      const generation = await json("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modelId: "gpt-image",
          prompt: promptData.prompts,
          imageUrls: [...items.map((product) => product.url), item.reference.url, ...(identityAnchorUrl ? [identityAnchorUrl] : [])],
          aspectRatio: "auto",
          resolution: "2K",
          format: "png",
          numImages: 1,
          raw: true,
          useDefaultReference: false,
          referenceImageUrl: null,
        }),
      });
      const url = generation.images?.[0]?.url;
      if (!url) throw new Error("Generation returned no image");
      patch(item.id, { status: "done", url });
      return url as string;
    } catch (err: any) {
      patch(item.id, { status: "failed", error: err?.message || "Generation failed", failedAt: step });
      return undefined;
    }
  }

  async function generate() {
    if (!products.length) return setError("Upload at least one ERP product image");
    if (!selected) return setError("Select one photographic reference");
    setActive((n) => n + 1);
    setError(null);
    runProducts.current = products;
    const usage = readUsage();
    const startingVariation = Math.max(0, Number(usage[selected.id]) || 0);
    const initial: Shot[] = Array.from({ length: shotCount }, (_, index) => ({
      id: `${Date.now()}-${index}`,
      reference: selected,
      shotNumber: index + 1,
      status: "queued",
      variationIndex: startingVariation + index,
    }));
    usage[selected.id] = startingVariation + shotCount;
    try {
      localStorage.setItem(REFERENCE_USAGE_KEY, JSON.stringify(usage));
    } catch {
      /* private window: variations restart next time */
    }
    setShots(initial);

    let identityAnchorUrl: string | undefined;
    for (const item of initial) {
      const generatedUrl = await runOne(item, identityAnchorUrl);
      if (!identityAnchorUrl && generatedUrl) identityAnchorUrl = generatedUrl;
    }
    setActive((n) => n - 1);
  }

  async function retry(shot: Shot) {
    setActive((n) => n + 1);
    await runOne(shot, anchorFor(shotsRef.current, shot.id));
    setActive((n) => n - 1);
  }

  async function download(list: Shot[]) {
    setDownloading(list.length > 1 ? "all" : list[0]?.id || "");
    try {
      for (const shot of list) if (shot.url) await downloadAs(shot.url, shotFileName(shot));
    } catch (err: any) {
      setError(err?.message || "A download failed");
    } finally {
      setDownloading("");
    }
  }

  const blocker = !products.length ? "Upload the product photos to start." : !selected ? "Pick a shoot-day reference." : "";
  const runLabel = running ? "Generating…" : `Generate ${shotCount} shots`;
  const canRun = !running && !blocker;

  return (
    <>
      {/* Paper's shell styles are @scope'd to stop at .kobra, so the shared header sits outside the Kobra wrapper. */}
      <StudioHeader
        active="photoshoot"
        title="Photoshoot"
        subtitle="Upload an ERP style, choose one shoot-day reference, and generate a consistent campaign."
        metrics={[{ label: "Products", value: products.length }, { label: "Shots", value: shotCount }, { label: "Active", value: shots.filter((s) => s.status === "running").length }]}
      />
      <main className="kobra ps-page min-h-dvh bg-[#fafafa] max-[480px]:pb-24">
        <div className="mx-auto grid max-w-[1440px] gap-4 px-4 py-4 min-[481px]:px-6 lg:grid-cols-[minmax(340px,420px)_minmax(0,1fr)] lg:items-start">
          <div className="flex min-w-0 flex-col gap-4">
            <Section
              title="Product photos"
              hint="Front, back and detail shots of one style. Together they are the garment contract."
              action={products.length ? <Button size="sm" variant="outline" disabled={uploadingProduct || running} onClick={() => productInput.current?.click()}>Replace</Button> : undefined}
            >
              <input ref={productInput} type="file" multiple accept="image/*" className="hidden" onChange={(event) => { if (event.target.files?.length) uploadProducts(event.target.files); event.currentTarget.value = ""; }} />
              {products.length ? (
                <div className="grid grid-cols-3 gap-2 min-[481px]:grid-cols-6 lg:grid-cols-3">
                  {products.map((product, index) => (
                    <div key={product.url} className="relative">
                      <Thumb src={product.url} alt={product.name} className="aspect-square w-full" />
                      <span className="absolute top-1.5 left-1.5"><Tag>{index + 1}</Tag></span>
                    </div>
                  ))}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => productInput.current?.click()}
                  disabled={uploadingProduct || running}
                  className="flex w-full flex-col items-center justify-center gap-1.5 rounded-[10px] border border-dashed border-border bg-muted/50 px-4 py-8 text-center transition-colors duration-150 hover:border-foreground/40 hover:bg-muted disabled:opacity-50"
                >
                  <ImagePlus className="size-5 text-muted-foreground" aria-hidden />
                  <span className="text-[13px] font-medium text-foreground">{uploadingProduct ? "Uploading…" : "Upload product photos"}</span>
                  <span className="text-[12px] text-muted-foreground">Up to 6 images</span>
                </button>
              )}
              {products.length > 0 && uploadingProduct && <p className="mt-2 text-[12px] text-muted-foreground">Uploading…</p>}
            </Section>

            <Section
              title="Shoot-day reference"
              hint="One photo sets the light, place, lens and palette for every shot."
              action={
                <Button size="sm" variant="outline" disabled={uploadingReference || running} onClick={() => referenceInput.current?.click()}>
                  <Plus data-icon="inline-start" aria-hidden />{uploadingReference ? "Saving…" : "Add"}
                </Button>
              }
            >
              <input ref={referenceInput} type="file" accept="image/*" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) uploadReference(file); event.currentTarget.value = ""; }} />
              <div className="ps-refs grid grid-cols-4 gap-1.5 min-[481px]:grid-cols-5 lg:grid-cols-4" role="radiogroup" aria-label="Shoot-day reference">
                {references.map((reference) => {
                  const on = selectedReferenceId === reference.id;
                  return (
                    <button
                      key={reference.id}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => setSelectedReferenceId(reference.id)}
                      disabled={running}
                      title={reference.label}
                      className={cn(
                        "group relative rounded-[12px] p-[2px] text-left outline-offset-2 transition-shadow duration-150 disabled:cursor-not-allowed",
                        on ? "shadow-[0_0_0_2px_var(--color-foreground)]" : "hover:shadow-[0_0_0_1px_var(--color-border)]"
                      )}
                    >
                      <Thumb src={reference.url} alt={reference.label} className="aspect-[4/5] w-full" />
                      {on && (
                        <span className="absolute top-2 right-2 grid size-5 place-items-center rounded-[6px] bg-foreground text-background">
                          <Check className="size-3" strokeWidth={3} aria-hidden />
                        </span>
                      )}
                      {!reference.builtIn && <span className="absolute top-2 left-2"><Tag tone="blue">Yours</Tag></span>}
                    </button>
                  );
                })}
              </div>
              <p className="mt-2.5 truncate text-[12px] text-muted-foreground" aria-live="polite">
                {selected ? <><span className="font-medium text-foreground">{selected.label}</span> selected</> : "No reference selected"}
              </p>
            </Section>

            <Section title="Shots" hint="Shot 1 sets the model. The rest keep her and the shoot day, with new poses and angles.">
              <Segmented label="Number of shots" value={shotCount} onChange={setShotCount} disabled={running}
                className="w-full min-[481px]:w-auto"
                options={SHOT_COUNTS.map((count) => ({ value: count, label: String(count) }))} />
            </Section>
          </div>

          <div className="flex min-w-0 flex-col gap-4">
            <div className="ps-runbar flex flex-wrap items-center gap-2.5 rounded-[12px] border border-border bg-card p-2.5 max-[480px]:hidden">
              <Button size="lg" className="rounded-[10px]" disabled={!canRun} onClick={() => void generate()}>
                <Play data-icon="inline-start" aria-hidden />{runLabel}
              </Button>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] text-foreground" data-testid="ps-summary">{blocker || runSummary(shots, shotCount)}</p>
                <p className="truncate text-[11px] text-muted-foreground">GPT Image · each shot is one render</p>
              </div>
              {doneShots.length > 1 && (
                <Button variant="outline" disabled={downloading !== ""} onClick={() => void download(doneShots)}>
                  <Download data-icon="inline-start" aria-hidden />{downloading === "all" ? "Downloading…" : `Download all (${doneShots.length})`}
                </Button>
              )}
            </div>

            {error && (
              <Alert variant="error" className="rounded-[12px]">
                <AlertDescription>{error}</AlertDescription>
                <AlertAction><Button size="sm" variant="ghost" onClick={() => setError(null)}>Dismiss</Button></AlertAction>
              </Alert>
            )}

            {shots.length ? (
              <div className="ps-shots grid grid-cols-2 gap-3 xl:grid-cols-3">
                {shots.map((shot) => (
                  <ShotCard key={shot.id} shot={shot} downloading={downloading === shot.id}
                    onRetry={() => void retry(shot)} onDownload={() => void download([shot])} />
                ))}
              </div>
            ) : (
              <Empty className="max-w-none rounded-[12px] border border-dashed border-border bg-card py-16">
                <EmptyHeader>
                  <EmptyMedia variant="icon"><ImageIcon aria-hidden /></EmptyMedia>
                  <EmptyTitle>Your campaign lands here</EmptyTitle>
                  <EmptyDescription>Upload the style&apos;s photos, pick a shoot-day reference and the number of shots, then generate. Every shot keeps the same model and the same day.</EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}
          </div>
        </div>

        {/* Phone: the run controls stay in reach at the bottom. */}
        <div className="ps-phonebar fixed inset-x-0 bottom-0 z-30 flex items-center gap-2.5 border-t border-border bg-card px-4 py-2.5 min-[481px]:hidden">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[12px] text-foreground">{blocker || runSummary(shots, shotCount)}</p>
          </div>
          <Button className="rounded-[10px]" disabled={!canRun} onClick={() => void generate()}>
            <Play data-icon="inline-start" aria-hidden />{runLabel}
          </Button>
        </div>
      </main>
    </>
  );
}

function ShotCard({ shot, downloading, onRetry, onDownload }: { shot: Shot; downloading: boolean; onRetry?: () => void; onDownload: () => void }) {
  const title = `Shot ${shot.shotNumber}`;

  if (shot.status === "queued") {
    return (
      <article className="ps-shot flex flex-col rounded-[12px] border border-dashed border-border bg-card p-3" aria-label={`${title}, queued`}>
        <div className="flex aspect-[2/3] w-full flex-col items-center justify-center gap-1 rounded-[10px] bg-muted/60 px-4 text-center">
          <span className="text-[13px] font-medium text-foreground">{title}</span>
          <span className="text-[12px] text-muted-foreground">Waits for the shot before it, so the model stays the same.</span>
        </div>
      </article>
    );
  }

  if (shot.status !== "done") {
    return (
      <RenderStatus
        className="ps-shot rounded-[12px]"
        status={renderStatusOf(shot)}
        startedAt={shot.startedAt || Date.now()}
        estimateMs={SHOT_ESTIMATE_MS}
        title={shot.shotVariation ? `${title} · ${shot.shotVariation}` : title}
        resolution={CANVAS}
        error={shot.error}
        failedAt={shot.failedAt}
        onRetry={shot.status === "failed" ? onRetry : undefined}
      />
    );
  }

  return (
    <article className="ps-shot flex flex-col rounded-[12px] border border-border bg-card p-3" aria-label={`${title}, done`}>
      <a href={shot.url} target="_blank" rel="noreferrer" className="block rounded-[10px] outline-offset-2">
        <Thumb src={shot.url} alt={title} fit="contain" className="aspect-[2/3] w-full" />
      </a>
      <div className="mt-2.5 flex min-w-0 items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-[13px] font-semibold">{title}</h3>
          <p className="truncate text-[12px] text-muted-foreground">{shot.shotVariation || shot.reference.label}</p>
        </div>
        {shot.shotNumber === 1 && <Tag tone="green">Sets the model</Tag>}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-1.5">
        <Button size="sm" variant="outline" disabled={downloading} onClick={onDownload}>
          <Download data-icon="inline-start" aria-hidden />{downloading ? "Saving…" : "Download"}
        </Button>
        <a href={shot.url} target="_blank" rel="noreferrer" className={buttonVariants({ size: "sm", variant: "ghost" })}>
          <ExternalLink data-icon="inline-start" aria-hidden />Open
        </a>
      </div>
    </article>
  );
}

