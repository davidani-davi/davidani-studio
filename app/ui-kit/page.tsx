"use client";

// Internal gallery for the Kobra foundation (redesign Phase 1). Not linked from
// the app; it exists so every shared piece can be checked by eye in one place.

import { useEffect, useState } from "react";
import { Download, Sparkles } from "lucide-react";

import { RenderStatus } from "@/components/kit/RenderStatus";
import type { StudioJobStatus } from "@/components/studio-job-store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Toasts, toast } from "@/components/ui/toast";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

const PHOTO = "/pants-references/DP43109/front.jpg";
const SIM: { at: number; status: StudioJobStatus }[] = [
  { at: 0, status: "queued" },
  { at: 2_000, status: "analyzing" },
  { at: 6_000, status: "generating" },
  { at: 16_000, status: "saving" },
  { at: 18_000, status: "done" },
];

export default function UiKitPage() {
  const [mounted, setMounted] = useState(false);
  const [base, setBase] = useState(0);
  const [run, setRun] = useState<{ startedAt: number; status: StudioJobStatus } | null>(null);
  const [view, setView] = useState<string[]>(["front"]);

  useEffect(() => {
    setMounted(true);
    setBase(Date.now());
  }, []);

  function startRun() {
    const startedAt = Date.now();
    setRun({ startedAt, status: "queued" });
    SIM.slice(1).forEach((s) => window.setTimeout(() => setRun({ startedAt, status: s.status }), s.at));
  }

  return (
    <main className="kobra min-h-dvh">
      <Toasts position="bottom-center" />
      <div className="mx-auto flex max-w-6xl flex-col gap-10 px-5 py-10 max-[480px]:px-4">
        <header className="flex flex-col gap-1">
          <p className="text-xs text-muted-foreground">Studio · UI kit</p>
          <h1 className="text-2xl font-semibold tracking-tight">Kobra foundation</h1>
          <p className="text-sm text-muted-foreground">Shared pieces every studio screen will use.</p>
        </header>

        <section className="flex flex-col gap-4">
          <h2 className="text-sm font-medium">Actions</h2>
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={() => toast({ message: "Render queued", description: "Front view · DP43109", state: "success" })}>
              <Sparkles data-icon="inline-start" aria-hidden />
              Render front
            </Button>
            <Button variant="outline">
              <Download data-icon="inline-start" aria-hidden />
              Download
            </Button>
            <Button variant="secondary">Save draft</Button>
            <Button variant="ghost">Cancel</Button>
            <Button variant="destructive">Delete</Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge>New</Badge>
            <Badge variant="green">Saved</Badge>
            <Badge variant="amber">Slow</Badge>
            <Badge variant="destructive">Failed</Badge>
            <Badge variant="outline">Front</Badge>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Garment</CardTitle>
              <CardDescription>Style code and the view to render.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <Input placeholder="Style code, e.g. DP43109" />
              <Select
                defaultValue="auto"
                items={{ auto: "Model: pick for me", chloe: "Model: Chloe", celine: "Model: Celine" }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Model: pick for me</SelectItem>
                  <SelectItem value="chloe">Model: Chloe</SelectItem>
                  <SelectItem value="celine">Model: Celine</SelectItem>
                </SelectContent>
              </Select>
              <ToggleGroup variant="outline" value={view} onValueChange={(v) => v.length && setView(v as string[])}>
                <ToggleGroupItem value="front">Front</ToggleGroupItem>
                <ToggleGroupItem value="side">Side</ToggleGroupItem>
                <ToggleGroupItem value="back">Back</ToggleGroupItem>
              </ToggleGroup>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Live run</CardTitle>
              <CardDescription>A simulated 18-second render through every step.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <Button onClick={startRun} className="self-start">
                {run && run.status !== "done" ? "Running…" : "Start a run"}
              </Button>
              {run ? (
                <RenderStatus
                  title="Front"
                  status={run.status}
                  startedAt={run.startedAt}
                  estimateMs={18_000}
                  imageUrl={PHOTO}
                  className="max-w-xs"
                />
              ) : null}
            </CardContent>
          </Card>
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="text-sm font-medium">Render status</h2>
          {mounted ? (
            <div className="grid grid-cols-1 gap-4 min-[481px]:grid-cols-2 lg:grid-cols-4">
              <RenderStatus title="Front" status="generating" startedAt={base - 42_000} />
              <RenderStatus title="Side" status="generating" startedAt={base - 100_000} />
              <RenderStatus
                title="Back"
                status="failed"
                startedAt={base - 30_000}
                failedAt="generating"
                error="The image service timed out. Nothing was charged."
                onRetry={() => toast({ message: "Retrying back view", state: "pending" })}
              />
              <RenderStatus title="Front" status="done" startedAt={base - 63_000} imageUrl={PHOTO} />
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}
