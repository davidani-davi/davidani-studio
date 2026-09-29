import { describe, expect, it } from "vitest";
import { hasRemoteMatch } from "next/dist/shared/lib/match-remote-pattern";
import nextConfig from "../next.config.js";
import { thumbSrc } from "./thumb";

const FAL = "https://v3b.fal.media/files/b/0a97fd36/6bYK_DJ62056A%20Black%20Back.png";

describe("thumbSrc", () => {
  it("routes a fal render through the Next image resizer", () => {
    expect(thumbSrc(FAL, 256)).toBe(`/_next/image?url=${encodeURIComponent(FAL)}&w=256&q=75`);
  });

  const RESIZED = [
    "https://fal.media/files/x.png",
    "https://v3.fal.media/files/x.png",
    "https://rest.alpha.fal.ai/storage/x.png",
    "https://cdr9xgexrrfthz5f.public.blob.vercel-storage.com/saved/x.png",
    "https://system.davidani.com/upload/style/DJ62056A%20BLACK_1.png",
  ];

  it("covers every host the studio stores images on", () => {
    for (const url of RESIZED) expect(thumbSrc(url, 256)).toMatch(/^\/_next\/image\?url=/);
  });

  it("only resizes what next.config.js lets the resizer fetch", () => {
    const remotePatterns = nextConfig.images?.remotePatterns ?? [];
    for (const url of RESIZED) expect(hasRemoteMatch([], remotePatterns, new URL(url))).toBe(true);
  });

  it("does not resize someone else's store or a whole host", () => {
    for (const url of [
      "https://abc.public.blob.vercel-storage.com/x.png",
      "https://system.davidani.com/data/Style.inStock.Json.asp",
      "https://fal.ai/x.png",
    ]) {
      expect(thumbSrc(url, 256)).toBe(url);
    }
  });

  it("resizes files the app serves from public/", () => {
    expect(thumbSrc("/models/studio 97/front.jpg", 384)).toBe(
      `/_next/image?url=${encodeURIComponent("/models/studio 97/front.jpg")}&w=384&q=75`,
    );
  });

  it("snaps a requested width up to a size the resizer accepts", () => {
    expect(thumbSrc(FAL, 76)).toContain("&w=96&");
    expect(thumbSrc(FAL, 300)).toContain("&w=384&");
    expect(thumbSrc(FAL, 700)).toContain("&w=750&");
    expect(thumbSrc(FAL, 9000)).toContain("&w=3840&");
  });

  it("leaves in-memory and unknown-host images alone", () => {
    for (const url of [
      "data:image/png;base64,AAAA",
      "blob:https://davidani-studio.vercel.app/1234",
      "https://i.pinimg.com/1200x/88/59/8a/x.jpg",
      "http://system.davidani.com/upload/style/x.png",
      "/api/download?url=x",
      "/_next/image?url=x&w=256&q=75",
      "//evil.example/x.png",
    ]) {
      expect(thumbSrc(url, 256)).toBe(url);
    }
  });

  it("passes empty values through", () => {
    expect(thumbSrc("", 256)).toBe("");
    expect(thumbSrc(undefined, 256)).toBe("");
  });

  it("keeps SVGs original, since the resizer refuses them", () => {
    expect(thumbSrc("/product-shots/mark.svg", 256)).toBe("/product-shots/mark.svg");
  });
});
