"use client";

// Who wears it: a row of people (Auto by style first, then each house person's portrait), then that person's
// catalogue looks with their expression chips, then the sets that show nobody we know under "Other models".
import { useMemo } from "react";
import { Sparkles } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import core, { type Category, type CoreLook } from "@/lib/model-shots-core";
import { personOf } from "@/lib/people";
import type { Catalogue, ColorSetup } from "@/lib/model-studio/types";
import { cn } from "@/lib/utils";
import { Section, Segmented, Tag, Thumb } from "./bits";
import type { Load } from "./StylePanel";

export interface PickerGroups { people: { id: string; name: string; portrait: string; looks: CoreLook[] }[]; other: CoreLook[]; note: string }

/** Looks per person. A look's person is its first plate's model: the catalogue tag, else the set's name. */
export function lookGroups(catalogue: Catalogue, category: Category): PickerGroups {
  const { looks, others, note } = core.looksFor(category, catalogue.models);
  const byId = new Map(catalogue.models.map((m) => [m.id, m]));
  const personFor = (modelId: string) => {
    const m = byId.get(modelId);
    return m ? m.person || personOf(m, catalogue.people) : "";
  };
  const otherLooks: CoreLook[] = [
    ...looks.filter((l) => !personFor(l.plates[0]?.modelId || "")),
    ...others.filter((m) => m.poses?.[0]).map((m) => ({ key: m.id, label: m.name || m.id, own: false, plates: [{ modelId: m.id, poseId: m.poses[0].id, expression: "", pose: m.poses[0] }] })),
  ];
  return {
    people: catalogue.people.map((p) => ({ ...p, looks: looks.filter((l) => personFor(l.plates[0]?.modelId || "") === p.id) })),
    other: otherLooks,
    note,
  };
}

function LookCard({ look, setup, category, hem, onPick }: { look: CoreLook; setup: ColorSetup; category: Category; hem: string; onPick: (modelId: string, poseId: string) => void }) {
  const active = look.plates.find((p) => p.modelId === setup.humanModelId && p.poseId === setup.poseId);
  const first = active || look.plates[0];
  return (
    <div className={cn("ms-look rounded-[12px] border p-1.5", active ? "border-foreground/70" : "border-border")}>
      <button type="button" className="block w-full text-left" aria-pressed={Boolean(active)} onClick={() => onPick(first.modelId, first.poseId)}>
        <Thumb src={core.previewFor(category, first.pose, hem)} alt={look.label} className="aspect-[2/3] w-full" />
        <span className="mt-1.5 block truncate text-[12px] font-medium">{look.label}</span>
      </button>
      <div className="mt-1 flex min-h-5 flex-wrap gap-1">
        {look.own && <Tag tone="blue">Your set</Tag>}
        {look.plates.length > 1 && look.plates.map((p) => (
          <button
            key={p.modelId}
            type="button"
            aria-pressed={active?.modelId === p.modelId}
            onClick={() => onPick(p.modelId, p.poseId)}
            className={cn("h-5 rounded-[6px] border px-1.5 text-[11px]", active?.modelId === p.modelId ? "border-foreground/70 bg-muted text-foreground" : "border-border text-muted-foreground hover:text-foreground")}
          >
            {core.expressionLabel(p.expression) || "Plate"}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function ModelPicker({ catalogue, setup, person, personHint, category, hem, onPerson, onPick, onFit, onRetry }: {
  catalogue: Load<Catalogue>;
  setup: ColorSetup | null;
  person: string;
  personHint: boolean;
  category: Category;
  hem: string;
  onPerson: (person: string) => void;
  onPick: (modelId: string, poseId: string) => void;
  onFit: (fit: "style" | "reference") => void;
  onRetry: () => void;
}) {
  const groups = useMemo(() => (catalogue.data ? lookGroups(catalogue.data, category) : null), [catalogue.data, category]);
  const auto = !setup || setup.humanModelId === core.AUTO_MODEL;
  const chosen = groups?.people.find((p) => p.id === person);
  // A long hem on a set whose back and side stop at the thigh gets its hem cut short (plates.json full_length).
  const fullLength = (modelId: string) => Boolean(catalogue.data?.models.find((m) => m.id === modelId)?.fullLength);
  const shortSet = hem === "long" && !auto && !core.isBottoms(category) && Boolean(setup) && !fullLength(setup!.humanModelId);
  const fullPlate = shortSet && groups
    ? [...(chosen?.looks || []), ...groups.people.flatMap((p) => p.looks), ...groups.other].flatMap((l) => l.plates).find((p) => fullLength(p.modelId))
      // No full-length look in the groups (e.g. the category list hides them): fall back to the person's full-length sets, then any.
      || [...(catalogue.data?.models || [])].sort((a, b) => Number(b.person === person) - Number(a.person === person))
        .filter((m) => m.fullLength && m.poses?.[0]).map((m) => ({ modelId: m.id, poseId: m.poses[0].id }))[0]
    : undefined;

  return (
    <Section title="Model" hint={personHint ? "Same person as this style's other colours." : "Auto picks a plate for the style. Choose a person to pick the look yourself."}>
      {catalogue.status === "loading" || catalogue.status === "idle" ? (
        <div className="space-y-3" aria-busy="true" aria-label="Loading models">
          <div className="grid grid-cols-3 gap-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-16 rounded-[12px]" />)}</div>
          <div className="grid grid-cols-4 gap-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="aspect-[2/3] rounded-[12px]" />)}</div>
        </div>
      ) : catalogue.status === "error" ? (
        <Alert variant="error" className="rounded-[12px]">
          <AlertTitle>Could not load the model library</AlertTitle>
          <AlertDescription>{catalogue.error}<div className="mt-2"><Button size="sm" variant="outline" onClick={onRetry}>Try again</Button></div></AlertDescription>
        </Alert>
      ) : groups && setup ? (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Person">
            <button type="button" role="radio" aria-checked={auto && !person} onClick={() => onPerson("")}
              className={cn("ms-person flex h-16 items-center gap-2.5 rounded-[12px] border px-2.5 text-left", auto && !person ? "border-foreground/70" : "border-border")}>
              <span className="flex size-11 shrink-0 items-center justify-center rounded-[10px] bg-muted"><Sparkles className="size-4" aria-hidden /></span>
              <span className="min-w-0"><span className="block text-[13px] font-medium">Auto</span><span className="block truncate text-[11px] text-muted-foreground">by style</span></span>
            </button>
            {groups.people.map((p) => (
              <button key={p.id} type="button" role="radio" aria-checked={person === p.id} onClick={() => onPerson(p.id)}
                className={cn("ms-person flex h-16 items-center gap-2.5 rounded-[12px] border px-2.5 text-left", person === p.id ? "border-foreground/70" : "border-border")}>
                <Thumb src={p.portrait} alt={p.name} className="size-11 shrink-0" />
                <span className="min-w-0"><span className="block text-[13px] font-medium">{p.name}</span><span className="block truncate text-[11px] text-muted-foreground">{p.looks.length} look{p.looks.length === 1 ? "" : "s"}</span></span>
              </button>
            ))}
          </div>

          {groups.note && <p className="text-[12px] text-muted-foreground">{groups.note}</p>}

          {shortSet && (
            <Alert variant="warning" className="rounded-[12px]" data-testid="short-set-warning">
              <AlertTitle>This set is too short for a long hem</AlertTitle>
              <AlertDescription>
                Its back and side photos stop at the thigh, so a mid-calf or longer hem gets cut short in those views.
                {fullPlate && <div className="mt-2"><Button size="sm" variant="outline" onClick={() => onPick(fullPlate.modelId, fullPlate.poseId)}>Use a full-length set</Button></div>}
              </AlertDescription>
            </Alert>
          )}

          {chosen && (
            chosen.looks.length ? (
              <div>
                <p className="mb-1.5 text-[12px] font-medium text-muted-foreground">{chosen.name}&rsquo;s looks</p>
                <div className="grid grid-cols-3 gap-2 min-[481px]:grid-cols-4">
                  {chosen.looks.map((l) => <LookCard key={l.key} look={l} setup={setup} category={category} hem={hem} onPick={onPick} />)}
                </div>
              </div>
            ) : <p className="rounded-[10px] border border-dashed border-border p-3 text-center text-[13px] text-muted-foreground">{chosen.name} has no looks for this category yet.</p>
          )}

          {groups.other.length > 0 && (
            <div>
              <p className="mb-1.5 text-[12px] font-medium text-muted-foreground">Other models</p>
              <div className="grid grid-cols-3 gap-2 min-[481px]:grid-cols-4">
                {groups.other.map((l) => <LookCard key={l.key} look={l} setup={setup} category={category} hem={hem} onPick={onPick} />)}
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
            <div>
              <p className="text-[12px] font-medium">Fit</p>
              <p className="text-[11px] text-muted-foreground">{auto ? "Auto sets the fit from the style." : setup.fitSource === "style" ? "The reference lends only its pose." : "The reference lends its pose and how its clothes sit."}</p>
            </div>
            <Segmented label="Fit source" disabled={auto} value={setup.fitSource} onChange={onFit}
              options={[{ value: "style" as const, label: core.FIT_SOURCES.style }, { value: "reference" as const, label: core.FIT_SOURCES.reference }]} />
          </div>
        </div>
      ) : null}
    </Section>
  );
}
