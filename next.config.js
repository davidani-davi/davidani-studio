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
    // Only the hosts lib/thumb.ts resizes; keep the two lists in step
    // (lib/thumb.test.ts checks with Next's own matcher). Each entry is pinned
    // to one store or folder, with no port and no query string. /_next/image
    // is public (Vercel serves it before proxy.ts), so this list is its fence.
    // ERP style photos sit directly in /upload/style/; a name with an encoded
    // slash or backslash is refused, since the ERP would resolve "..%2F" out of
    // the folder.
    remotePatterns: [
      { protocol: "https", hostname: "cdr9xgexrrfthz5f.public.blob.vercel-storage.com", port: "", search: "" },
      {
        protocol: "https",
        hostname: "system.davidani.com",
        port: "",
        pathname: "/upload/style/!(*%2[fF]*|*%5[cC]*)",
        search: "",
      },
      { protocol: "https", hostname: "fal.media", port: "", search: "" },
      { protocol: "https", hostname: "**.fal.media", port: "", search: "" },
    ],
  },
};

module.exports = nextConfig;
