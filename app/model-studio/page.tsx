import ModelStudio from "@/components/model-studio/ModelStudio";

// The web Model Studio (Simple garment swap). The client reads the catalogue, ERP photos and the style's
// workspace itself, so the page renders at once with skeletons. The old page lives at /model-studio-legacy.
export const dynamic = "force-dynamic";

export default function ModelStudioPage() {
  return <ModelStudio />;
}
