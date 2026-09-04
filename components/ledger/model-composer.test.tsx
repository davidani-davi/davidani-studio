import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ModelComposer from "./ModelComposer";
import { modelComposerSlots } from "@/lib/model-composer-slots";

/**
 * Model Studio's composer, rendered.
 *
 * Each test is a claim the bar makes: that it shows the run's model and pose
 * without being asked, that Multi Model Studio offers no view to choose
 * because its run is all four, and that the one blocker an operator cannot see
 * from the tiles — no human model — is stated rather than left to a disabled
 * button.
 */

const BASE = {
  slots: modelComposerSlots(["/garment.jpg"], false, "two-images" as const),
  onAddFiles: vi.fn(),
  onClearSlot: vi.fn(),
  onSearchErp: vi.fn(),
  styleNumber: "DWJ62218",
  onStyleNumberChange: vi.fn(),
  modelName: "Bianca",
  poseName: "Bianca 1",
  view: "front" as const,
  onViewChange: vi.fn(),
  multiView: false,
  isSet: false,
  onSetChange: vi.fn(),
  setNote: "",
  modelLabel: "Nano Banana 2 · 4K · 2:3",
  onGenerate: vi.fn(),
  generateLabel: "Generate",
  generateDisabled: false,
  busy: false,
  analyzing: false,
  canBatch: false,
  onOpenSetup: vi.fn(),
  needsModel: false,
};

describe("ModelComposer", () => {
  it("prints who is wearing it and in what pose, without saying the name twice", () => {
    const { rerender } = render(<ModelComposer {...BASE} />);
    expect(screen.getByText("Bianca")).toBeTruthy();
    expect(screen.getByText("1")).toBeTruthy();
    expect(screen.queryByText("Bianca 1")).toBeNull();
    // a pose with its own name is printed in full
    rerender(<ModelComposer {...BASE} poseName="Seated three-quarter" />);
    expect(screen.getByText("Seated three-quarter")).toBeTruthy();
  });

  it("shows one tile for a garment and two named tiles for a two-photo set", () => {
    const { rerender } = render(<ModelComposer {...BASE} />);
    expect(screen.getByText("Garment *")).toBeTruthy();
    rerender(
      <ModelComposer
        {...BASE}
        isSet
        slots={modelComposerSlots(["/top.jpg", "/bottom.jpg"], true, "two-images")}
      />
    );
    expect(screen.getByText("Top *")).toBeTruthy();
    expect(screen.getByText("Bottom *")).toBeTruthy();
  });

  it("lets the operator choose the view — unless the run is all four", () => {
    const onViewChange = vi.fn();
    const { rerender } = render(<ModelComposer {...BASE} onViewChange={onViewChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(onViewChange).toHaveBeenCalledWith("back");

    rerender(<ModelComposer {...BASE} multiView generateLabel="Generate 4 views" />);
    expect(screen.queryByRole("button", { name: "Back" })).toBeNull();
    expect(screen.getByText(/all four in one run/i)).toBeTruthy();
  });

  it("says a run has nobody to dress rather than only greying out Generate", () => {
    render(<ModelComposer {...BASE} needsModel modelName="No model" />);
    expect(screen.getByText(/pick one in Setup/i)).toBeTruthy();
  });

  it("offers Batch only when the studio has one", () => {
    const { rerender } = render(<ModelComposer {...BASE} onBatch={vi.fn()} canBatch />);
    expect(screen.getByRole("button", { name: "Batch" })).toBeTruthy();
    rerender(<ModelComposer {...BASE} multiView />);
    expect(screen.queryByRole("button", { name: "Batch" })).toBeNull();
  });

  it("sends the ERP search the tile it was pressed on", () => {
    const onSearchErp = vi.fn();
    render(
      <ModelComposer
        {...BASE}
        isSet
        slots={modelComposerSlots(["/top.jpg", "/bottom.jpg"], true, "two-images")}
        onSearchErp={onSearchErp}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /Search ERP style photos for the bottom/i }));
    expect(onSearchErp).toHaveBeenCalledWith(1);
  });
});
