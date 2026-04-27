import { NextResponse } from "next/server";
import { generate } from "@/lib/fal";
import {
  addGeneratedLibraryViews,
  readLibraryIndex,
  type LibraryStyle,
} from "@/lib/style-library";

export const runtime = "nodejs";
export const maxDuration = 300;

const CORE_VIEWS = ["Front", "Side", "Back", "Detail"] as const;

function hasView(style: LibraryStyle, label: string): boolean {
  return style.views.some((view) => {
    const normalized = view.label.toLowerCase();
    return normalized.includes(label.toLowerCase());
  });
}

function sourceView(style: LibraryStyle) {
  return (
    style.views.find((view) => /front/i.test(view.label)) ||
    style.views.find((view) => /full/i.test(view.label)) ||
    style.views[0]
  );
}

function garmentSummary(style: LibraryStyle): string {
  return [
    style.color,
    style.silhouette,
    style.fabric,
    style.garmentType,
    ...(style.faireBullets || []).slice(0, 3),
  ]
    .filter(Boolean)
    .join(", ");
}

function ecommercePrompt(style: LibraryStyle, view: string): string {
  const summary = garmentSummary(style);
  const base =
    `Create a clean ecommerce product image for style ${style.styleNumber} in ${style.color}. ` +
    `Use the uploaded image as the exact product reference. Preserve the garment category, silhouette, fabric behavior, construction, seams, stitching, trims, hardware, pockets, closure, hem, texture, and distinctive visible details. ` +
    `Do not redesign the garment, do not change color, do not add motifs, and do not create a new style. ` +
    `Use a warm neutral studio background, soft catalog lighting, realistic shadows, and premium boutique ecommerce photography. ` +
    `No text, labels, hang tags, watermarks, props, callouts, collage frames, or extra garments. `;

  if (view === "Front") {
    return (
      base +
      `Show a clear front-facing product view of the garment, centered and fully visible. ` +
      `If the reference includes a model, keep the model only if needed for the garment to read naturally; otherwise isolate the garment cleanly. Product notes: ${summary}.`
    );
  }
  if (view === "Side") {
    return (
      base +
      `Generate a side-view ecommerce image of the same exact garment. Keep the proportions and construction consistent with the source image. ` +
      `If side details are not visible, infer conservatively from the visible construction without inventing new trims, graphics, or closures. Product notes: ${summary}.`
    );
  }
  if (view === "Back") {
    return (
      base +
      `Generate a back-view ecommerce image of the same exact garment. Keep fabric, color, silhouette, seam logic, sleeve/leg shape, hem, waistband/collar/cuffs, and construction consistent with the source. ` +
      `If the back is not visible, infer a simple commercially realistic back based on the front while avoiding new artwork, pockets, logos, or trims unless clearly implied. Product notes: ${summary}.`
    );
  }
  return (
    base +
    `Generate a close-up detail ecommerce image that highlights the most sellable visible construction detail from the garment, such as fabric texture, stitching, trim, embroidery, pocket, closure, cuff, waistband, or hardware. ` +
    `The detail must come from the uploaded garment and should not invent a new feature. Product notes: ${summary}.`
  );
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const styleId = String(body?.styleId || "");
    const index = await readLibraryIndex();
    const style = index.styles.find((item) => item.id === styleId);
    if (!style) {
      return NextResponse.json({ ok: false, error: "Library style not found." }, { status: 404 });
    }

    const source = sourceView(style);
    if (!source?.imageUrl) {
      return NextResponse.json(
        { ok: false, error: "This style has no source image to expand." },
        { status: 400 }
      );
    }

    const missingViews = CORE_VIEWS.filter((view) => !hasView(style, view));
    const viewsToGenerate = missingViews.length ? missingViews : (["Detail"] as const);
    const generated: Array<{ label: string; imageUrl: string; prompt: string }> = [];
    const failures: Array<{ label: string; error: string }> = [];

    for (const view of viewsToGenerate) {
      const prompt = ecommercePrompt(style, view);
      try {
        const result = await generate({
          modelId: "gpt-image",
          prompt,
          imageUrls: [source.imageUrl],
          aspectRatio: view === "Detail" ? "1:1" : "4:5",
          resolution: "2K",
          format: "png",
          numImages: 1,
          useDefaultReference: false,
        });
        const imageUrl = result.images[0]?.url;
        if (!imageUrl) throw new Error("Image model returned no image.");
        generated.push({ label: view, imageUrl, prompt });
      } catch (err: any) {
        failures.push({ label: view, error: err?.message || "Generation failed" });
      }
    }

    if (!generated.length) {
      return NextResponse.json(
        {
          ok: false,
          error: failures[0]?.error || "No ecommerce views were generated.",
          failures,
        },
        { status: 500 }
      );
    }

    const updated = await addGeneratedLibraryViews({
      styleId,
      views: generated,
    });

    return NextResponse.json({ ok: true, style: updated, generated, failures });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || "Ecommerce set generation failed." },
      { status: 500 }
    );
  }
}
