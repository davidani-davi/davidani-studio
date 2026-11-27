import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import HistoryStrip from "./HistoryStrip";
import FloatComposer from "./FloatComposer";
import StageView from "./StageView";
import type { HistoryItem } from "../types";
import type { RoutingControls } from "../RoutingPanel";

function run(over: Partial<HistoryItem> = {}): HistoryItem {
  return {
    id: "a503beef",
    timestamp: Date.UTC(2026, 10, 24, 20, 15),
    modelId: "gpt-image",
    prompt: "Catalog flat lay.",
    styleName: "Camo yoke shacket",
    styleNumber: "DJ52056",
    imageUrls: ["https://example.test/v1.jpg", "https://example.test/v2.jpg"],
    referenceUrls: [],
    sourceImageUrls: ["https://example.test/front.jpg"],
    aspect: "4:5",
    resolution: "4K",
    abTest: { version: "2.3" },
    ...over,
  } as HistoryItem;
}

const CONTROLS = {
  mode: "single-front",
  view: "front",
  viewSource: "detected",
  viewEditable: true,
  isSet: false,
  disabled: false,
  onViewChange: () => {},
  onSetChange: () => {},
} as unknown as RoutingControls;

describe("HistoryStrip", () => {
  it("shows one thumbnail per run and selects on click", () => {
    const onSelect = vi.fn();
    const runs = [run(), run({ id: "b1", abTest: { version: "2.3", selectedImage: "right" } })];
    render(
      <HistoryStrip runs={runs} currentId="b1" filter="all" onFilterChange={() => {}} onSelect={onSelect} onNewRun={() => {}} />,
    );
    const kept = screen.getByRole("button", { name: /Kept · V2/ });
    expect(kept.getAttribute("aria-current")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: /Camo yoke shacket, Clean/ }));
    expect(onSelect).toHaveBeenCalledWith(runs[0]);
    expect(screen.getByRole("button", { name: "New run" })).toBeTruthy();
  });

  it("offers the check filter only when a run needs a look", () => {
    const onFilter = vi.fn();
    const flagged = run({ routingCanvas: { fallbackReason: "category-inferred" } as HistoryItem["routingCanvas"] });
    const { rerender } = render(
      <HistoryStrip runs={[run()]} filter="all" onFilterChange={onFilter} onSelect={() => {}} />,
    );
    expect(screen.queryByRole("button", { name: /check/ })).toBeNull();
    rerender(<HistoryStrip runs={[run(), flagged]} filter="all" onFilterChange={onFilter} onSelect={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "1 check" }));
    expect(onFilter).toHaveBeenCalledWith("check");
  });
});

describe("FloatComposer", () => {
  function setup(over: Partial<Parameters<typeof FloatComposer>[0]> = {}) {
    const onGenerate = vi.fn();
    const onOpenSetup = vi.fn();
    render(
      <FloatComposer
        frontIntakeUrl={null}
        backIntakeUrl={null}
        onAddFiles={() => {}}
        onClearIntake={() => {}}
        styleNumber=""
        onStyleNumberChange={() => {}}
        controls={CONTROLS}
        modelLabel="GPT Image · 2160×2700"
        onGenerate={onGenerate}
        generateLabel="Generate"
        generateDisabled={false}
        busy={false}
        analyzing={false}
        onBatch={() => {}}
        canBatch={false}
        onOpenSetup={onOpenSetup}
        onSearchErp={() => {}}
        canvasNeedsStyleNumber={false}
        {...over}
      />,
    );
    return { onGenerate, onOpenSetup };
  }

  it("keeps Generate and the style number on the bar", () => {
    const { onGenerate } = setup();
    expect(screen.getByRole("textbox", { name: "Style number" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Generate/ }));
    expect(onGenerate).toHaveBeenCalled();
  });

  it("opens the options upward, with Setup inside", () => {
    const { onOpenSetup } = setup();
    const toggle = screen.getByRole("button", { name: "Options" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(toggle);
    expect(screen.getByRole("button", { name: "Close options" }).getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: /Setup/ }));
    expect(onOpenSetup).toHaveBeenCalled();
  });

  it("says when the run will go to the empty sweep", () => {
    setup({ canvasNeedsStyleNumber: true });
    expect(screen.getByText(/goes to the empty sweep/)).toBeTruthy();
  });
});

describe("StageView canvas mode", () => {
  it("shows intake as chips instead of the rail", () => {
    render(<StageView run={run()} onDownload={() => {}} onOpenDetails={() => {}} canvas />);
    expect(screen.getByRole("region", { name: "Intake photos" }).className).toContain("stage-canvas__intake");
    expect(screen.getAllByRole("region", { name: "Intake photos" })).toHaveLength(1);
  });
});
