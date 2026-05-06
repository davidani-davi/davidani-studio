import ModelStudioClient from "@/components/ModelStudioClient";
import { listHumanModels } from "@/lib/models-registry";

// Force re-render on every request so newly-added pose files in
// public/models/ are picked up without a rebuild.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function ModelStudioBetaPage() {
  const humanModels = listHumanModels();
  return <ModelStudioClient initialHumanModels={humanModels} beta />;
}
