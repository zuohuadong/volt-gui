import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vitest/config";

export default defineConfig({
  root: new URL(".", import.meta.url).pathname,
  plugins: [svelte()],
  test: {
    pool: "forks",
    maxWorkers: 1,
    fileParallelism: false,
  },
});
