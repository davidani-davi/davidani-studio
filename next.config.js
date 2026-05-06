/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: { bodySizeLimit: "20mb" },
  },
  outputFileTracingExcludes: {
    "/api/*": ["./public/models/**/*"],
    "/api/analyze-model": ["./public/models/**/*"],
    "/api/generate-model": ["./public/models/**/*"],
    "/model-studio": ["./public/models/**/*"],
    "/model-studio-beta": ["./public/models/**/*"],
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
