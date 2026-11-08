import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  base: "./",
  nitro: false,
  tanstackStart: {
    prerender: { concurrency: 1 },
    spa: {
      enabled: true,
      maskPath: "/",
      prerender: {
        outputPath: "/_shell",
        crawlLinks: false,
        retryCount: 0,
      },
    },
  },
});
