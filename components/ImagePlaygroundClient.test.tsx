import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import ImagePlaygroundClient from "./ImagePlaygroundClient";
import { CREATIVE_REFERENCE_KEY } from "@/lib/creative-lab";

const navigation = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => navigation }));
vi.mock("./StudioHeader", () => ({ default: ({ title }: { title: string }) => <h1>{title}</h1> }));
vi.mock("./ImageLightbox", () => ({ default: () => null, ZoomButton: () => null }));
const requests: any[] = [];
let failNextNano = false;

beforeEach(() => {
  localStorage.clear(); sessionStorage.clear(); requests.length = 0; failNextNano = false; navigation.push.mockReset();
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
    const body = JSON.parse(init.body as string); requests.push(body);
    if (body.modelId === "nano-banana" && failNextNano) {
      failNextNano = false;
      return new Response(JSON.stringify({ error: "Provider temporarily unavailable" }), { status: 500 });
    }
    return new Response(JSON.stringify({ modelId: body.modelId, images: [{ url: `https://fal.media/${requests.length}.png` }] }));
  }));
  HTMLElement.prototype.scrollIntoView = vi.fn();
});
afterEach(() => vi.unstubAllGlobals());

function prepare() {
  render(<ImagePlaygroundClient />);
  fireEvent.change(screen.getByPlaceholderText("Paste image URL…"), { target: { value: "https://fal.media/reference.png" } });
  fireEvent.click(screen.getByRole("button", { name: "Add", exact: true }));
  fireEvent.change(screen.getByRole("textbox", { name: "Creative brief" }), { target: { value: "Window light\nOutdoor setting" } });
  fireEvent.click(screen.getByRole("checkbox", { name: /Nano Banana/ }));
}

describe("Creative Lab workflow", () => {
  it("compares the same concepts and references across models and records each result", async () => {
    prepare();
    fireEvent.click(screen.getByRole("button", { name: "Compare models" }));
    await waitFor(() => expect(screen.getAllByRole("button", { name: "Use as reference" })).toHaveLength(4));
    expect(requests.map(({ prompt, modelId }) => [prompt, modelId])).toEqual([
      ["Window light", "gpt-image"], ["Window light", "nano-banana"],
      ["Outdoor setting", "gpt-image"], ["Outdoor setting", "nano-banana"],
    ]);
    expect(requests.every((request) => request.raw && request.useDefaultReference === false && request.imageUrls[0] === "https://fal.media/reference.png")).toBe(true);
    expect(screen.getByText("Concept 1 · ChatGPT Image Generator V2.0")).toBeVisible();
    expect(screen.getByText("Concept 1 · Nano Banana 2 V2")).toBeVisible();
  });

  it("retries only the failed image with its original inputs after the draft changes", async () => {
    prepare(); failNextNano = true;
    fireEvent.click(screen.getByRole("button", { name: "Compare models" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Compare models" })).toBeEnabled());
    expect(requests).toHaveLength(4);
    fireEvent.change(screen.getByRole("textbox", { name: "Creative brief" }), { target: { value: "A different draft" } });
    fireEvent.click(screen.getByRole("button", { name: "Retry image" }));
    await waitFor(() => expect(screen.getAllByRole("button", { name: "Use as reference" })).toHaveLength(4));
    expect(requests).toHaveLength(5);
    expect(requests[4]).toEqual(requests[1]);
  });

  it("restores old history references and settings without generating", async () => {
    localStorage.setItem("davidani_playground_history_v1", JSON.stringify([{ id: "old", timestamp: 1, modelId: "seedream-4", aspect: "2:3", resolution: "2K", parallel: 1, refs: ["https://fal.media/old-reference.png"], results: [{ id: "old-result", prompt: "Original brief", status: "done", urls: ["https://fal.media/result.png"] }] }]));
    render(<ImagePlaygroundClient />);
    const history = screen.getByRole("list");
    fireEvent.click(within(history).getByRole("button"));
    expect(screen.getByRole("textbox", { name: "Creative brief" })).toHaveValue("Original brief");
    expect(screen.getByRole("checkbox", { name: /Seedream/ })).toBeChecked();
    expect(screen.getByRole("button", { name: "Generate images" })).toBeEnabled();
    expect(requests).toHaveLength(0);
  });

  it("reuses outputs and prepares a Studio reference without making new image requests", async () => {
    prepare(); fireEvent.click(screen.getByRole("button", { name: "Compare models" }));
    await waitFor(() => expect(screen.getAllByRole("button", { name: "Use as reference" })).toHaveLength(4));
    fireEvent.click(screen.getAllByRole("button", { name: "Use as reference" })[0]);
    expect(screen.getByRole("textbox", { name: "Creative brief" })).toHaveValue("Window light");
    fireEvent.click(screen.getAllByRole("button", { name: "Use in Studio" })[0]);
    expect(JSON.parse(sessionStorage.getItem(CREATIVE_REFERENCE_KEY)!)).toEqual({ url: "https://fal.media/1.png", prompt: "Window light" });
    expect(navigation.push).toHaveBeenCalledWith("/?from=creative-lab");
    expect(requests).toHaveLength(4);
  });
});
