import { describe, expect, it } from "vitest";
import {
  clampLedgerWidth,
  readLedgerWidth,
  LEDGER_DEFAULT,
  LEDGER_MAX,
  LEDGER_MIN,
} from "./pane-size";

describe("ledger width", () => {
  it("passes an ordinary drag straight through", () => {
    expect(clampLedgerWidth(500, 1440)).toBe(500);
  });

  it("holds the bounds at both ends", () => {
    expect(clampLedgerWidth(80, 1440)).toBe(LEDGER_MIN);
    expect(clampLedgerWidth(2000, 1920)).toBe(LEDGER_MAX);
  });

  // A width dragged on a 27" monitor must not swallow the stage on a laptop.
  it("leaves the stage its minimum on a narrower window", () => {
    expect(clampLedgerWidth(LEDGER_MAX, 900)).toBe(900 - 420);
  });

  // Narrower than both minimums together, the stage is the one that gives —
  // below 1024px the layout stacks anyway.
  it("does not return a negative width on a very narrow window", () => {
    expect(clampLedgerWidth(400, 500)).toBe(LEDGER_MIN);
  });

  it("returns a whole number of pixels", () => {
    expect(clampLedgerWidth(432.6, 1440)).toBe(433);
  });

  it("falls back rather than propagating a NaN into a style", () => {
    expect(clampLedgerWidth(Number.NaN, 1440)).toBe(LEDGER_DEFAULT);
    expect(clampLedgerWidth(Number.POSITIVE_INFINITY, 1440)).toBe(LEDGER_DEFAULT);
  });
});

describe("persisted width", () => {
  it("reads back what was written", () => {
    expect(readLedgerWidth("512")).toBe(512);
  });

  it("ignores a value that is not a width", () => {
    expect(readLedgerWidth(null)).toBeNull();
    expect(readLedgerWidth("")).toBeNull();
    expect(readLedgerWidth("wide")).toBeNull();
    expect(readLedgerWidth("-30")).toBeNull();
    expect(readLedgerWidth("0")).toBeNull();
  });
});
