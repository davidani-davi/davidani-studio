import ModelStudioClient from "@/components/ModelStudioClient";
import { listHumanModels } from "@/lib/models-registry";

export default function ModelStudioPage() {
  const humanModels = listHumanModels();
  return <ModelStudioClient initialHumanModels={humanModels} />;
}
