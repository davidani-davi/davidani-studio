import ModelStudioClient from "@/components/ModelStudioClient";
import { listAllHumanModels } from "@/lib/models-registry";

// Force re-render on every request so newly-added pose files (e.g. front2.png)
// in public/models/ are picked up without a rebuild. listAllHumanModels
// re-scans the filesystem (and re-reads Blob user models) each call.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ModelStudioPage() {
  const humanModels = await listAllHumanModels();
  return <ModelStudioClient initialHumanModels={humanModels} />;
}
