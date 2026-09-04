/**
 * How the composer names the model and pose in one line.
 *
 * Poses are named after the model they belong to — Kylie's poses are "Kylie
 * 1", "Kylie 2" — so printing the model and the pose as two facts gave
 * "Kylie · Kylie 1": the same word twice, and the run's actual variable (which
 * pose) buried at the end of it. When the pose name starts with the model's,
 * the shared part is printed once and only the distinguishing tail follows.
 */
export interface ModelPoseLine {
  /** Always shown: who is wearing it. */
  model: string;
  /** The pose, already stripped of a repeated model name. Empty when the pose
   *  adds nothing (an unnamed pose, or one identical to the model name). */
  pose: string;
  /** True when the pose is a continuation of the name rather than a new fact,
   *  so the caller can print it without a separator. */
  joined: boolean;
}

export function modelPoseLine(modelName: string, poseName: string): ModelPoseLine {
  const model = (modelName || "").trim();
  const pose = (poseName || "").trim();
  if (!pose || pose.toLowerCase() === model.toLowerCase()) {
    return { model, pose: "", joined: false };
  }
  if (model && pose.toLowerCase().startsWith(model.toLowerCase())) {
    return { model, pose: pose.slice(model.length).trim(), joined: true };
  }
  return { model, pose, joined: false };
}
