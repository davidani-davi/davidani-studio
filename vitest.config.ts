import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    // Kobra's ImageGeneration and Tooltip use Scritto, whose SSR entry imports
    // its own CSS; inline it so Vite handles the stylesheet instead of Node.
    server: { deps: { inline: [/@scritto\//] } },
  },
});
