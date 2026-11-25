"use client";

// Style search → ERP gallery → colour tabs → which photo is the Front, Back, Side (and, for bottoms, the full-body
// base). Picking a role first and then a photo keeps every assignment one tap on a phone.
import { useMemo, useState, type FormEvent } from "react";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import core from "@/lib/model-shots-core";
import type { ColorSetup, Gallery, GalleryGroup, StudioState } from "@/lib/model-studio/types";
import { cn } from "@/lib/utils";
import { Row, Section, Segmented, Tag, Thumb } from "./bits";

export type Role = "front" | "back" | "side" | "full";
const ROLE_LABEL: Record<Role, string> = { front: "Front", back: "Back", side: "Side", full: "Full body" };

export type Load<T> = { status: "idle" | "loading" | "ready" | "error"; data?: T; error?: string };

export function roleUrl(setup: ColorSetup, role: Role): string {
  if (role === "front") return setup.picked[0] || "";
  if (role === "back") return setup.picked[1] || "";
  if (role === "side") return setup.garmentSide;
  return setup.fullBase;
}

/** The gallery groups for a colour tab: that colour first, then the style-level and styled-with photos. */
export function groupsFor(gallery: Gallery | undefined, color: string): GalleryGroup[] {
  const groups = gallery?.groups || [];
  const own = groups.filter((g) => g.kind === "colorway" && g.label === color);
  return [...own, ...groups.filter((g) => g.kind !== "colorway")];
}

export function colorsOf(gallery: Gallery | undefined): GalleryGroup[] {
  return (gallery?.groups || []).filter((g) => g.kind === "colorway");
}

export default function StylePanel({ state, setup, gallery, bottoms, planLabel, onOpen, onColor, onAssign, onField }: {
  state: StudioState | null;
  setup: ColorSetup | null;
  gallery: Load<Gallery>;
  bottoms: boolean;
  planLabel: string;
  onOpen: (style: string) => void;
  onColor: (color: string) => void;
  onAssign: (role: Role, url: string) => void;
  onField: (field: "title" | "type", value: string) => void;
}) {
  const [query, setQuery] = useState(state?.style || "");
  const [role, setRole] = useState<Role>("front");
  const roles: Role[] = bottoms ? ["front", "back", "side", "full"] : ["front", "back", "side"];
  const data = gallery.data;
  const thumbOf = useMemo(() => {
    const map = new Map<string, string>();
    for (const g of data?.groups || []) for (const p of g.photos) map.set(p.full, p.thumb);
    return map;
  }, [data]);
  const colors = colorsOf(data);
  const groups = groupsFor(data, state?.color || "");

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const s = query.trim().toUpperCase();
    if (s) onOpen(s);
  };
  const pick = (url: string) => {
    if (!setup) return;
    onAssign(role, roleUrl(setup, role) === url ? "" : url);
    // Move on to the next empty role, so Front → Back → Side is three taps.
    const next = roles.find((r) => r !== role && !roleUrl(setup, r) && r !== "full");
    if (role === "front" && next) setRole(next);
  };
  const roleOf = (url: string): Role | null => (setup ? roles.find((r) => roleUrl(setup, r) === url) || null : null);

  return (
    <Section title="Style" hint="Search a style code, choose the colour, then tap a role and a photo.">
      <form onSubmit={submit} className="flex gap-2" role="search">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input aria-label="Style code" placeholder="e.g. DT78080" value={query} onChange={(e) => setQuery(e.target.value)} className="h-9 rounded-[10px] pl-8 uppercase" />
        </div>
        <Button type="submit" size="lg" className="rounded-[10px]" disabled={!query.trim() || gallery.status === "loading"}>Open</Button>
      </form>

      {gallery.status === "loading" && (
        <div className="mt-4 space-y-3" aria-busy="true" aria-label="Loading ERP photos">
          <div className="flex gap-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-8 w-24 rounded-[10px]" />)}</div>
          <div className="grid grid-cols-4 gap-2">{[0, 1, 2, 3, 4, 5, 6, 7].map((i) => <Skeleton key={i} className="aspect-[2/3] rounded-[10px]" />)}</div>
        </div>
      )}

      {gallery.status === "error" && (
        <Alert variant="error" className="mt-4 rounded-[12px]">
          <AlertTitle>Could not read the ERP photos</AlertTitle>
          <AlertDescription>
            {gallery.error}
            <div className="mt-2"><Button size="sm" variant="outline" onClick={() => state?.style && onOpen(state.style)}>Try again</Button></div>
          </AlertDescription>
        </Alert>
      )}

      {gallery.status === "ready" && data && state && setup && (
        <div className="mt-4 space-y-4">
          {(data.resolvedFrom || data.regularizedFrom) && (
            <p className="text-[12px] text-muted-foreground">Showing {data.style} (you typed {data.resolvedFrom || data.regularizedFrom}).</p>
          )}
          {data.candidates.length > 1 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[12px] text-muted-foreground">Also matches:</span>
              {data.candidates.filter((c) => c.style !== data.style).slice(0, 6).map((c) => (
                <Button key={c.style} size="xs" variant="outline" onClick={() => { setQuery(c.style); onOpen(c.style); }}>{c.style}</Button>
              ))}
            </div>
          )}

          {colors.length > 0 && (
            <div>
              <p className="mb-1.5 text-[12px] font-medium text-muted-foreground">Colour</p>
              <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Colour">
                {colors.map((g) => (
                  <button
                    key={g.label}
                    type="button"
                    role="tab"
                    aria-selected={g.label === state.color}
                    onClick={() => onColor(g.label)}
                    className={cn(
                      "flex h-9 items-center gap-2 rounded-[10px] border border-border bg-background py-1 pr-3 pl-1 text-[13px] font-medium transition-colors",
                      g.label === state.color ? "border-foreground/70 text-foreground" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <Thumb src={g.photos[0]?.thumb} alt="" className="h-7 w-5 rounded-[6px]" label="" />
                    {g.label}
                    <span className="text-[11px] text-muted-foreground">{g.photos.length}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-[12px] font-medium text-muted-foreground">Garment photos</p>
              <Segmented label="Assign role" value={role} onChange={setRole} className="w-full min-[481px]:w-auto" options={roles.map((r) => ({ value: r, label: ROLE_LABEL[r] }))} />
            </div>
            <div className={cn("grid gap-2", bottoms ? "grid-cols-4" : "grid-cols-3")}>
              {roles.map((r) => {
                const url = roleUrl(setup, r);
                return (
                  <div key={r} className={cn("ms-role rounded-[10px] border p-1.5", r === role ? "border-foreground/60" : "border-border")}>
                    <button type="button" onClick={() => setRole(r)} className="block w-full text-left" aria-label={`${ROLE_LABEL[r]} slot`}>
                      <Thumb src={url ? thumbOf.get(url) || url : undefined} alt={`${ROLE_LABEL[r]} photo`} className="aspect-[2/3] w-full" label={r === "front" ? "Required" : "Optional"} />
                    </button>
                    <div className="mt-1.5 flex h-6 items-center justify-between gap-1">
                      <span className="text-[12px] font-medium">{ROLE_LABEL[r]}</span>
                      {url ? (
                        <Button size="icon" variant="ghost" className="size-6" aria-label={`Clear ${ROLE_LABEL[r]}`} onClick={() => onAssign(r, "")}><X className="size-3.5" /></Button>
                      ) : <Tag tone={r === "front" ? "amber" : "neutral"}>{r === "front" ? "Needed" : "Empty"}</Tag>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {groups.length === 0 ? (
            <p className="rounded-[10px] border border-dashed border-border p-4 text-center text-[13px] text-muted-foreground">The ERP has no photos for this colour yet.</p>
          ) : groups.map((g) => (
            <div key={`${g.kind}-${g.label}`}>
              <p className="mb-1.5 text-[12px] text-muted-foreground">
                {g.kind === "colorway" ? `${g.label} photos` : g.label}
                {g.styledWith.length > 0 && ` · styled with ${g.styledWith.join(", ")}`}
              </p>
              <div className="grid grid-cols-4 gap-2 min-[481px]:grid-cols-5">
                {g.photos.map((p) => {
                  const r = roleOf(p.full);
                  return (
                    <button
                      key={p.full}
                      type="button"
                      onClick={() => pick(p.full)}
                      aria-pressed={Boolean(r)}
                      aria-label={`${p.label}${r ? `, ${ROLE_LABEL[r]}` : ""}`}
                      className={cn("relative rounded-[10px] outline-offset-2 transition-shadow", r && "ring-2 ring-foreground")}
                    >
                      <Thumb src={p.thumb} alt={p.label} className="aspect-[2/3] w-full" />
                      {r && <span className="absolute top-1 left-1"><Tag tone="blue">{ROLE_LABEL[r]}</Tag></span>}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          <div className="border-t border-border pt-3">
            <Row label="Title" htmlFor="ms-title">
              <Input id="ms-title" value={state.title} placeholder="e.g. Linen Button Top" onChange={(e) => onField("title", e.target.value)} className="h-8 rounded-[10px]" />
            </Row>
            <Row label="Type" htmlFor="ms-type">
              <Input id="ms-type" value={state.type} placeholder="Read from code + title" onChange={(e) => onField("type", e.target.value)} className="h-8 rounded-[10px]" />
            </Row>
            <Row label="Plan">
              <p className="py-1.5 text-[13px] leading-snug text-foreground">{planLabel}</p>
            </Row>
          </div>
        </div>
      )}
    </Section>
  );
}

export { ROLE_LABEL };
export const VIEW_TITLE = core.VIEW_LABEL;
