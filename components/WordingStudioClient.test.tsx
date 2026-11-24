import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { JobView, isWaiting } from "./WordingStudioClient";
import type { PublicJob } from "@/lib/wording-studio/jobs";

const base: PublicJob = {
  id: "1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed", createdAt: new Date(0).toISOString(), createdBy: "studio",
  photoUrl: "https://b.public.blob.vercel-storage.com/wording-studio-uploads/a.jpg", category: "top",
  status: "queued_ideas", ideas: [], chosen: [], mockups: [], attempts: 0, seq: 1, queuedAt: 0,
};
const ready: PublicJob = {
  ...base, status: "ideas_ready",
  ideas: ["DREAM FREE", "GROW IN GRACE", "BLESSED", "LOVE"].map((w, i) => ({ id: String(i), main: w.split(" "), evidence: i === 0 ? "780 units · 103 stores (DT62115)" : "untested", why: "fits" })),
};

describe("Wording Studio", () => {
  it("shows waiting message after 120 s queued", () => {
    expect(isWaiting(base, 119_000)).toBe(false);
    expect(isWaiting(base, 121_000)).toBe(true);
    expect(isWaiting({ ...base, status: "ideas_running", leaseUntil: 5000 }, 6000)).toBe(true);
    render(<JobView job={base} now={121_000} onChoose={vi.fn()} onRestart={vi.fn()} />);
    expect(screen.getByText(/Waiting for the studio computer/)).toBeInTheDocument();
  });

  it("limits selection to 3", () => {
    render(<JobView job={ready} now={1} onChoose={vi.fn()} onRestart={vi.fn()} />);
    const boxes = screen.getAllByRole("checkbox");
    boxes.forEach((b) => fireEvent.click(b));
    expect(boxes.filter((b) => (b as HTMLInputElement).checked)).toHaveLength(3);
    expect(screen.getByRole("button", { name: /Mock up \(3\)/ })).toBeEnabled();
  });

  it("Mock up disabled with 0 selected", () => {
    render(<JobView job={ready} now={1} onChoose={vi.fn()} onRestart={vi.fn()} />);
    expect(screen.getByRole("button", { name: /Mock up/ })).toBeDisabled();
  });

  it("sends the chosen lines, including your own wording", () => {
    const onChoose = vi.fn();
    render(<JobView job={ready} now={1} onChoose={onChoose} onRestart={vi.fn()} />);
    fireEvent.click(screen.getAllByRole("checkbox")[0]);
    fireEvent.change(screen.getByLabelText("Your own wording"), { target: { value: "WALK BY\nFAITH" } });
    fireEvent.click(screen.getByRole("button", { name: /Mock up \(2\)/ }));
    expect(onChoose).toHaveBeenCalledWith([["DREAM", "FREE"], ["WALK BY", "FAITH"]]);
  });

  it("shows the evidence chip and skeletons while ideas run", () => {
    const { rerender } = render(<JobView job={{ ...base, status: "ideas_running", leaseUntil: 999_999 }} now={1} onChoose={vi.fn()} onRestart={vi.fn()} />);
    expect(screen.getAllByTestId("ws-skeleton-idea")).toHaveLength(8);
    rerender(<JobView job={ready} now={1} onChoose={vi.fn()} onRestart={vi.fn()} />);
    expect(screen.getByText("780 units · 103 stores (DT62115)")).toBeInTheDocument();
    expect(screen.getAllByText("Not proven yet").length).toBeGreaterThan(0);
  });
});
