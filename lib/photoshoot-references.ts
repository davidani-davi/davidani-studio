export interface PhotoshootReference {
  id: string;
  label: string;
  url: string;
}

export const PHOTOSHOOT_REFERENCES: PhotoshootReference[] = [
  { id: "loft-window-1", label: "Sunlit loft · standing", url: "/photoshoot-references/KIC_155-7061-01996-276_life1.jpg" },
  { id: "loft-window-2", label: "Sunlit loft · seated", url: "/photoshoot-references/KIC_155-7061-01996-276_life2.jpg" },
  { id: "warm-interior", label: "Warm interior · doorway", url: "/photoshoot-references/KIC_155-7060-01995-276_life2.jpg" },
  { id: "apartment", label: "Apartment · soft daylight", url: "/photoshoot-references/KIC_156-6252-01210-330_life2.jpg" },
  { id: "fireplace", label: "Fireplace editorial", url: "/photoshoot-references/KIC_156-6286-01211-330_life1.jpg" },
  { id: "studio-1", label: "Studio · clean daylight", url: "/photoshoot-references/KIC_156-6391-01291-416_life1.jpg" },
  { id: "studio-2", label: "Studio · relaxed pose", url: "/photoshoot-references/KIC_156-6391-01291-416_life2.jpg" },
  { id: "interior-editorial", label: "Interior editorial", url: "/photoshoot-references/KIC_144-6142-00529-438_life1.jpg" },
  { id: "street-flash", label: "Street · direct flash", url: "/photoshoot-references/editorial-street.jpeg" },
];

export function getPhotoshootReference(id: string): PhotoshootReference | null {
  return PHOTOSHOOT_REFERENCES.find((reference) => reference.id === id) ?? null;
}
