// Generated from public/product-shots. Used only by Image Studio reference selection.

export interface ProductShotReference {
  id: string;
  label: string;
  path: string;
  /** True for team-saved presets loaded from /api/user-references (deletable). */
  userAdded?: boolean;
}

export const PRODUCT_SHOT_REFERENCES = [
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
    "id": "style-reference-4",
    "label": "Reference 4",
    "path": "/product-shots/style-reference-4.png"
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
