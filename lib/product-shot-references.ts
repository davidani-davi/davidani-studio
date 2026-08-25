// Generated from public/product-shots. Used only by Image Studio reference selection.

export interface ProductShotReference {
  id: string;
  label: string;
  path: string;
  /** True for team-saved presets loaded from /api/user-references (deletable). */
  userAdded?: boolean;
}

export const PRODUCT_SHOT_REFERENCES = [
  // MANUAL OVERRIDE LIST. The canvas is normally chosen automatically from the
  // garment category (lib/canvas-registry.ts); this list is what the picker
  // shows when someone wants to force a specific one. The approved per-category
  // canvases come first so an override is usually still an on-target choice.
  // Index 0 also seeds the picker preview before any routing has happened.
  {
    "id": "canvas-outerwear-front",
    "label": "Outerwear front",
    "path": "/product-shots/canvas-outerwear-front.png"
  },
  {
    "id": "canvas-outerwear-back",
    "label": "Outerwear back",
    "path": "/product-shots/canvas-outerwear-back.png"
  },
  {
    "id": "canvas-top-front",
    "label": "Top / knitwear",
    "path": "/product-shots/canvas-top-front.png"
  },
  {
    "id": "canvas-dress-front",
    "label": "Dress",
    "path": "/product-shots/canvas-dress-front.png"
  },
  {
    "id": "canvas-skirt-front",
    "label": "Skirt",
    "path": "/product-shots/canvas-skirt-front.png"
  },
  {
    "id": "canvas-set-front",
    "label": "Two-piece set",
    "path": "/product-shots/canvas-set-front.png"
  },
  {
    "id": "style-reference",
    "label": "Reference 1",
    "path": "/product-shots/style-reference.png"
  },
  {
    "id": "style-reference-2",
    "label": "Reference 2",
    "path": "/product-shots/style-reference-2.png"
  },
  {
    "id": "style-reference-3",
    "label": "Reference 3",
    "path": "/product-shots/style-reference-3.png"
  },
  {
    "id": "style-reference-6",
    "label": "Reference 5",
    "path": "/product-shots/style-reference-6.png"
  },
  {
    "id": "style-reference-9",
    "label": "Reference 6",
    "path": "/product-shots/style-reference-9.png"
  }
] satisfies ProductShotReference[];
