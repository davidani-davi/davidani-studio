import { uploadWithProgress } from "@/components/RunProgress";
import { canUploadDirect, type DirectUploadFile } from "@/lib/direct-upload";
import { resizeIfNeeded } from "@/lib/image-resize";

export type UploadedFile = { name: string; url: string };

type Target = { name: string; uploadUrl: string; url: string } | null;

export type UploadDeps = {
  /** Signed fal URLs, one per file, `null` where the file must use /api/upload. */
  initiate(files: DirectUploadFile[]): Promise<Target[]>;
  /** PUT one file to its signed URL, reporting bytes sent. */
  put(uploadUrl: string, file: File, onLoaded: (bytes: number) => void): Promise<void>;
  /** The old path: POST to /api/upload, which forwards (or converts) to fal. */
  viaServer(label: string, files: File[], onProgress: (fraction: number) => void): Promise<UploadedFile[]>;
};

/**
 * Upload photos for a studio: shrink them in the browser (lib/image-resize.ts),
 * then send PNG/JPEG straight to fal storage (one hop instead of two through
 * Vercel). Anything that can't go direct, or whose direct upload fails, goes
 * through /api/upload as before, so the worst case is today's behaviour.
 * Results come back in the order the files were given.
 */
export async function uploadImages(
  label: string,
  files: File[],
  opts: {
    onProgress?: (fraction: number) => void;
    resize?: { skipIfBytesUnder?: number };
    deps?: Partial<UploadDeps>;
  } = {}
): Promise<UploadedFile[]> {
  const deps: UploadDeps = { ...defaultDeps, ...opts.deps };
  const resized = await Promise.all(files.map((f) => resizeIfNeeded(f, opts.resize)));
  if (resized.length === 0) return [];

  const total = resized.reduce((sum, f) => sum + f.size, 0) || 1;
  const sent = resized.map(() => 0);
  const report = () =>
    opts.onProgress?.(Math.min(1, sent.reduce((a, b) => a + b, 0) / total));

  const wanted = resized.map((f) => ({ name: f.name, type: f.type, size: f.size }));
  let targets: Target[] = resized.map(() => null);
  if (wanted.some(canUploadDirect)) {
    try {
      const got = await deps.initiate(wanted);
      if (Array.isArray(got) && got.length === resized.length) targets = got;
    } catch (err) {
      console.warn(`[${label}] direct upload unavailable, using /api/upload:`, err);
    }
  }

  const results: (UploadedFile | null)[] = await Promise.all(
    resized.map(async (file, i) => {
      const target = targets[i];
      if (!target) return null;
      try {
        await deps.put(target.uploadUrl, file, (bytes) => {
          sent[i] = bytes;
          report();
        });
        sent[i] = file.size;
        report();
        return { name: target.name, url: target.url };
      } catch (err) {
        console.warn(`[${label}] direct upload failed for ${file.name}, using /api/upload:`, err);
        sent[i] = 0;
        report();
        return null;
      }
    })
  );

  const rest = results.flatMap((r, i) => (r ? [] : [i]));
  if (rest.length > 0) {
    const viaServer = await deps.viaServer(
      label,
      rest.map((i) => resized[i]),
      (fraction) => {
        for (const i of rest) sent[i] = resized[i].size * fraction;
        report();
      }
    );
    if (!Array.isArray(viaServer) || viaServer.length !== rest.length) {
      throw new Error(`${label}: upload returned ${viaServer?.length ?? 0} of ${rest.length} files`);
    }
    rest.forEach((i, k) => {
      results[i] = viaServer[k];
    });
  }

  return results as UploadedFile[];
}

const defaultDeps: UploadDeps = {
  async initiate(files) {
    const res = await fetch("/api/upload/direct", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ files }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.ok) throw new Error(data?.error || `HTTP ${res.status}`);
    return data.targets;
  },

  put(uploadUrl, file, onLoaded) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", uploadUrl);
      xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
      xhr.timeout = 120_000;
      xhr.upload.onprogress = (e) => onLoaded(e.loaded);
      xhr.onload = () =>
        xhr.status >= 200 && xhr.status < 300
          ? resolve()
          : reject(new Error(`storage returned HTTP ${xhr.status}`));
      xhr.onerror = () => reject(new Error("network error"));
      xhr.ontimeout = () => reject(new Error("timed out"));
      xhr.send(file);
    });
  },

  async viaServer(label, files, onProgress) {
    const form = new FormData();
    files.forEach((f) => form.append("files", f));
    const data = await uploadWithProgress(label, "/api/upload", form, onProgress);
    return data.uploads;
  },
};
