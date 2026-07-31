export interface PhotoshootVariation {
  label: string;
  instruction: string;
}

export const PHOTOSHOOT_VARIATIONS: PhotoshootVariation[] = [
  { label: "Walking three-quarter", instruction: "Use a three-quarter camera angle and capture the model walking diagonally across the frame, looking off-frame, with natural garment movement." },
  { label: "Seated side profile", instruction: "Create a seated side-profile composition with the model leaning slightly forward and interacting naturally with nearby furniture." },
  { label: "Low-angle standing", instruction: "Use a restrained low camera position and a full-body standing pose with asymmetrical weight, one hand in a pocket, and the face turned toward the light." },
  { label: "Over-the-shoulder", instruction: "Photograph the model in a back three-quarter orientation looking over one shoulder, while keeping the garment construction clearly readable." },
  { label: "Candid adjustment", instruction: "Capture a candid mid-action moment while the model adjusts a cuff, collar, zipper, or hem and looks down rather than toward camera." },
  { label: "Wide environmental", instruction: "Pull back to a wider environmental composition, place the model off-center, and show her moving through the space with the complete body visible." },
  { label: "Lateral movement", instruction: "Use an eye-level side angle and catch the model crossing laterally through the scene with one arm in motion and an unposed expression." },
  { label: "Leaning editorial", instruction: "Create a relaxed leaning pose against an architectural surface from a front three-quarter view, with crossed ankles and gaze directed outside the frame." },
  { label: "Turning moment", instruction: "Capture the instant the model turns her torso away from camera while her feet continue forward, producing a spontaneous transitional gesture." },
  { label: "Elevated viewpoint", instruction: "Use a modest elevated camera viewpoint with the model standing or stepping below, looking toward an object in the setting rather than the camera." },
  { label: "Hands occupied", instruction: "Give the model a natural interaction with a prop appropriate to the location, keeping both hands occupied and the pose documentary rather than staged." },
  { label: "Quiet symmetrical", instruction: "Use a calm near-symmetrical environmental frame but an informal asymmetric body pose, with the model looking away and one foot slightly forward." },
];

export function getPhotoshootVariation(index: number): PhotoshootVariation {
  const normalized = Number.isFinite(index) ? Math.max(0, Math.floor(index)) : 0;
  return PHOTOSHOOT_VARIATIONS[normalized % PHOTOSHOOT_VARIATIONS.length];
}
