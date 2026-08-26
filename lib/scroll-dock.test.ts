import { describe, expect, it } from "vitest";
import { DOCK_TOP_ZONE, nextDockHidden } from "./scroll-dock";

const base = { hidden: false, top: 400, lastTop: 400, overflow: 2000 };

describe("composer dock", () => {
  it("ducks away when you scroll back through the ledger", () => {
    expect(nextDockHidden({ ...base, top: 480, lastTop: 400 })).toBe(true);
  });

  it("comes back the moment you scroll up", () => {
    expect(nextDockHidden({ ...base, hidden: true, top: 320, lastTop: 400 })).toBe(false);
  });

  // It stops moving when you find what you were looking for — which is when
  // you start reading it. Reveal has to be an explicit gesture.
  it("stays away while the feed is simply not moving", () => {
    expect(nextDockHidden({ ...base, hidden: true })).toBe(true);
    expect(nextDockHidden({ ...base, hidden: false })).toBe(false);
  });

  it("ignores jitter in either direction", () => {
    expect(nextDockHidden({ ...base, top: 406, lastTop: 400 })).toBe(false);
    expect(nextDockHidden({ ...base, hidden: true, top: 394, lastTop: 400 })).toBe(true);
  });

  it("is always up at the newest run", () => {
    expect(nextDockHidden({ ...base, hidden: true, top: 0, lastTop: 900 })).toBe(false);
    expect(nextDockHidden({ ...base, hidden: true, top: DOCK_TOP_ZONE, lastTop: 900 })).toBe(false);
    // ...and a downward scroll inside the top zone still does not hide it.
    expect(nextDockHidden({ ...base, top: 20, lastTop: 0 })).toBe(false);
  });

  it("never hides when there is nothing to scroll", () => {
    expect(nextDockHidden({ ...base, overflow: 0, top: 480, lastTop: 400 })).toBe(false);
    expect(nextDockHidden({ ...base, overflow: 4, hidden: true, top: 480, lastTop: 400 })).toBe(
      false
    );
  });
});
