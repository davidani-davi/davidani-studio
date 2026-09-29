import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import Thumb from "./Thumb";

const FAL = "https://v3b.fal.media/files/b/0a97fd36/render.png";
const FAL2 = "https://v3b.fal.media/files/b/0a97fd36/render-2.png";
// Upgrades are remembered for the whole module, so each upgrade test has its own image.
const FAL_DEAD = "https://v3b.fal.media/files/b/0a97fd36/render-dead.png";
const FAL_AGAIN = "https://v3b.fal.media/files/b/0a97fd36/render-again.png";
const FAL_FALLBACK = "https://v3b.fal.media/files/b/0a97fd36/render-fallback.png";
const FAL_GONE = "https://v3b.fal.media/files/b/0a97fd36/render-gone.png";
const resized = (url: string, w: number) => `/_next/image?url=${encodeURIComponent(url)}&w=${w}&q=75`;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** Stands in for `new Image()`: records each preload so a test can settle it. */
function stubPreloads() {
  const preloads: { src: string; resolve: () => void; reject: () => void }[] = [];
  vi.stubGlobal(
    "Image",
    class {
      src = "";
      decode() {
        return new Promise<void>((resolve, reject) => preloads.push({ src: this.src, resolve, reject }));
      }
    },
  );
  return preloads;
}

describe("Thumb", () => {
  it("loads the resized copy lazily and fades in once it arrives", () => {
    render(<Thumb src={FAL} size={200} alt="variant 1" className="h-full w-full" />);
    const img = screen.getByAltText("variant 1") as HTMLImageElement;
    expect(img.getAttribute("src")).toBe(resized(FAL, 256));
    expect(img.getAttribute("loading")).toBe("lazy");
    expect(img.className).toContain("opacity-0");
    fireEvent.load(img);
    expect(img.className).not.toContain("opacity-0");
  });

  it("falls back to the original when the resizer fails, then hides a dead image", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    render(<Thumb src={FAL} size={200} alt="variant 1" />);
    const img = screen.getByAltText("variant 1") as HTMLImageElement;
    fireEvent.error(img);
    expect(img.getAttribute("src")).toBe(FAL);
    expect(warn).toHaveBeenCalledWith("[thumb] resized copy failed, using the original", FAL);
    fireEvent.error(img);
    expect(img.getAttribute("src")).toBe(FAL);
    // Hidden, so the box behind shows instead of a broken-image icon.
    expect(img.className).toContain("invisible");
  });

  it("shows the fallback when neither copy loads", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    render(<Thumb src={FAL} size={200} alt="variant 1" fallback={<span>Image expired</span>} />);
    fireEvent.error(screen.getByAltText("variant 1"));
    fireEvent.error(screen.getByAltText("variant 1"));
    expect(screen.queryByAltText("variant 1")).toBeNull();
    expect(screen.getByText("Image expired")).toBeTruthy();
  });

  it("lets an image the resizer can't take paint as it downloads", () => {
    render(<Thumb src="https://i.pinimg.com/1200x/88/59/8a/x.jpg" size={200} alt="pin" />);
    const img = screen.getByAltText("pin");
    expect(img.getAttribute("src")).toBe("https://i.pinimg.com/1200x/88/59/8a/x.jpg");
    expect(img.className).not.toContain("opacity-0");
  });

  it("keeps a caller's own transition", () => {
    render(<Thumb src={FAL} size={200} alt="x" className="transition duration-300 hover:scale-105" />);
    expect(screen.getByAltText("x").className).not.toContain("transition-opacity");
  });

  it("shows an image that finished before hydration", () => {
    vi.spyOn(HTMLImageElement.prototype, "complete", "get").mockReturnValue(true);
    vi.spyOn(HTMLImageElement.prototype, "naturalWidth", "get").mockReturnValue(256);
    render(<Thumb src={FAL} size={200} alt="x" />);
    expect(screen.getByAltText("x").className).not.toContain("opacity-0");
  });

  it("starts over when it is handed a different image", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { rerender } = render(<Thumb src={FAL} size={200} alt="x" />);
    fireEvent.error(screen.getByAltText("x"));
    fireEvent.error(screen.getByAltText("x"));
    rerender(<Thumb src={FAL2} size={200} alt="x" />);
    const img = screen.getByAltText("x");
    expect(img.getAttribute("src")).toBe(resized(FAL2, 256));
    expect(img.className).toContain("opacity-0");
    expect(img.className).not.toContain("invisible");
  });

  it("downloads the full original alongside the resized copy and swaps it in", async () => {
    const preloads = stubPreloads();
    render(<Thumb src={FAL} size={1920} alt="stage" upgrade loading="eager" />);
    const img = screen.getByAltText("stage");
    expect(img.getAttribute("src")).toBe(resized(FAL, 1920));
    // Started at once, not after the resized copy has arrived.
    expect(preloads.map((p) => p.src)).toEqual([FAL]);
    await act(async () => preloads[0].resolve());
    expect(img.getAttribute("src")).toBe(FAL);
    expect(img.className).not.toContain("opacity-0");
  });

  it("keeps the resized copy when the original does not load", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const preloads = stubPreloads();
    render(<Thumb src={FAL_DEAD} size={1920} alt="stage" upgrade />);
    await act(async () => preloads[0].reject());
    expect(screen.getByAltText("stage").getAttribute("src")).toBe(resized(FAL_DEAD, 1920));
    expect(warn).toHaveBeenCalledWith("[thumb] full-size original did not load", FAL_DEAD);
  });

  it("lets the <img> take over the original when the resized copy fails mid-preload", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const preloads = stubPreloads();
    render(<Thumb src={FAL_FALLBACK} size={1920} alt="stage" upgrade />);
    const img = screen.getByAltText("stage");
    fireEvent.error(img);
    expect(img.getAttribute("src")).toBe(FAL_FALLBACK);
    // No second preload of the same file.
    expect(preloads).toHaveLength(1);
    await act(async () => preloads[0].resolve());
    expect(img.getAttribute("src")).toBe(FAL_FALLBACK);
  });

  it("ignores a preload that finishes after it has gone", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const preloads = stubPreloads();
    const { unmount } = render(<Thumb src={FAL_GONE} size={1920} alt="stage" upgrade />);
    unmount();
    await act(async () => preloads[0].resolve());
    expect(error).not.toHaveBeenCalled();
  });

  it("shows an original it has already downloaded straight away next time", async () => {
    const preloads = stubPreloads();
    const { unmount } = render(<Thumb src={FAL_AGAIN} size={1920} alt="stage" upgrade />);
    await act(async () => preloads[0].resolve());
    unmount();
    render(<Thumb src={FAL_AGAIN} size={1920} alt="stage" upgrade />);
    const img = screen.getByAltText("stage");
    expect(img.getAttribute("src")).toBe(FAL_AGAIN);
    expect(img.className).not.toContain("opacity-0");
    expect(preloads).toHaveLength(1);
  });

  it("fetches a new width when the size changes", () => {
    const { rerender } = render(<Thumb src={FAL2} size={200} alt="x" />);
    rerender(<Thumb src={FAL2} size={1000} alt="x" />);
    expect(screen.getByAltText("x").getAttribute("src")).toBe(resized(FAL2, 1080));
  });

  it("does not fetch the original twice without being asked", () => {
    const preloads = stubPreloads();
    render(<Thumb src={FAL} size={200} alt="chip" />);
    fireEvent.load(screen.getByAltText("chip"));
    expect(preloads).toHaveLength(0);
  });
});
