import ModelStudioClient from "@/components/ModelStudioClient";
import { listHumanModels } from "@/lib/models-registry";

// Force re-render on every request so newly-added pose files (e.g. front2.png)
// in public/models/ are picked up without a rebuild. listHumanModels re-scans
// the filesystem each call.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function ModelStudioPage() {
  const humanModels = listHumanModels();
  return <ModelStudioClient initialHumanModels={humanModels} />;
}
