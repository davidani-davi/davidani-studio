export interface UploadedImage {
  url: string;
  name: string;
}

export interface HistoryItem {
  id: string;
  timestamp: number;
  modelId: string;
  prompt: string;
  imageUrls: string[]; // outputs
  referenceUrls: string[];
  aspect: string;
  resolution: string;
  styleNumber?: string;
  styleName?: string;
  // Batch-only metadata. When a run is produced by Batch generate, we store
  // the per-image prompt used for each output at the same index in
  // `imageUrls`. Single-image runs leave this undefined.
  prompts?: string[];
  // Marks a run as produced by Batch so we can label it distinctly in the UI.
  batch?: boolean;
}
