export type StudioTab = "home" | "image" | "playground" | "photoshoot" | "model" | "model-beta" | "prompt" | "techpack" | "faire-seo" | "inspiration" | "library" | "cad" | "references" | "identities";

export const STUDIO_TOOLS: { id: StudioTab; label: string; href: string; description: string }[] = [
  { id: "image", label: "Product photos", href: "/", description: "Create product and flat-lay photographs." },
  { id: "model", label: "Single model", href: "/model-studio", description: "Photograph a garment on one of your models." },
  { id: "model-beta", label: "Multiple models", href: "/model-studio-beta", description: "Compose a group shot with multiple models." },
  { id: "photoshoot", label: "Photoshoots", href: "/photoshoot-studio", description: "Build a consistent set of campaign photographs." },
  { id: "prompt", label: "Prompts", href: "/prompt-studio", description: "Write and refine a creative brief." },
  { id: "techpack", label: "Techpacks", href: "/techpack-studio", description: "Prepare a technical pack from style details." },
  { id: "cad", label: "CAD extractor", href: "/cad-extractor", description: "Extract and prepare clean garment artwork." },
  { id: "faire-seo", label: "Faire listings", href: "/faire-seo", description: "Prepare titles and copy for your listings." },
  { id: "inspiration", label: "Inspiration", href: "/inspiration", description: "Collect references and new directions." },
  { id: "library", label: "Library", href: "/library", description: "Find saved images and references." },
  { id: "references", label: "Model library", href: "/admin/models", description: "Manage models, poses, and garment references." },
  { id: "identities", label: "Reference identities", href: "/reference-identity-studio", description: "Prepare consistent reference identities." },
];
