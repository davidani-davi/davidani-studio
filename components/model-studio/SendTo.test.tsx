import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { FaireSend, listingIdOf } from "./SendTo";
import type { Slot } from "@/lib/model-studio/types";

const kept = [
  { view: "front", status: "done", url: "https://fal.media/f.png", error: "", approved: true },
  { view: "back", status: "done", url: "https://fal.media/b.png", error: "", approved: true },
] as unknown as Slot[];
const saved = [
  { id: "s1", view: "front", url: "https://blob/f.png", source: "https://fal.media/f.png", savedAt: 1 },
  { id: "s2", view: "back", url: "https://blob/b.png", source: "https://fal.media/b.png", savedAt: 2 },
];

let lookup: { status: number; body: unknown };
let tab: { opener: unknown; location: { href: string }; close: () => void };
beforeEach(() => {
  lookup = { status: 200, body: { ok: true, style: "DT78080", productId: "p_abc", state: "PUBLISHED", url: "https://www.faire.com/brand-portal/my-shop/products/p_abc" } };
  vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response(JSON.stringify(lookup.body), { status: lookup.status, headers: { "content-type": "application/json" } }))));
  tab = { opener: window, location: { href: "about:blank" }, close: vi.fn() };
  vi.spyOn(window, "open").mockImplementation(() => tab as unknown as Window);
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const show = (onSave = vi.fn(async () => saved), onOpenChange = vi.fn()) =>
  render(<FaireSend open onOpenChange={onOpenChange} style="DT78080" color="NAVY" kept={kept} onSave={onSave} />);

describe("Send to Faire", () => {
  it("finds the listing, saves the views and opens it with their saved ids", async () => {
    const onSave = vi.fn(async () => saved);
    const onOpenChange = vi.fn();
    show(onSave, onOpenChange);
    expect(await screen.findByText(/p_abc/)).toBeInTheDocument();
    expect(screen.getByText(/Published/)).toBeInTheDocument();
    expect(screen.getByText(/Nothing is added to the listing until you click Upload/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Save and open on Faire/ }));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(tab.location.href).toBe("https://www.faire.com/brand-portal/my-shop/products/p_abc#ddto-studio=s1,s2");
    expect(tab.opener).toBeNull();
  });

  it("asks for a pasted link when the lookup is not set up, and sends to that listing", async () => {
    lookup = { status: 503, body: { ok: false, code: "not-configured", error: "not set up" } };
    show();
    expect(await screen.findByText(/automatic Faire lookup is not set up/)).toBeInTheDocument();
    const send = screen.getByRole("button", { name: /Save and open on Faire/ });
    expect(send).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Faire listing link"), { target: { value: "https://www.faire.com/brand-portal/my-shop/products/p_zz9?tab=images" } });
    expect(send).toBeEnabled();
    fireEvent.click(send);
    await waitFor(() => expect(tab.location.href).toBe("https://www.faire.com/brand-portal/my-shop/products/p_zz9#ddto-studio=s1,s2"));
  });

  it("sends nothing and closes the spare tab when the save fails", async () => {
    show(vi.fn(async () => null));
    await screen.findByText(/p_abc/);
    fireEvent.click(screen.getByRole("button", { name: /Save and open on Faire/ }));
    expect(await screen.findByText(/nothing was sent/)).toBeInTheDocument();
    expect(tab.close).toHaveBeenCalled();
    expect(tab.location.href).toBe("about:blank");
  });

  it("says when the style has no listing yet", async () => {
    lookup = { status: 200, body: { ok: true, style: "DT78080", productId: null, state: null, url: null } };
    show();
    expect(await screen.findByText(/Faire has no listing for DT78080 yet/)).toBeInTheDocument();
  });

  it("reads a listing id out of a pasted link", () => {
    expect(listingIdOf(" https://www.faire.com/brand-portal/my-shop/products/p_ab12cd ")).toBe("p_ab12cd");
    expect(listingIdOf("p_x1")).toBe("p_x1");
    expect(listingIdOf("nothing")).toBe("");
  });
});
