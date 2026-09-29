import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Thumb from "./Thumb";

const FAL = "https://v3b.fal.media/files/b/0a97fd36/render.png";

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
    fireEvent.error(img);
    expect(img.getAttribute("src")).toBe(FAL);
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
});
