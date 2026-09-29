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
    // Hosts lib/thumb.ts resizes; keep the two lists in step (lib/thumb.test.ts
    // checks). /_next/image sits outside the password gate, so each new entry is
    // pinned to our own store and folder, not a whole CDN.
    remotePatterns: [
      { protocol: "https", hostname: "cdr9xgexrrfthz5f.public.blob.vercel-storage.com" },
      { protocol: "https", hostname: "system.davidani.com", pathname: "/upload/**" },
      { protocol: "https", hostname: "**.fal.media" },
      { protocol: "https", hostname: "**.fal.ai" },
      { protocol: "https", hostname: "v3.fal.media" },
      { protocol: "https", hostname: "fal.media" },
    ],
  },
};

module.exports = nextConfig;
