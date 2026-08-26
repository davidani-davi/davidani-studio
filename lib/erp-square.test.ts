import { describe, expect, it } from "vitest";
import {
  edgeStdDev,
  pickSquareHero,
  regularizeStyle,
  scoreSquareCandidate,
  squareReasons,
  squareThumbnailName,
  type SquareCandidate,
} from "./erp-square";

const base: SquareCandidate = {
  hasStyleToken: true,
  aspect: 0.75,
  edgeStdDev: 6,
  position: 0,
};

describe("square hero scoring", () => {
  // These are prerender.py::pick_best's weights. If this test is ever changed
  // to make a number nicer, the studio starts disagreeing with the tool that
  // actually builds the square, which is worse than not marking one at all.
  it("matches pick_best on a clean portrait hero", () => {
    expect(scoreSquareCandidate(base)).toBe(8); // 3 style + 2 portrait + 3 edges
  });

  it("charges for busy edges rather than merely not crediting them", () => {
    expect(scoreSquareCandidate({ ...base, edgeStdDev: 40 })).toBe(2);
    // Between the two thresholds, edges are worth nothing either way.
    expect(scoreSquareCandidate({ ...base, edgeStdDev: 20 })).toBe(5);
  });

  it("only credits a genuinely portrait crop", () => {
    expect(scoreSquareCandidate({ ...base, aspect: 1 })).toBe(6);
    expect(scoreSquareCandidate({ ...base, aspect: 0.55 })).toBe(8);
    expect(scoreSquareCandidate({ ...base, aspect: 0.9 })).toBe(8);
    expect(scoreSquareCandidate({ ...base, aspect: 0.54 })).toBe(6);
  });

  // Foreign files leak into shared galleries — real cases in the Faire repo
  // include "T_2597.png" sitting in DWJ62171's gallery.
  it("does not credit a frame that is not named for the style", () => {
    expect(scoreSquareCandidate({ ...base, hasStyleToken: false })).toBe(5);
  });

  it("prefers earlier frames, gently", () => {
    expect(scoreSquareCandidate({ ...base, position: 4 })).toBeCloseTo(7.8);
    // Not enough to outrank a real signal.
    expect(scoreSquareCandidate({ ...base, position: 10 })).toBeGreaterThan(
      scoreSquareCandidate({ ...base, edgeStdDev: 40, position: 0 })
    );
  });
});

describe("picking the hero", () => {
  it("takes the highest score", () => {
    expect(pickSquareHero([2, 8, 5])).toBe(1);
  });

  it("breaks a tie towards the earlier frame, as pick_best's max does", () => {
    expect(pickSquareHero([8, 8, 3])).toBe(0);
  });

  it("has no answer for an empty gallery", () => {
    expect(pickSquareHero([])).toBeNull();
  });
});

describe("reasons", () => {
  it("says why a frame won", () => {
    expect(squareReasons(base).strengths).toEqual([
      "named for this style",
      "portrait crop",
      "clean edges — fills invisibly",
    ]);
    expect(squareReasons(base).warnings).toEqual([]);
  });

  // The winner is often only the best of what is filed. Listing this among a
  // frame's merits reads as praise for the thing that will spoil the square —
  // which is exactly what the first real style tried did.
  it("keeps a disqualifier out of the merits", () => {
    const busy = squareReasons({ ...base, edgeStdDev: 40 });
    expect(busy.strengths).not.toContain("busy edges — the fill will ghost");
    expect(busy.warnings).toEqual(["busy edges — the fill will ghost"]);
  });

  it("names a middling edge as neither", () => {
    const mid = squareReasons({ ...base, edgeStdDev: 20 });
    expect(mid.strengths).toEqual(["named for this style", "portrait crop"]);
    expect(mid.warnings).toEqual([]);
  });

  it("warns about a foreign or landscape frame", () => {
    expect(squareReasons({ ...base, hasStyleToken: false }).warnings).toContain(
      "not named for this style"
    );
    expect(squareReasons({ ...base, aspect: 1.4 }).warnings).toContain("not a portrait crop");
  });
});

describe("plus twins", () => {
  // A P-style has no photos of its own; without this its gallery comes back
  // empty and the ERP looks like it has nothing.
  it("sends a Plus code to its regular twin", () => {
    expect(regularizeStyle("PEP42167")).toBe("DEP42167");
    expect(regularizeStyle("pep42167")).toBe("DEP42167");
  });

  it("leaves every other code alone", () => {
    expect(regularizeStyle("DWTS67099")).toBe("DWTS67099");
    expect(regularizeStyle(" ddt9040 ")).toBe("DDT9040");
  });

  it("names the square the Faire tooling would write", () => {
    expect(squareThumbnailName("DT42174H")).toBe("DT42174H Square.png");
    expect(squareThumbnailName("PEP42167")).toBe("DEP42167 Square.png");
  });
});

describe("edge measurement", () => {
  /** width x height greyscale, column x filled by fn. */
  function image(width: number, height: number, fn: (x: number, y: number) => number) {
    const px = new Uint8Array(width * height);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) px[y * width + x] = fn(x, y);
    return { px, width, height };
  }

  it("is zero on flat edges, whatever the middle is doing", () => {
    // Edges a constant 240; a noisy garment through the centre.
    const { px, width, height } = image(20, 30, (x, y) =>
      x < 2 || x >= 18 ? 240 : (x * 37 + y * 91) % 256
    );
    expect(edgeStdDev(px, width, height)).toBe(0);
  });

  // The bug this function was extracted for: sharp's stats() ignores a
  // preceding .extract(), so the whole photo was being measured — 79 where
  // the true edge value was 2.8, and every frame scored as "busy edges".
  it("does not see the middle of the photo at all", () => {
    const flat = image(20, 30, (x) => (x < 2 || x >= 18 ? 200 : 200));
    const noisy = image(20, 30, (x, y) => (x < 2 || x >= 18 ? 200 : (x * 53 + y * 17) % 256));
    expect(edgeStdDev(noisy.px, 20, 30)).toBe(edgeStdDev(flat.px, 20, 30));
  });

  it("reports the worse of the two sides", () => {
    const { px } = image(20, 30, (x, y) => (x >= 18 ? (y % 2 ? 0 : 255) : 128));
    expect(edgeStdDev(px, 20, 30)).toBeCloseTo(127.5, 1);
  });

  it("reads the right channel out of interleaved pixels", () => {
    const width = 6;
    const height = 4;
    const rgb = new Uint8Array(width * height * 3);
    for (let i = 0; i < width * height; i++) {
      rgb[i * 3] = 100; // the channel we read
      rgb[i * 3 + 1] = 250;
      rgb[i * 3 + 2] = 0;
    }
    expect(edgeStdDev(rgb, width, height, 3)).toBe(0);
  });

  it("refuses to guess at a zero-sized image", () => {
    expect(edgeStdDev(new Uint8Array(), 0, 0)).toBe(Number.POSITIVE_INFINITY);
  });

  it("handles an image narrower than the strip", () => {
    const { px } = image(1, 4, () => 50);
    expect(edgeStdDev(px, 1, 4)).toBe(0);
  });
});
