import { fileURLToPath } from "node:url";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

const sourceRoot = fileURLToPath(new URL("./src", import.meta.url));

export default defineConfig({
  base: "./",
  plugins: [tailwindcss(), svelte()],
  resolve: {
    alias: {
      "$lib": `${sourceRoot}/lib`,
      "$components": `${sourceRoot}/components`,
    },
  },
  optimizeDeps: {
    exclude: ["@svadmin/core"],
  },
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
