import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("@/components/StudioHeader", () => ({ default: ({ title }: { title: string }) => <header>{title}</header> }));
// The kit's forming-canvas animation loads a CSS-only package jsdom cannot import.
vi.mock("@/components/ui/image-generation", () => ({ ImageGeneration: ({ step }: { step?: string }) => <div data-testid="forming">{step}</div> }));
vi.mock("@/components/ui/spinner", () => ({ Spinner: () => <span data-testid="spinner" /> }));
vi.mock("@/lib/upload-images", () => ({
  uploadImages: vi.fn(async () => [{ name: "front.jpg", url: "https://fal.media/front.jpg" }, { name: "back.jpg", url: "https://fal.media/back.jpg" }]),
}));
import PhotoshootStudioClient from "./PhotoshootStudioClient";

let generateReplies: { status: number; body: unknown }[];
let generateBodies: any[];

beforeEach(() => {
  generateReplies = [];
  generateBodies = [];
  localStorage.clear();
  vi.stubGlobal("fetch", vi.fn(async (input: string, init?: RequestInit) => {
    const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
    if (input === "/api/user-references") return reply(200, { references: [] });
    if (input === "/api/prompt-studio/photoshoot") return reply(200, { prompts: "p", shotVariation: "Walking toward camera" });
    if (input === "/api/generate") {
      generateBodies.push(JSON.parse(String(init?.body)));
      const next = generateReplies.shift() || { status: 200, body: { images: [{ url: `https://fal.media/shot-${generateBodies.length}.png` }] } };
      return reply(next.status, next.body);
    }
    return reply(404, { error: "not mocked" });
  }));
});
afterEach(() => vi.unstubAllGlobals());

async function upload(container: HTMLElement) {
  const input = container.querySelector('input[type="file"][multiple]') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [new File(["x"], "front.jpg", { type: "image/jpeg" })] } });
  await screen.findByAltText("front.jpg");
}

describe("PhotoshootStudioClient", () => {
  it("asks for product photos before it can run", () => {
    render(<PhotoshootStudioClient />);
    expect(screen.getAllByText("Upload the product photos to start.").length).toBeGreaterThan(0);
    for (const b of screen.getAllByRole("button", { name: /Generate 4 shots/ })) expect(b).toBeDisabled();
    expect(screen.getByText("Your campaign lands here")).toBeInTheDocument();
  });

  it("runs the shots in order, anchors on the first finished one, and retries a failed shot", async () => {
    const { container } = render(<PhotoshootStudioClient />);
    await upload(container);
    fireEvent.click(screen.getByRole("button", { name: "2" }));
    generateReplies.push({ status: 500, body: { error: "Provider timed out" } });
    fireEvent.click(screen.getAllByRole("button", { name: /Generate 2 shots/ })[0]);

    expect(await screen.findByText("Provider timed out")).toBeInTheDocument();
    await screen.findByLabelText("Shot 2, done");
    // Shot 1 failed, so shot 2 ran with no identity anchor: products + reference only.
    expect(generateBodies[1].imageUrls).toHaveLength(3);

    fireEvent.click(screen.getByRole("button", { name: /Retry/ }));
    await screen.findByLabelText("Shot 1, done");
    // The retry anchors on shot 2, the one that finished.
    expect(generateBodies[2].imageUrls).toHaveLength(4);
    expect(generateBodies[2].imageUrls[3]).toBe("https://fal.media/shot-2.png");
    await waitFor(() => expect(screen.getAllByTestId("ps-summary")[0]).toHaveTextContent("2 of 2 done"));
    expect(screen.getByRole("button", { name: /Download all \(2\)/ })).toBeInTheDocument();
  });
});
