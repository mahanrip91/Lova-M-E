import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  define: {
    "import.meta.env.VITE_CAPACITOR_BUILD": JSON.stringify("true"),
  },
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
