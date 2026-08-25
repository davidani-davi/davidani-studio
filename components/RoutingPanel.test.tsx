import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import RoutingPanel from "./RoutingPanel";
import type { RoutingPayload } from "@/lib/routing-summary";

const PONCHO_SET: RoutingPayload = {
  styleCode: { prefix: "DWTS", category: "set", authority: "override" },
  erp: { raw: "JACKETS / OUTWEAR", mapped: "outerwear" },
  vision: { category: "outerwear" },
  decidedBy: "style-code:DWTS",
  overrode: { field: "erp", value: "JACKETS / OUTWEAR" },
  describedFrom: { kind: "gallery", frames: 9 },
};

describe("RoutingPanel", () => {
  it("shows the whole chain, including the answer that lost", () => {
    render(
      <RoutingPanel
        routing={PONCHO_SET}
        canvas={{
          path: "/product-shots/canvas-set-front.png",
          isFallback: false,
          category: "set",
        }}
      />
    );
    expect(screen.getByText("DWTS → Coordinated set")).toBeTruthy();
    expect(screen.getByText("Jackets / Outwear")).toBeTruthy(); // struck, still legible
    expect(screen.getByText("Overridden")).toBeTruthy();
    expect(screen.getByText("Style gallery · 9 frames")).toBeTruthy();
    expect(screen.getByText("canvas-set-front")).toBeTruthy();
  });

  it("invites a photo rather than showing an empty trail", () => {
    render(<RoutingPanel routing={null} canvas={null} />);
    expect(screen.getByText(/Upload a product photo/)).toBeTruthy();
  });

  it("holds its shape while analyzing", () => {
    render(<RoutingPanel routing={null} canvas={null} pending />);
    expect(screen.getByText(/Working out the category/)).toBeTruthy();
  });

  it("names the missing canvas rather than saying 'fallback'", () => {
    render(
      <RoutingPanel
        routing={{
          styleCode: null,
          erp: null,
          vision: { category: "pants" },
          decidedBy: "none",
          overrode: null,
          describedFrom: { kind: "intake-photo" },
        }}
        canvas={{
          path: "/product-shots/studio-backdrop-empty.png",
          isFallback: true,
          category: "pants",
        }}
      />
    );
    expect(screen.getByText("Empty sweep")).toBeTruthy();
    expect(screen.getByText(/No approved flat lay for pants yet/)).toBeTruthy();
    expect(screen.getByText("No style number")).toBeTruthy();
  });
});
