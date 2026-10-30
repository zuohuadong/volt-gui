import { svelte } from "@sveltejs/vite-plugin-svelte";
import { svelteTesting } from "@testing-library/svelte/vite";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  plugins: [svelte(), svelteTesting({ autoCleanup: false })],
  resolve: {
    conditions: ["browser", "module", "development"],
    alias: {
      "$lib": fileURLToPath(new URL("./src/lib", import.meta.url)),
      "$components": fileURLToPath(new URL("./src/components", import.meta.url)),
      "katex/dist/katex.min.css": fileURLToPath(new URL("./src/test-empty.css", import.meta.url)),
    },
  },
  ssr: {
    resolve: {
      conditions: ["browser", "module", "development"],
    },
  },
  test: {
    server: {
      deps: {
        inline: ["@svadmin/ai-elements", "@svadmin/ui", "streamdown"],
      },
    },
    pool: "forks",
    maxWorkers: 1,
    fileParallelism: false,
    css: false,
  },
});
