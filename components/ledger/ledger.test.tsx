import { describe, expect, it, vi } from "vitest";
import { render, screen, within, fireEvent } from "@testing-library/react";
import RunLedger from "./RunLedger";
import RunCard from "./RunCard";
import StageView from "./StageView";
import Composer from "./Composer";
import type { HistoryItem } from "../types";
import type { RoutingControls } from "../RoutingPanel";

/**
 * The Split Ledger shell, rendered.
 *
 * These are not snapshot tests. Each one asserts a claim the shell makes about
 * itself — that both variants of a run stay visible, that the pick reads
 * without a label, that a run routed to the sweep for want of a style number
 * says so where the style-number field is.
 */

const APPROVED = {
  path: "/product-shots/canvas-outerwear-front.png",
  isFallback: false,
  category: "outerwear" as const,
};
const INFERRED_SWEEP = {
  path: "/product-shots/studio-backdrop-empty.png",
  isFallback: true,
  category: "top" as const,
  fallbackReason: "category-inferred" as const,
};

function makeRun(over: Partial<HistoryItem> = {}): HistoryItem {
  return {
    id: "a503beef",
    timestamp: Date.UTC(2026, 7, 26, 13, 15),
    modelId: "gpt-image",
    prompt:
      "Catalog garment-swap edit. Replace the garment currently shown in the primary studio " +
      "photograph with a different garment: a camo yoke cotton shacket. The replacement...",
    imageUrls: ["https://example.test/v1.jpg", "https://example.test/v2.jpg"],
    referenceUrls: [],
    aspect: "4:5",
    resolution: "4K",
    viewLabels: ["Front · Variant 1", "Front · Variant 2"],
    routingCanvas: APPROVED,
    backgroundSnaps: [
      { applied: true, coverage: 0.7, sampled: { r: 0xed, g: 0xee, b: 0xee } },
      { applied: true, coverage: 0.7, sampled: { r: 0xed, g: 0xee, b: 0xee } },
    ],
    abTest: { version: "2.3" },
    ...over,
  };
}

const CONTROLS: RoutingControls = {
  mode: "single-front",
  view: "front",
  viewSource: "detected",
  viewEditable: true,
  onViewChange: () => {},
  isSet: false,
  onSetChange: () => {},
};

function renderLedger(runs: HistoryItem[], over: Partial<Parameters<typeof RunLedger>[0]> = {}) {
  const onSelect = vi.fn();
  const utils = render(
    <RunLedger
      runs={runs}
      currentId={runs[0]?.id ?? null}
      filter="all"
      onFilterChange={() => {}}
      onSelect={onSelect}
      onClearHistory={() => {}}
      composer={<div>composer</div>}
      {...over}
    />
  );
  return { ...utils, onSelect };
}

describe("run card", () => {
  it("keeps both takes visible, because the reason to look back is the one you didn't keep", () => {
    render(<RunCard run={makeRun()} active={false} onSelect={() => {}} />);
    expect(screen.getAllByRole("img")).toHaveLength(2);
  });

  it("names the run from the garment the analyzer described", () => {
    render(<RunCard run={makeRun()} active={false} onSelect={() => {}} />);
    expect(screen.getByText("A camo yoke cotton shacket")).toBeInTheDocument();
  });

  it("says a style number is missing rather than leaving the line blank", () => {
    render(<RunCard run={makeRun()} active={false} onSelect={() => {}} />);
    expect(screen.getByText("No style number")).toBeInTheDocument();
  });

  it("prints the four pipeline steps under every run", () => {
    render(<RunCard run={makeRun()} active={false} onSelect={() => {}} />);
    for (const label of ["Intake", "Front", "outerwear-front", "Clean"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  // A badge on every card is not a signal. It also collided with the backdrop
  // step's own "Clean" in the strip below — same word, two meanings, one card.
  it("wears no verdict chip when there is nothing to say about the run", () => {
    render(<RunCard run={makeRun()} active={false} onSelect={() => {}} />);
    expect(screen.getAllByText("Clean")).toHaveLength(1);
  });

  it("flags a run whose canvas came from the photo alone", () => {
    render(
      <RunCard run={makeRun({ routingCanvas: INFERRED_SWEEP })} active={false} onSelect={() => {}} />
    );
    expect(screen.getByText("Check")).toBeInTheDocument();
    expect(screen.getByText("Empty sweep")).toBeInTheDocument();
  });

  it("marks the kept take without needing a caption for it", () => {
    render(
      <RunCard
        run={makeRun({ abTest: { version: "2.3", selectedImage: "right" } })}
        active={false}
        onSelect={() => {}}
      />
    );
    expect(screen.getByText("Kept · V2")).toBeInTheDocument();
    const [first, second] = screen.getAllByRole("img").map((img) => img.parentElement!);
    expect(second.className).toContain("ring-1");
    expect(first.className).toContain("opacity-50");
  });

  it("does not crash on a run that produced no images", () => {
    render(<RunCard run={makeRun({ imageUrls: [] })} active={false} onSelect={() => {}} />);
    expect(screen.queryAllByRole("img")).toHaveLength(0);
  });
});

describe("ledger", () => {
  it("counts the runs worth a second look on the filter itself", () => {
    renderLedger([
      makeRun({ id: "one", routingCanvas: INFERRED_SWEEP }),
      makeRun({ id: "two", routingCanvas: INFERRED_SWEEP }),
      makeRun({ id: "three" }),
    ]);
    // beUI Tabs — role is tab, not radio.
    const check = screen.getByRole("tab", { name: /check/i });
    expect(within(check).getByText("2")).toBeInTheDocument();
  });

  it("selects a run when its card is pressed", () => {
    const { onSelect } = renderLedger([makeRun({ id: "abcd1234" })]);
    fireEvent.click(screen.getByRole("button", { name: /camo yoke/i }));
    expect(onSelect).toHaveBeenCalledWith("abcd1234");
  });

  it("says why the list is empty rather than showing a bare panel", () => {
    renderLedger([]);
    expect(screen.getByText(/no runs yet/i)).toBeInTheDocument();
  });

  // An empty Check list is good news and should read as good news.
  it("reports a clean check filter as an achievement, not an absence", () => {
    renderLedger([makeRun()], { filter: "check" });
    expect(screen.getByText(/nothing is flagged/i)).toBeInTheDocument();
  });
});

describe("stage", () => {
  function renderStage(over: Partial<Parameters<typeof StageView>[0]> = {}) {
    const onKeep = vi.fn();
    const onDownload = vi.fn();
    const utils = render(
      <StageView
        run={makeRun()}
        onKeep={onKeep}
        onDownload={onDownload}
        onOpenDetails={() => {}}
        {...over}
      />
    );
    return { ...utils, onKeep, onDownload };
  }

  it("shows both variants side by side by default", () => {
    renderStage();
    expect(screen.getByText("Front · Variant 1")).toBeInTheDocument();
    expect(screen.getByText("Front · Variant 2")).toBeInTheDocument();
  });

  // The picture is the control. This replaced a Compare/Solo pair plus a 1/2
  // slot picker — four buttons above the images to say which image to look at.
  it("fills the stage with a variant when that variant is pressed", () => {
    renderStage();
    fireEvent.click(screen.getByRole("button", { name: /variant 2/i }));
    expect(screen.getByText("Front · Variant 2")).toBeInTheDocument();
    expect(screen.queryByText("Front · Variant 1")).not.toBeInTheDocument();
  });

  it("brings both variants back when the soloed one is pressed again", () => {
    renderStage();
    fireEvent.click(screen.getByRole("button", { name: /variant 1/i }));
    expect(screen.queryByText("Front · Variant 2")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /variant 1/i }));
    expect(screen.getByText("Front · Variant 2")).toBeInTheDocument();
  });

  it("leaves solo on Escape", () => {
    renderStage();
    fireEvent.click(screen.getByRole("button", { name: /variant 2/i }));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.getByText("Front · Variant 1")).toBeInTheDocument();
  });

  it("carries no mode switcher in the header at all", () => {
    renderStage();
    expect(screen.queryByRole("radiogroup", { name: /stage mode/i })).not.toBeInTheDocument();
  });

  it("keeps a variant from its button", () => {
    const { onKeep } = renderStage();
    fireEvent.click(screen.getAllByRole("button", { name: /^keep/i })[1]);
    expect(onKeep).toHaveBeenCalledWith("right");
  });

  it("keeps a variant from the 1 and 2 keys", () => {
    const { onKeep } = renderStage();
    fireEvent.keyDown(window, { key: "2" });
    expect(onKeep).toHaveBeenCalledWith("right");
  });

  // The composer's style-number field is one tab away and accepts digits.
  it("ignores the keep hotkeys while the operator is typing", () => {
    const { onKeep } = renderStage();
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();
    fireEvent.keyDown(input, { key: "1" });
    expect(onKeep).not.toHaveBeenCalled();
    input.remove();
  });

  it("tells a new operator what to do instead of showing an empty frame", () => {
    render(
      <StageView run={null} onDownload={() => {}} onOpenDetails={() => {}} />
    );
    expect(screen.getByText(/press generate/i)).toBeInTheDocument();
  });

  it("offers no Keep on a run that was never a two-up take", () => {
    renderStage({ run: makeRun({ abTest: undefined }) });
    expect(screen.queryByRole("button", { name: /^keep/i })).not.toBeInTheDocument();
  });
});

describe("composer", () => {
  function renderComposer(over: Partial<Parameters<typeof Composer>[0]> = {}) {
    const onGenerate = vi.fn();
    const onAddFiles = vi.fn();
    const onFlipView = vi.fn();
    const utils = render(
      <Composer
        frontIntakeUrl={null}
        backIntakeUrl={null}
        onAddFiles={onAddFiles}
        onClearIntake={() => {}}
        styleNumber=""
        onStyleNumberChange={() => {}}
        controls={{ ...CONTROLS, onViewChange: onFlipView }}
        modelLabel="GPT Image 2 · 2160×2700 · JPEG"
        onGenerate={onGenerate}
        generateLabel="Generate front"
        generateDisabled={false}
        busy={false}
        analyzing={false}
        onBatch={() => {}}
        canBatch={false}
        onOpenSetup={() => {}}
        canvasNeedsStyleNumber={false}
        {...over}
      />
    );
    return { ...utils, onGenerate, onAddFiles, onFlipView };
  }

  it("puts the warning about an inferred canvas next to the field that fixes it", () => {
    renderComposer({ canvasNeedsStyleNumber: true });
    const warning = screen.getByText(/category read from the photo alone/i);
    expect(warning).toBeInTheDocument();
    expect(screen.getByLabelText(/style number/i)).toBeInTheDocument();
    // Same block, so the fix is not somewhere else on the screen.
    expect(warning.parentElement).toContainElement(screen.getByLabelText(/style number/i));
  });

  it("does not nag when the canvas was properly backed", () => {
    renderComposer();
    expect(screen.queryByText(/category read from the photo alone/i)).not.toBeInTheDocument();
  });

  it("collapses the side control into one label for a contract run", () => {
    renderComposer({ controls: { ...CONTROLS, mode: "front-back-contract", viewSource: "contract" } });
    expect(screen.getByText("Front + back")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /product shot side/i })).not.toBeInTheDocument();
  });

  // Two binary choices used to be four permanently-lit pills.
  it("states the side and the garment mode as one control each", () => {
    const { onFlipView } = renderComposer();
    const side = screen.getByRole("button", { name: /product shot side: front/i });
    fireEvent.click(side);
    expect(onFlipView).toHaveBeenCalledWith("back");
    expect(screen.getByRole("button", { name: /garment mode: single garment/i })).toBeInTheDocument();
  });

  it("locks the side control when the run has no side to choose", () => {
    renderComposer({ controls: { ...CONTROLS, viewEditable: false } });
    expect(screen.getByRole("button", { name: /product shot side/i })).toBeDisabled();
  });

  it("will not generate while a run is in flight", () => {
    const { onGenerate } = renderComposer({ busy: true });
    const button = screen.getByRole("button", { name: /generating/i });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(onGenerate).not.toHaveBeenCalled();
  });

  it("says where the side came from", () => {
    renderComposer();
    expect(screen.getByText(/read from your photo/i)).toBeInTheDocument();
  });
});
