"use client";

// #5 Guided intake: the active preset, up to three short questions with quick answers (only for what is missing),
// and the setup as one line. Every full control stays visible below; this never hides or overrides a choice.
import { Button } from "@/components/ui/button";
import { CATALOG_PRESET, type Question } from "@/lib/model-studio/intake";
import type { Person } from "@/lib/model-studio/types";
import { Tag } from "./bits";

export type IntakeAnswer =
  | { id: "front"; url: string }
  | { id: "person"; person: string }
  | { id: "back"; url: string };

export default function IntakeCard({ recipe, questions, people, firstPhoto, secondPhoto, onAnswer, onSkip }: {
  recipe: string;
  questions: Question[];
  people: Person[];
  firstPhoto: string;
  secondPhoto: string;
  onAnswer: (a: IntakeAnswer) => void;
  onSkip: (id: Question["id"]) => void;
}) {
  return (
    <section className="ms-intake rounded-[12px] border border-border bg-card p-3.5" aria-label="Setup summary">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[12px] text-muted-foreground">Preset</span>
        <Tag tone="blue">{CATALOG_PRESET.label}</Tag>
        <span className="text-[12px] text-muted-foreground">fills only blank choices</span>
      </div>
      <p className="mt-2 text-[14px] font-medium tracking-[-0.01em] text-foreground" data-testid="recipe">{recipe}</p>

      {questions.length > 0 && (
        <ol className="mt-3 divide-y divide-border border-t border-border">
          {questions.map((q) => (
            <li key={q.id} className="flex flex-col gap-2 py-2.5 min-[481px]:flex-row min-[481px]:items-center min-[481px]:justify-between">
              <div className="min-w-0">
                <p className="text-[13px] font-medium">{q.ask}</p>
                <p className="text-[12px] text-muted-foreground">{q.why}</p>
              </div>
              <div className="flex shrink-0 flex-wrap gap-1.5">
                {q.id === "front" && (
                  <>
                    <Button size="sm" disabled={!firstPhoto} onClick={() => onAnswer({ id: "front", url: firstPhoto })}>Use the first photo</Button>
                    <Button size="sm" variant="outline" onClick={() => document.getElementById("ms-style")?.scrollIntoView({ behavior: "smooth", block: "start" })}>Pick below</Button>
                  </>
                )}
                {q.id === "person" && (
                  <>
                    {people.map((p) => <Button key={p.id} size="sm" variant="outline" onClick={() => onAnswer({ id: "person", person: p.id })}>{p.name}</Button>)}
                    <Button size="sm" variant="ghost" onClick={() => onSkip("person")}>Auto</Button>
                  </>
                )}
                {q.id === "back" && (
                  <>
                    <Button size="sm" disabled={!secondPhoto} onClick={() => onAnswer({ id: "back", url: secondPhoto })}>Use photo 2</Button>
                    <Button size="sm" variant="ghost" onClick={() => onSkip("back")}>No back photo</Button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
