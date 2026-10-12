import ModelStudioClient from "@/components/ModelStudioClient";
import { listAllHumanModelsForPage } from "@/lib/human-models-cached";
import { isDerivedPlate } from "@/lib/plate-framing";

// Rendered per request from a 5-minute copy of the catalogue
// (lib/human-models-cached.ts); the client re-reads /api/models on mount, so
// a newly added or deleted reference still shows up within a second.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ModelStudioBetaPage() {
  const humanModels = await listAllHumanModelsForPage();
  return <ModelStudioClient initialHumanModels={humanModels.filter(m => !isDerivedPlate(m.id))} beta />;
}
