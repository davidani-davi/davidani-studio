"use client";

// The one render-status card every studio tool shows while an image is made
// (redesign Phase 1). The canvas forms while the job runs and the photo fades in
// when it lands; the steps and the headline say where the run is and how long it
// usually takes; a failure says why and offers Retry. Driven only by the job
// store's status and start time, so no API changes.
//
// Kobra look: render it inside a `.kobra` screen.

import { useEffect, useState } from "react";
import { AlertCircle, Check, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ImageGeneration } from "@/components/ui/image-generation";
import { Progress } from "@/components/ui/progress";
import { Spinner } from "@/components/ui/spinner";
import type { StudioJobStatus } from "@/components/studio-job-store";
import { describeRender, type RenderStepKey, type RenderStepState } from "@/lib/render-status";
import { cn } from "@/lib/utils";

export interface RenderStatusProps {
  status: StudioJobStatus;
  startedAt: number;
  /** Usual run time for this tool, for "usually about 1:00". */
  estimateMs?: number;
  /** Which view this is, e.g. "Front" or "Back". */
  title?: string;
  /** Output size shown on the canvas while it forms, e.g. "1024 × 1536". */
  resolution?: string;
  imageUrl?: string;
  error?: string;
  failedAt?: RenderStepKey;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
}

export function RenderStatus({
  status,
  startedAt,
  estimateMs,
  title,
  resolution = "1024 × 1536",
  imageUrl,
  error,
  failedAt,
  onRetry,
  retryLabel = "Retry",
  className,
}: RenderStatusProps) {
  const now = useClock(status !== "done" && status !== "failed");
  const view = describeRender({ status, startedAt, now, estimateMs, failedAt });
  const current = view.steps.find((s) => s.state === "current");

  return (
    <section
      data-slot="render-status"
      aria-live="polite"
      className={cn(
        "flex flex-col overflow-hidden rounded-xl bg-card shadow-[0_0_0_1px_rgb(0_0_0/.06),0_1px_1px_rgb(0_0_0/.03),0_2px_4px_-1px_rgb(0_0_0/.03),0_8px_16px_-8px_rgb(0_0_0/.06)]",
        className,
      )}
    >
      <div className="p-3 pb-0">
        {status === "failed" ? (
          <div
            style={{ aspectRatio: aspect(resolution) }}
            className="flex w-full flex-col items-center justify-center gap-3 rounded-lg bg-[#feebe9] px-6 text-center"
          >
            <AlertCircle className="size-6 text-destructive" aria-hidden />
            <p className="text-sm text-[#8f1418]">{error || "This render stopped before it finished."}</p>
            {onRetry ? (
              <Button variant="outline" size="sm" onClick={onRetry}>
                <RotateCcw data-icon="inline-start" aria-hidden />
                {retryLabel}
              </Button>
            ) : null}
          </div>
        ) : (
          <ImageGeneration
            className="max-w-none rounded-lg"
            src={status === "done" ? imageUrl : undefined}
            alt={title ? `${title} view` : "Rendered image"}
            resolution={resolution}
            progress={view.progress}
            step={current?.label}
          />
        )}
      </div>

      <div className="@container flex flex-col gap-3 p-4">
        <div className="flex flex-col gap-0.5">
          {title ? <h3 className="text-sm font-medium text-foreground">{title}</h3> : null}
          <p
            className={cn(
              "text-[13px] tabular-nums",
              status === "failed" ? "text-destructive" : view.slow ? "text-[#8a5a12]" : "text-muted-foreground",
            )}
          >
            {view.headline}
          </p>
        </div>

        {view.running ? <Progress value={Math.round(view.progress)} aria-label="Render progress" /> : null}

        <ol className="grid grid-cols-2 gap-x-3 gap-y-1.5 @[22rem]:grid-cols-4">
          {view.steps.map((step) => (
            <li key={step.key} className="flex min-w-0 items-center gap-1.5 text-xs">
              <StepMark state={step.state} />
              <span
                className={cn(
                  "truncate",
                  step.state === "todo" ? "text-muted-foreground/70" : "text-foreground",
                  step.state === "failed" && "text-destructive",
                )}
              >
                {step.label}
              </span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function StepMark({ state }: { state: RenderStepState }) {
  if (state === "current") return <Spinner className="size-3.5 shrink-0 text-foreground" aria-hidden />;
  if (state === "done")
    return (
      <span className="grid size-3.5 shrink-0 place-items-center rounded-full bg-foreground text-background">
        <Check className="size-2.5" strokeWidth={3} aria-hidden />
      </span>
    );
  if (state === "failed")
    return (
      <span className="grid size-3.5 shrink-0 place-items-center rounded-full bg-destructive text-white">
        <AlertCircle className="size-2.5" strokeWidth={3} aria-hidden />
      </span>
    );
  return <span className="size-3.5 shrink-0 rounded-full border border-border" aria-hidden />;
}

function useClock(running: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    setNow(Date.now());
    if (!running) return;
    const t = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(t);
  }, [running]);
  return now;
}

function aspect(resolution: string) {
  const m = /(\d+)\s*[×x]\s*(\d+)/i.exec(resolution);
  return m ? Number(m[1]) / Number(m[2]) : 2 / 3;
}
