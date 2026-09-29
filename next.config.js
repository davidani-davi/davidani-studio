/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: { bodySizeLimit: "20mb" },
  },
  outputFileTracingExcludes: {
    "/api/*": ["./public/models/**/*", "./public/pants-references/**/*"],
    "/api/analyze-model": ["./public/models/**/*", "./public/pants-references/**/*"],
    "/api/generate-model": ["./public/models/**/*", "./public/pants-references/**/*"],
    "/model-studio": ["./public/models/**/*", "./public/pants-references/**/*"],
    "/model-studio-beta": ["./public/models/**/*", "./public/pants-references/**/*"],
  },
  images: {
    // Render URLs never change, so a resized copy can live at the edge for a
    // month (lib/thumb.ts). Hosts must match REMOTE_HOSTS there.
    minimumCacheTTL: 2678400,
    remotePatterns: [
      { protocol: "https", hostname: "**.public.blob.vercel-storage.com" },
      { protocol: "https", hostname: "system.davidani.com" },
      { protocol: "https", hostname: "**.fal.media" },
      { protocol: "https", hostname: "**.fal.ai" },
      { protocol: "https", hostname: "v3.fal.media" },
      { protocol: "https", hostname: "fal.media" },
    ],
  },
};

module.exports = nextConfig;
