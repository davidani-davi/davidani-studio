import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Vitest runs without globals, so Testing Library's automatic teardown never
// registers itself and every render stacks up in the same document. Without
// this, the second component test in a file fails with "found multiple
// elements" and the fix looks like a query problem rather than a leak.
afterEach(cleanup);

// jsdom has no Web Animations API. Kobra's Scritto text (ImageGeneration step
// labels, Tooltip) cancels running animations before each update, so give
// elements an empty list and a no-op animate() to stand in for it.
if (typeof Element !== "undefined") {
  if (!Element.prototype.getAnimations) Element.prototype.getAnimations = () => [];
  if (!Element.prototype.animate) {
    Element.prototype.animate = function () {
      return {
        cancel() {},
        finish() {},
        play() {},
        pause() {},
        finished: Promise.resolve(),
        onfinish: null,
        addEventListener() {},
        removeEventListener() {},
      } as unknown as Animation;
    };
  }
}

// jsdom has no matchMedia either; Kobra's Spinner reads prefers-reduced-motion.
if (typeof window !== "undefined" && !window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener() {},
      removeListener() {},
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
}
