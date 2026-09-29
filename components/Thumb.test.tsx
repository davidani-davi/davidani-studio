import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import Thumb from "./Thumb";

const FAL = "https://v3b.fal.media/files/b/0a97fd36/render.png";
const FAL2 = "https://v3b.fal.media/files/b/0a97fd36/render-2.png";
const resized = (url: string, w: number) => `/_next/image?url=${encodeURIComponent(url)}&w=${w}&q=75`;

afterEach(() => vi.unstubAllGlobals());

describe("Thumb", () => {
  it("loads the resized copy lazily and fades in once it arrives", () => {
    render(<Thumb src={FAL} size={200} alt="variant 1" className="h-full w-full" />);
    const img = screen.getByAltText("variant 1") as HTMLImageElement;
    expect(img.getAttribute("src")).toBe(`/_next/image?url=${encodeURIComponent(FAL)}&w=256&q=75`);
    expect(img.getAttribute("loading")).toBe("lazy");
    expect(img.className).toContain("opacity-0");
    fireEvent.load(img);
    expect(img.className).not.toContain("opacity-0");
  });

  it("falls back to the original when the resizer fails, then stays hidden", () => {
    render(<Thumb src={FAL} size={200} alt="variant 1" />);
    const img = screen.getByAltText("variant 1") as HTMLImageElement;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    fireEvent.error(img);
    expect(img.getAttribute("src")).toBe(FAL);
    expect(warn).toHaveBeenCalledWith("[thumb] resized copy failed, using the original", FAL);
    warn.mockRestore();
    fireEvent.error(img);
    expect(img.getAttribute("src")).toBe(FAL);
    expect(img.className).toContain("opacity-0");
  });

  it("shows the fallback when neither copy loads", () => {
    render(<Thumb src={FAL} size={200} alt="variant 1" fallback={<span>Image expired</span>} />);
    fireEvent.error(screen.getByAltText("variant 1"));
    fireEvent.error(screen.getByAltText("variant 1"));
    expect(screen.queryByAltText("variant 1")).toBeNull();
    expect(screen.getByText("Image expired")).toBeTruthy();
  });

  it("keeps a caller's own transition", () => {
    render(<Thumb src={FAL} size={200} alt="x" className="transition duration-300 hover:scale-105" />);
    expect(screen.getByAltText("x").className).not.toContain("transition-opacity");
  });

  it("starts over when it is handed a different image", () => {
    const { rerender } = render(<Thumb src={FAL} size={200} alt="x" />);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    fireEvent.error(screen.getByAltText("x"));
    fireEvent.error(screen.getByAltText("x"));
    rerender(<Thumb src={FAL2} size={200} alt="x" />);
    const img = screen.getByAltText("x");
    expect(img.getAttribute("src")).toBe(resized(FAL2, 256));
    expect(img.className).toContain("opacity-0");
  });

  it("swaps in the full original once it has downloaded, when asked to", () => {
    const preloads: { src: string; onload: (() => void) | null }[] = [];
    vi.stubGlobal(
      "Image",
      class {
        onload: (() => void) | null = null;
        set src(value: string) {
          preloads.push(this as unknown as { src: string; onload: () => void });
          (this as unknown as { url: string }).url = value;
        }
        get src() {
          return (this as unknown as { url: string }).url;
        }
      },
    );
    render(<Thumb src={FAL} size={1920} alt="stage" upgrade loading="eager" />);
    const img = screen.getByAltText("stage");
    expect(img.getAttribute("src")).toBe(resized(FAL, 1920));
    expect(preloads).toHaveLength(0);
    fireEvent.load(img);
    expect(preloads.map((p) => p.src)).toEqual([FAL]);
    act(() => preloads[0].onload?.());
    expect(img.getAttribute("src")).toBe(FAL);
    expect(img.className).not.toContain("opacity-0");
  });

  it("does not fetch the original twice without being asked", () => {
    const Spy = vi.fn();
    vi.stubGlobal("Image", Spy);
    render(<Thumb src={FAL} size={200} alt="chip" />);
    fireEvent.load(screen.getByAltText("chip"));
    expect(Spy).not.toHaveBeenCalled();
  });
});
