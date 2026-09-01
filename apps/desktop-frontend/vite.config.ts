import { svelte } from "@sveltejs/vite-plugin-svelte";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  plugins: [tailwindcss(), svelte()],
  ssr: {
    noExternal: [
      "@tanstack/svelte-query",
      "@xyflow/svelte",
      "@xyflow/system",
      "katex",
      "streamdown-svelte",
    ],
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
