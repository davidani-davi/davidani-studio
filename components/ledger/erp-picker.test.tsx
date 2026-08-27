import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ErpPicker from "./ErpPicker";
import Composer from "./Composer";
import type { RoutingControls } from "../RoutingPanel";

const CONTROLS: RoutingControls = {
  mode: "single-front",
  view: "front",
  viewSource: "detected",
  viewEditable: true,
  isSet: false,
  disabled: false,
  onViewChange: () => {},
  onSetChange: () => {},
} as RoutingControls;

const BODY = {
  ok: true,
  style: "DWTS67099",
  regularizedFrom: null,
  groups: [
    {
      colorway: "CHARCOAL",
      foreign: false,
      photos: [
        { index: 1, label: "1", thumb: "/api/erp/photo?src=a", full: "https://erp/a.png" },
        { index: 2, label: "2", thumb: "/api/erp/photo?src=b", full: "https://erp/b.png" },
      ],
    },
  ],
};

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(BODY))));
});
afterEach(() => vi.unstubAllGlobals());

describe("per-slot entry point", () => {
  // Front and back are different photos of the same style, chosen separately.
  it("gives each intake slot its own ERP search", () => {
    const onSearchErp = vi.fn();
    render(
      <Composer
        frontIntakeUrl={null}
        backIntakeUrl={null}
        onAddFiles={() => {}}
        onClearIntake={() => {}}
        onSearchErp={onSearchErp}
        styleNumber=""
        onStyleNumberChange={() => {}}
        controls={CONTROLS}
        modelLabel="m"
        onGenerate={() => {}}
        generateLabel="Generate"
        generateDisabled={false}
        busy={false}
        analyzing={false}
        onBatch={() => {}}
        canBatch
        onOpenSetup={() => {}}
        canvasNeedsStyleNumber={false}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /search erp style photos for the back/i }));
    expect(onSearchErp).toHaveBeenCalledWith("back");
    fireEvent.click(screen.getByRole("button", { name: /search erp style photos for the front/i }));
    expect(onSearchErp).toHaveBeenCalledWith("front");
  });
});

describe("ErpPicker", () => {
  function open(over: { initialStyle?: string; onPick?: any } = {}) {
    const onPick = over.onPick ?? vi.fn().mockResolvedValue(undefined);
    render(
      <ErpPicker
        slot="front"
        initialStyle={over.initialStyle ?? ""}
        onPick={onPick}
        onClose={() => {}}
      />
    );
    return { onPick };
  }

  it("searches on open when the composer already knows the style", async () => {
    open({ initialStyle: "DWTS67099" });
    await waitFor(() => expect(screen.getByText("CHARCOAL")).toBeInTheDocument());
    expect(vi.mocked(fetch).mock.calls[0][0]).toBe("/api/erp/photos?style=DWTS67099");
  });

  it("waits to be asked when there is no style yet", () => {
    open();
    expect(fetch).not.toHaveBeenCalled();
    expect(screen.getByText(/search a style number/i)).toBeInTheDocument();
  });

  it("hands back the original, not the thumbnail it displayed", async () => {
    const onPick = vi.fn().mockResolvedValue(undefined);
    open({ initialStyle: "DWTS67099", onPick });
    await waitFor(() => expect(screen.getByText("CHARCOAL")).toBeInTheDocument());
    fireEvent.click(screen.getByAltText(/charcoal frame 2/i).closest("button")!);
    await waitFor(() =>
      expect(onPick).toHaveBeenCalledWith(
        expect.objectContaining({ full: "https://erp/b.png" }),
        "DWTS67099"
      )
    );
  });

  it("says so when the ERP has nothing filed under that style", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ ...BODY, groups: [] }))
    );
    open({ initialStyle: "NOPE1" });
    await waitFor(() =>
      expect(screen.getByText(/has no photos filed under/i)).toBeInTheDocument()
    );
  });

  it("surfaces a failed import instead of closing over it", async () => {
    const onPick = vi.fn().mockRejectedValue(new Error("fal upload failed"));
    open({ initialStyle: "DWTS67099", onPick });
    await waitFor(() => expect(screen.getByText("CHARCOAL")).toBeInTheDocument());
    fireEvent.click(screen.getByAltText(/charcoal frame 1/i).closest("button")!);
    await waitFor(() => expect(screen.getByText("fal upload failed")).toBeInTheDocument());
  });

  it("explains a Plus twin rather than showing an empty gallery", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ ...BODY, style: "DEP42167", regularizedFrom: "PEP42167" }))
    );
    open({ initialStyle: "PEP42167" });
    await waitFor(() =>
      expect(screen.getByText(/PEP42167 is a Plus twin/i)).toBeInTheDocument()
    );
  });
});
