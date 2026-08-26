import { describe, expect, it, vi } from "vitest";
import { render, screen, within, fireEvent } from "@testing-library/react";
import RunLedger from "./RunLedger";
import RunCard from "./RunCard";
import StageView from "./StageView";
import Composer from "./Composer";
import PaneSplitter from "./PaneSplitter";
import { LEDGER_DEFAULT } from "@/lib/pane-size";
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

  // The run in flight is a real row now: it enters history when Generate is
  // pressed, not when both variants land.
  it("reserves a placeholder for every variant still painting", () => {
    render(
      <RunCard
        run={makeRun({ imageUrls: [], pending: { variants: 2, startedAt: Date.now() } })}
        active={false}
        onSelect={() => {}}
      />
    );
    expect(screen.getByText("Painting")).toBeInTheDocument();
    expect(screen.getByLabelText(/variant 1 is being generated/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/variant 2 is being generated/i)).toBeInTheDocument();
  });

  it("shows a landed variant beside its sibling still painting", () => {
    render(
      <RunCard
        run={makeRun({
          imageUrls: ["https://example.test/v1.jpg"],
          pending: { variants: 2, startedAt: Date.now() },
        })}
        active={false}
        onSelect={() => {}}
      />
    );
    expect(screen.getAllByRole("img")).toHaveLength(1);
    expect(screen.getByLabelText(/variant 2 is being generated/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/variant 1 is being generated/i)).not.toBeInTheDocument();
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

  it("paints a generating frame for each variant not yet in hand", () => {
    renderStage({
      run: makeRun({ imageUrls: [], pending: { variants: 2, startedAt: Date.now() } }),
    });
    expect(screen.getByLabelText(/front · variant 1 is being generated/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/front · variant 2 is being generated/i)).toBeInTheDocument();
  });

  // A ~110s wait with no clock reads as a hang.
  it("counts the wait against what this model usually takes", () => {
    renderStage({
      run: makeRun({
        imageUrls: [],
        pending: { variants: 1, startedAt: Date.now(), expectedSeconds: 120 },
      }),
    });
    expect(screen.getByText(/of about 120s/i)).toBeInTheDocument();
  });

  it("says so when a run has gone past its usual time", () => {
    renderStage({
      run: makeRun({
        imageUrls: [],
        pending: { variants: 1, startedAt: Date.now() - 200_000, expectedSeconds: 120 },
      }),
    });
    expect(screen.getByText(/longer than usual/i)).toBeInTheDocument();
  });

  it("puts a download under each render, naming it by its own slot", () => {
    const onDownload = vi.fn();
    renderStage({ onDownload });
    const buttons = screen.getAllByRole("button", { name: /download/i });
    expect(buttons).toHaveLength(2);
    fireEvent.click(buttons[1]);
    expect(onDownload).toHaveBeenCalledWith("https://example.test/v2.jpg", 1);
  });

  // Soloed, `visible` is one long, so exporting by position named variant 2
  // "...-1" — the wrong file under the right name.
  it("exports a soloed variant under its own number", () => {
    const onDownload = vi.fn();
    renderStage({ onDownload });
    fireEvent.click(screen.getByAltText(/variant 2/i).closest("button")!);
    fireEvent.click(screen.getByRole("button", { name: /^export$/i }));
    expect(onDownload).toHaveBeenCalledWith("https://example.test/v2.jpg", 1);
  });

  it("offers no download on an intake photo, which is not an export", () => {
    renderStage({ run: makeRun({ sourceImageUrls: ["in.jpg"] }) });
    fireEvent.click(screen.getByAltText(/front intake photo/i).closest("button")!);
    expect(screen.queryByRole("button", { name: /download/i })).not.toBeInTheDocument();
  });

  it("shows the photos that went in beside the ones that came out", () => {
    renderStage({ run: makeRun({ sourceImageUrls: ["in-front.jpg", "in-back.jpg"] }) });
    expect(screen.getByAltText(/front intake photo/i)).toBeInTheDocument();
    expect(screen.getByAltText(/back intake photo/i)).toBeInTheDocument();
  });

  // Opening a photo used to be reversible only by clicking it again or
  // pressing Escape. Neither is visible, so the stage read as a dead end.
  it("draws the way back out of an opened intake photo", () => {
    renderStage({ run: makeRun({ sourceImageUrls: ["in-front.jpg"] }) });
    expect(screen.queryByRole("button", { name: /back to/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByAltText(/front intake photo/i).closest("button")!);
    fireEvent.click(screen.getByRole("button", { name: /back to the renders/i }));
    expect(screen.getByAltText(/variant 1/i)).toBeInTheDocument();
  });

  it("draws the way back out of a soloed variant too", () => {
    renderStage();
    fireEvent.click(screen.getByAltText(/variant 2/i).closest("button")!);
    fireEvent.click(screen.getByRole("button", { name: /back to both variants/i }));
    expect(screen.getByAltText(/variant 1/i)).toBeInTheDocument();
  });

  it("opens an intake photo at stage size and gives it back", () => {
    renderStage({ run: makeRun({ sourceImageUrls: ["in-front.jpg"] }) });
    const thumb = screen.getByAltText(/front intake photo/i).closest("button")!;
    fireEvent.click(thumb);
    // Stage-size copy plus the rail thumb, and the renders have stood down.
    expect(screen.getAllByAltText(/front intake photo/i)).toHaveLength(2);
    expect(screen.queryByAltText(/variant 1/i)).not.toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.getByAltText(/variant 1/i)).toBeInTheDocument();
  });

  it("shows no rail for a run that recorded no uploads", () => {
    renderStage({ run: makeRun({ sourceImageUrls: [] }) });
    expect(screen.queryByRole("region", { name: /intake photos/i })).not.toBeInTheDocument();
  });

  // The contract run's back render is chained behind the front, so before the
  // slot clock it inherited the front's wait and cried "longer than usual"
  // seconds after its own call went out.
  it("counts a chained back render from when its own call went out", () => {
    renderStage({
      run: makeRun({
        imageUrls: ["front.jpg"],
        viewLabels: ["Front", "Back"],
        pending: {
          variants: 2,
          startedAt: Date.now() - 200_000,
          expectedSeconds: 240,
          slots: [null, { startedAt: Date.now() - 10_000, expectedSeconds: 120 }],
        },
      }),
    });
    expect(screen.getByText(/10s of about 120s/i)).toBeInTheDocument();
    expect(screen.queryByText(/longer than usual/i)).not.toBeInTheDocument();
  });

  it("keeps a landed variant on the stage while its sibling paints", () => {
    renderStage({
      run: makeRun({
        imageUrls: ["https://example.test/v1.jpg"],
        pending: { variants: 2, startedAt: Date.now() },
      }),
    });
    expect(screen.getByText("Front · Variant 1")).toBeInTheDocument();
    expect(screen.getByLabelText(/front · variant 2 is being generated/i)).toBeInTheDocument();
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
        onSearchErp={() => {}}
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

describe("PaneSplitter", () => {
  function renderSplitter(over: { width?: number } = {}) {
    const onWidth = vi.fn();
    const onCommit = vi.fn();
    render(
      <div>
        <PaneSplitter width={over.width ?? 428} onWidth={onWidth} onCommit={onCommit} />
      </div>
    );
    return { onWidth, onCommit, handle: screen.getByRole("separator", { name: /resize/i }) };
  }

  it("is a real separator, not a mouse-only affordance", () => {
    const { handle, onWidth, onCommit } = renderSplitter();
    expect(handle).toHaveAttribute("aria-orientation", "vertical");
    expect(handle).toHaveAttribute("aria-valuenow", "428");
    fireEvent.keyDown(handle, { key: "ArrowRight" });
    expect(onWidth).toHaveBeenCalledWith(444);
    // Committed per keystroke, so a keyboard resize persists like a drag does.
    expect(onCommit).toHaveBeenCalledWith(444);
  });

  it("takes a bigger step with shift", () => {
    const { handle, onWidth } = renderSplitter();
    fireEvent.keyDown(handle, { key: "ArrowLeft", shiftKey: true });
    expect(onWidth).toHaveBeenCalledWith(428 - 64);
  });

  it("will not let the ledger past its bounds", () => {
    const { handle, onWidth } = renderSplitter({ width: 336 });
    fireEvent.keyDown(handle, { key: "ArrowLeft" });
    expect(onWidth).toHaveBeenCalledWith(336);
  });

  it("resets on Home and on a double click", () => {
    const { handle, onCommit } = renderSplitter({ width: 600 });
    fireEvent.keyDown(handle, { key: "Home" });
    expect(onCommit).toHaveBeenCalledWith(LEDGER_DEFAULT);
    fireEvent.doubleClick(handle);
    expect(onCommit).toHaveBeenLastCalledWith(LEDGER_DEFAULT);
  });

  it("follows the pointer and commits once, at the end", () => {
    const { handle, onWidth, onCommit } = renderSplitter();
    fireEvent.pointerDown(handle, { pointerId: 1 });
    expect(document.body.style.userSelect).toBe("none");
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 520 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 560 });
    expect(onWidth).toHaveBeenLastCalledWith(560);
    // Not once per pixel — persistence is written when the drag ends.
    expect(onCommit).not.toHaveBeenCalled();
    fireEvent.pointerUp(handle, { pointerId: 1 });
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith(560);
    expect(document.body.style.userSelect).toBe("");
  });

  it("does nothing on a pointer move that is not part of a drag", () => {
    const { handle, onWidth } = renderSplitter();
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 800 });
    expect(onWidth).not.toHaveBeenCalled();
  });

  it("ignores keys that are not a resize", () => {
    const { handle, onWidth } = renderSplitter();
    fireEvent.keyDown(handle, { key: "a" });
    expect(onWidth).not.toHaveBeenCalled();
  });
});

describe("composer dock", () => {
  function renderLedger(runs: HistoryItem[]) {
    return render(
      <RunLedger
        runs={runs}
        currentId={runs[0]?.id ?? null}
        filter="all"
        onFilterChange={() => {}}
        onSelect={() => {}}
        onClearHistory={() => {}}
        composer={<button type="button">Generate</button>}
      />
    );
  }

  /** jsdom lays nothing out, so the feed's scroll metrics are stubbed. */
  function scrollFeed(feed: HTMLElement, to: number, overflow = 2000) {
    Object.defineProperty(feed, "scrollHeight", { value: overflow + 500, configurable: true });
    Object.defineProperty(feed, "clientHeight", { value: 500, configurable: true });
    feed.scrollTop = to;
    fireEvent.scroll(feed);
  }

  function parts() {
    const dock = screen.getByText("Generate").parentElement!;
    // By text, not by role: while the composer is up the reveal is
    // aria-hidden, which is the point — it is not in the accessibility tree.
    const reveal = screen.getByText("New run").closest("button")!;
    return { dock, reveal };
  }

  it("ducks the composer away as the ledger scrolls back, and offers it back", () => {
    const { container } = renderLedger([makeRun()]);
    const feed = container.querySelector(".overflow-y-auto") as HTMLElement;
    expect(parts().dock).toHaveClass("translate-y-0");

    scrollFeed(feed, 400);
    expect(parts().dock).toHaveClass("translate-y-full");
    expect(parts().reveal).toHaveClass("opacity-100");

    fireEvent.click(parts().reveal);
    expect(parts().dock).toHaveClass("translate-y-0");
  });

  it("does not duck away from a feed that only overflows by its own padding", () => {
    const { container } = renderLedger([makeRun()]);
    const feed = container.querySelector(".overflow-y-auto") as HTMLElement;
    // Everything that can be scrolled is the space reserved for the composer.
    scrollFeed(feed, 40, 8);
    expect(parts().dock).toHaveClass("translate-y-0");
  });

  it("brings it back on a scroll up", () => {
    const { container } = renderLedger([makeRun()]);
    const feed = container.querySelector(".overflow-y-auto") as HTMLElement;
    scrollFeed(feed, 400);
    scrollFeed(feed, 300);
    expect(parts().dock).toHaveClass("translate-y-0");
  });

  // Tabbing into a control that is off the bottom of the column is the one way
  // this could strand someone.
  it("brings it back when something inside it takes focus", () => {
    const { container } = renderLedger([makeRun()]);
    const feed = container.querySelector(".overflow-y-auto") as HTMLElement;
    scrollFeed(feed, 400);
    fireEvent.focus(screen.getByRole("button", { name: "Generate" }));
    expect(parts().dock).toHaveClass("translate-y-0");
  });

  it("keeps the reveal out of the tab order while the composer is up", () => {
    renderLedger([makeRun()]);
    expect(parts().reveal).toHaveAttribute("tabindex", "-1");
    expect(parts().reveal).toHaveAttribute("aria-hidden", "true");
  });
});
