import { describe, expect, it } from "vitest";
import {
  canPassThroughKieUpload,
  hasKieSupportedImageExtension,
  isTrustedKieNormalizationHost,
} from "./kie-image-compat";

describe("Kie image compatibility", () => {
  it("recognizes supported URL extensions without matching query strings", () => {
    expect(hasKieSupportedImageExtension("https://example.com/photo.JPEG?x=1")).toBe(true);
    expect(hasKieSupportedImageExtension("https://example.com/photo.webp?format=png")).toBe(false);
    expect(hasKieSupportedImageExtension("photo.png")).toBe(true);
    expect(hasKieSupportedImageExtension("https://example.com/photo.png/preview")).toBe(false);
  });

  it("passes through declared JPEG and PNG uploads", () => {
    expect(canPassThroughKieUpload({ name: "photo.bin", type: "image/jpeg" })).toBe(true);
    expect(canPassThroughKieUpload({ name: "photo.bin", type: "image/png" })).toBe(true);
    expect(canPassThroughKieUpload({ name: "photo.bin", type: "IMAGE/PNG" })).toBe(true);
  });

  it("uses the filename only when the browser omitted the MIME type", () => {
    expect(canPassThroughKieUpload({ name: "photo.jpg", type: "" })).toBe(true);
    expect(canPassThroughKieUpload({ name: "photo.webp", type: "" })).toBe(false);
  });

  it("requires conversion for unsupported declared formats", () => {
    expect(canPassThroughKieUpload({ name: "photo.jpg", type: "image/webp" })).toBe(false);
    expect(canPassThroughKieUpload({ name: "photo.avif", type: "image/avif" })).toBe(false);
  });

  it("allows server-side legacy conversion only from fal storage", () => {
    expect(isTrustedKieNormalizationHost("https://v3b.fal.media/files/photo.webp")).toBe(true);
    expect(isTrustedKieNormalizationHost("https://fal.media/files/photo.webp")).toBe(true);
    expect(isTrustedKieNormalizationHost("https://fal.media.evil.example/photo.webp")).toBe(false);
    expect(isTrustedKieNormalizationHost("http://127.0.0.1/photo.webp")).toBe(false);
    expect(isTrustedKieNormalizationHost("not a url")).toBe(false);
  });
});
