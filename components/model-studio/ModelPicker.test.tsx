import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import ModelPicker from "./ModelPicker";
import type { Catalogue, ColorSetup } from "@/lib/model-studio/types";

const catalogue = {
  people: [{ id: "vision", name: "Vision", portrait: "/v.png" }],
  models: [
    { id: "studio 99", name: "Vision 3", person: "vision", userAdded: true, categories: [], poses: [{ id: "studio 99", label: "Front", preview: "/models/studio 99/front.png" }] },
    { id: "studio 111", name: "Vision 15", person: "vision", userAdded: true, fullLength: true, categories: [], poses: [{ id: "studio 111", label: "Front", preview: "/models/studio 111/front.png" }] },
  ],
} as unknown as Catalogue;
const setupOn = (humanModelId: string) => ({ picked: ["f"], garmentSide: "", fullBase: "", humanModelId, poseId: humanModelId, engine: "gpt", fitSource: "style", runKey: "", slots: [], fixNote: "" }) as unknown as ColorSetup;
const show = (humanModelId: string, hem: string, onPick = vi.fn(), category = "top") => {
  render(<ModelPicker catalogue={{ status: "ready", data: catalogue, error: "" } as never} setup={setupOn(humanModelId)} person="vision" personHint={false}
    category={category as never} hem={hem} onPerson={vi.fn()} onPick={onPick} onFit={vi.fn()} onRetry={vi.fn()} />);
  return onPick;
};

describe("ModelPicker long-hem warning", () => {
  afterEach(cleanup);
  it("warns when a long hem is on a head-to-thigh set and offers a full-length one", () => {
    const onPick = show("studio 99", "long");
    expect(screen.getByTestId("short-set-warning")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Use a full-length set" }));
    expect(onPick).toHaveBeenCalledWith("studio 111", "studio 111");
  });
  it("stays quiet on a full-length set, a shorter hem, or Auto", () => {
    show("studio 111", "long");
    show("studio 99", "mid");
    show("auto", "long");
    expect(screen.queryByTestId("short-set-warning")).toBeNull();
  });
  it("stays quiet for bottoms (they use the pants plates)", () => {
    show("studio 99", "long", vi.fn(), "pants");
    expect(screen.queryByTestId("short-set-warning")).toBeNull();
  });
});
