import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

vi.mock("@/components/StudioHeader", () => ({ default: ({ title, action }: { title: string; action?: React.ReactNode }) => <header>{title}{action}</header> }));
// The kit's forming-canvas animation loads a CSS-only package jsdom cannot import.
vi.mock("@/components/ui/image-generation", () => ({ ImageGeneration: ({ step }: { step?: string }) => <div data-testid="forming">{step}</div> }));
// …and its spinner runs on the Web Animations API, which jsdom lacks.
vi.mock("@/components/ui/spinner", () => ({ Spinner: () => <span data-testid="spinner" /> }));
import ModelStudio from "./ModelStudio";

const FRONT = "https://system.davidani.com/upload/style/DT78080 NAVY_1.jpg";
const BACK = "https://system.davidani.com/upload/style/DT78080 NAVY_2.jpg";
const photo = (n: number) => ({ index: n, label: `Photo ${n}`, thumb: `/api/erp/photo?src=${n}`, full: n === 1 ? FRONT : n === 2 ? BACK : `https://system.davidani.com/upload/style/DT78080 NAVY_${n}.jpg` });
const gallery = { ok: true, style: "DT78080", regularizedFrom: null, resolvedFrom: null, candidates: [], groups: [{ label: "NAVY", kind: "colorway", styledWith: [], photos: [photo(1), photo(2), photo(3)] }] };
const catalogue = {
  ok: true,
  people: [{ id: "vision", name: "Vision", portrait: "/identity-masters/vision-approved.png" }, { id: "celine", name: "Celine", portrait: "/identity-masters/celine-loose.png" }],
  models: [
    { id: "studio 97", name: "Vision 1", person: "vision", userAdded: true, categories: [], poses: [{ id: "p1", label: "Front", preview: "/models/studio 97/front.png" }] },
    { id: "plate x", name: "Plate X", categories: [], poses: [{ id: "p9", label: "Front", preview: "/models/x.png" }] },
  ],
};
const doneFront = { view: "front", status: "done", url: "https://fal.media/front.png", error: "", approved: false, editMode: "simple", humanModelId: "studio 97", poseId: "p1", preservation: { alignment: {} } };
const queued = (view: string) => ({ view, status: "queued", url: "", error: "", approved: false });

type Reply = { status?: number; body: unknown } | "hang";
let routes: Record<string, (init?: RequestInit) => Reply>;
let calls: { url: string; init?: RequestInit }[];

function mockFetch() {
  calls = [];
  vi.stubGlobal("fetch", vi.fn((input: string, init?: RequestInit) => {
    calls.push({ url: input, init });
    const path = input.split("?")[0];
    const method = init?.method || "GET";
    const reply = (routes[`${method} ${path}`] || (() => ({ status: 404, body: { ok: false, error: "not mocked" } })))(init);
    if (reply === "hang") return new Promise(() => {});
    return Promise.resolve(new Response(JSON.stringify(reply.body), { status: reply.status || 200, headers: { "content-type": "application/json" } }));
  }));
}

const workspace = (studio: unknown, revision = 3) => () => ({ body: { ok: true, style: "DT78080", revision, savedAt: "2026-11-24T20:00:00Z", studio } });
const setupWith = (over: Record<string, unknown> = {}) => ({
  picked: [FRONT, BACK], garmentSide: "", fullBase: "", humanModelId: "studio 97", poseId: "p1", engine: "gpt25", fitSource: "style", runKey: "", fixNote: "",
  slots: [doneFront, queued("side"), queued("back"), queued("full")], ...over,
});

/** matchMedia for a window this wide: min-width queries match when the window is at least that wide. */
function stubWidth(width: number) {
  vi.stubGlobal("matchMedia", (q: string) => {
    const min = /min-width:\s*(\d+)px/.exec(q);
    return { matches: min ? width >= Number(min[1]) : false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} };
  });
}

beforeEach(() => {
  routes = {
    "GET /api/model-shots": () => ({ body: catalogue }),
    "GET /api/erp/photos": () => ({ body: gallery }),
    "GET /api/saved-shots": () => ({ body: { ok: true, shots: [] } }),
    "GET /api/model-studio/workspace": () => ({ body: { ok: true, style: "DT78080", revision: 0, savedAt: null, studio: null } }),
    "PUT /api/model-studio/workspace": () => ({ body: { ok: true, style: "DT78080", revision: 4, savedAt: "2026-11-24T20:01:00Z" } }),
  };
  mockFetch();
  stubWidth(1280);
  window.history.replaceState(null, "", "/model-studio");
});
afterEach(() => vi.unstubAllGlobals());

const openStyle = () => window.history.replaceState(null, "", "/model-studio?style=DT78080");

describe("Model Studio page shell", () => {
  it("shows the designed empty state before a style is open", async () => {
    render(<ModelStudio />);
    expect(screen.getByText("Open a style to start")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open" })).toBeDisabled();
  });

  it("shows skeletons while the ERP photos load", async () => {
    routes["GET /api/erp/photos"] = () => "hang";
    openStyle();
    render(<ModelStudio />);
    expect(await screen.findByLabelText("Loading ERP photos")).toHaveAttribute("aria-busy", "true");
    expect(screen.getByLabelText("Opening style")).toBeInTheDocument();
  });

  it("shows a designed error with Try again when the ERP read fails", async () => {
    routes["GET /api/erp/photos"] = () => ({ status: 502, body: { ok: false, error: "The ERP did not answer." } });
    openStyle();
    render(<ModelStudio />);
    expect(await screen.findByText("Could not read the ERP photos")).toBeInTheDocument();
    expect(screen.getByText("The ERP did not answer.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("asks intake questions for what is missing and fills the front from a quick answer", async () => {
    openStyle();
    render(<ModelStudio />);
    expect(await screen.findByText("Which photo is the front of the garment?")).toBeInTheDocument();
    expect(screen.getByText("Catalog (cream set)")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Use the first photo" }));
    await waitFor(() => expect(screen.queryByText("Which photo is the front of the garment?")).not.toBeInTheDocument());
    expect(screen.getByTestId("recipe").textContent).toContain("front");
    expect(screen.getByRole("button", { name: "Generate front preview" })).toBeEnabled();
  });
});

describe("front takes (#4)", () => {
  it("sends one request per take, shows the cost, and Use this makes the take the front", async () => {
    routes["GET /api/model-studio/workspace"] = workspace({ style: "DT78080", title: "Linen Top", type: "", color: "NAVY", person: "vision", drafts: { NAVY: setupWith({ slots: [] }) } });
    routes["POST /api/model-shots"] = (init) => ({ body: { ok: true, taskId: `t-${JSON.parse(String(init?.body)).requestId}` } });
    openStyle();
    render(<ModelStudio />);
    const takes = await screen.findByRole("group", { name: "Front takes" });
    fireEvent.click(within(takes).getByRole("button", { name: "3" }));
    expect(screen.getByTestId("variant-cost").textContent).toBe("3 renders · about $0.36");
    fireEvent.click(screen.getByRole("button", { name: "Generate front preview" }));
    await waitFor(() => expect(calls.filter((c) => c.init?.method === "POST")).toHaveLength(3));
    const ids = calls.filter((c) => c.init?.method === "POST").map((c) => JSON.parse(String(c.init?.body)).requestId);
    expect(ids.every((id, i) => id.endsWith(`-v${i + 1}`))).toBe(true);
    expect(await screen.findByText("Front takes (3)")).toBeInTheDocument();
  });

  it("lists finished takes with Use this", async () => {
    const take = (n: number) => ({ ...doneFront, url: `https://fal.media/take${n}.png`, request: { view: "front", requestId: `r-v${n}` } });
    routes["GET /api/model-studio/workspace"] = workspace({ style: "DT78080", title: "", type: "", color: "NAVY", person: "vision", drafts: { NAVY: setupWith({ takes: [take(1), take(2)] }) } });
    openStyle();
    render(<ModelStudio />);
    const use = await screen.findAllByRole("button", { name: "Use this" });
    expect(use).toHaveLength(2);
    fireEvent.click(use[1]);
    await waitFor(() => expect(screen.queryByText(/Front takes \(/)).not.toBeInTheDocument());
    expect(screen.getByAltText("Front render")).toHaveAttribute("src", "https://fal.media/take2.png");
  });
});

describe("look sheet (#3)", () => {
  it("makes a sheet from the finished front and turns it on for back/side", async () => {
    routes["GET /api/model-studio/workspace"] = workspace({ style: "DT78080", title: "Linen Top", type: "", color: "NAVY", person: "vision", drafts: { NAVY: setupWith({ garmentSide: "https://system.davidani.com/upload/style/DT78080 NAVY_3.jpg" }) } });
    routes["POST /api/model-studio/look-sheet"] = () => ({ body: { ok: true, url: "https://fal.media/sheet.png" } });
    openStyle();
    render(<ModelStudio />);
    fireEvent.click(await screen.findByRole("button", { name: /Make look sheet \(1 render, about \$0\.12\)/ }));
    const post = calls.find((c) => c.url === "/api/model-studio/look-sheet");
    expect(JSON.parse(String(post?.init?.body))).toEqual({
      confirmSpend: true, frontRenderUrl: "https://fal.media/front.png", frontPhotoUrl: FRONT, backPhotoUrl: BACK, sidePhotoUrl: "https://system.davidani.com/upload/style/DT78080 NAVY_3.jpg",
      title: "Linen Top", color: "NAVY", humanModelId: "studio 97", poseId: "p1",
    });
    expect(await screen.findByAltText("Look sheet")).toHaveAttribute("src", "https://fal.media/sheet.png");
    const toggle = screen.getByRole("group", { name: "Use sheet for back and side" });
    fireEvent.click(within(toggle).getByRole("button", { name: "On" }));
    expect(within(toggle).getByRole("button", { name: "On" })).toHaveAttribute("aria-pressed", "true");
  });
});

describe("workspace conflict", () => {
  it("offers Keep my setup / Use saved version when the save is stale", async () => {
    routes["PUT /api/model-studio/workspace"] = () => ({ status: 409, body: { ok: false, error: "conflict", current: { style: "DT78080", revision: 9, savedAt: "2026-11-24T21:00:00Z", studio: { style: "DT78080", title: "Theirs", type: "", color: "NAVY", person: "", drafts: {} } } } });
    openStyle();
    render(<ModelStudio />);
    fireEvent.change(await screen.findByLabelText("Title"), { target: { value: "Mine" } });
    expect(await screen.findByText("This style was saved somewhere else", {}, { timeout: 2000 })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Use saved version" }));
    await waitFor(() => expect(screen.getByLabelText("Title")).toHaveValue("Theirs"));
  });
});

describe("canvas-first layout", () => {
  it("docks Setup beside the stage on a wide screen and closes it from the header", async () => {
    routes["GET /api/model-studio/workspace"] = workspace({ style: "DT78080", title: "Linen Top", type: "", color: "NAVY", person: "vision", drafts: { NAVY: setupWith() } });
    openStyle();
    render(<ModelStudio />);
    const panel = await screen.findByRole("complementary", { name: "Setup" });
    expect(within(panel).getByLabelText("Title")).toHaveValue("Linen Top");
    fireEvent.click(screen.getByRole("button", { name: "Close setup" }));
    expect(screen.queryByRole("complementary", { name: "Setup" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Setup" }));
    expect(await screen.findByRole("complementary", { name: "Setup" })).toBeInTheDocument();
  });

  it("keeps the recipe and the assigned photos in the run bar", async () => {
    routes["GET /api/model-studio/workspace"] = workspace({ style: "DT78080", title: "", type: "", color: "NAVY", person: "vision", drafts: { NAVY: setupWith() } });
    openStyle();
    render(<ModelStudio />);
    const bar = await screen.findByRole("region", { name: "Run" });
    expect(within(bar).getByTestId("recipe").textContent).toContain("Vision");
    expect(within(bar).getByRole("button", { name: "Front photo: change in Setup" })).toBeInTheDocument();
    expect(within(bar).getByRole("button", { name: "Back photo: change in Setup" })).toBeInTheDocument();
  });

  it("puts Setup in a drawer under 1024px, opened from the header", async () => {
    stubWidth(900);
    routes["GET /api/model-studio/workspace"] = workspace({ style: "DT78080", title: "Linen Top", type: "", color: "NAVY", person: "vision", drafts: { NAVY: setupWith() } });
    openStyle();
    render(<ModelStudio />);
    await screen.findByRole("region", { name: "Run" });
    expect(screen.queryByLabelText("Title")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Setup" }));
    expect(await screen.findByLabelText("Title")).toHaveValue("Linen Top");
  });
});
