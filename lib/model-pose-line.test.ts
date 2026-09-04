import { describe, expect, it } from "vitest";
import { modelPoseLine } from "./model-pose-line";

describe("modelPoseLine", () => {
  it("prints the shared name once when the pose is named after the model", () => {
    expect(modelPoseLine("Kylie", "Kylie 1")).toEqual({ model: "Kylie", pose: "1", joined: true });
  });

  it("keeps both when the pose has its own name", () => {
    expect(modelPoseLine("Kylie", "Seated three-quarter")).toEqual({
      model: "Kylie",
      pose: "Seated three-quarter",
      joined: false,
    });
  });

  it("drops a pose that repeats the model exactly, or is missing", () => {
    expect(modelPoseLine("Sydney", "Sydney").pose).toBe("");
    expect(modelPoseLine("Sydney", "").pose).toBe("");
  });

  it("survives an empty model without swallowing the pose", () => {
    expect(modelPoseLine("", "Kylie 1")).toEqual({ model: "", pose: "Kylie 1", joined: false });
  });
});
