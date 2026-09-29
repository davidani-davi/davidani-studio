export type StudioTab =
  | "image"
  | "playground"
  | "photoshoot"
  | "model"
  | "model-beta"
  | "prompt"
  | "techpack"
  | "faire-seo"
  | "inspiration"
  | "library"
  | "cad"
  | "references"
  | "identities";

type NavItem = { id: StudioTab; label: string; href: string };

/** Paper rule 4: every destination is a visible link, never a dropdown. Studios are the chips. */
export const STUDIO_PAGES: NavItem[] = [
  { id: "image", label: "Image studio", href: "/" },
  { id: "model", label: "Single model", href: "/model-studio" },
  { id: "model-beta", label: "Multi model", href: "/model-studio-beta" },
  { id: "photoshoot", label: "Photoshoot", href: "/photoshoot-studio" },
  { id: "library", label: "Library", href: "/library" },
  { id: "inspiration", label: "Inspiration", href: "/inspiration" },
];

/** The less-used tools, as a quiet row of text links under the chips. */
export const STUDIO_TOOLS: NavItem[] = [
  { id: "playground", label: "Image playground", href: "/image-playground" },
  { id: "prompt", label: "Prompt studio", href: "/prompt-studio" },
  { id: "techpack", label: "Techpack studio", href: "/techpack-studio" },
  { id: "cad", label: "CAD extractor", href: "/cad-extractor" },
  { id: "faire-seo", label: "Faire SEO", href: "/faire-seo" },
  { id: "references", label: "Model library", href: "/admin/models" },
  { id: "identities", label: "Reference identities", href: "/reference-identity-studio" },
];
