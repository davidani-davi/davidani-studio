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
    remotePatterns: [
      { protocol: "https", hostname: "**.fal.media" },
      { protocol: "https", hostname: "**.fal.ai" },
      { protocol: "https", hostname: "v3.fal.media" },
      { protocol: "https", hostname: "fal.media" },
    ],
  },
};

module.exports = nextConfig;
