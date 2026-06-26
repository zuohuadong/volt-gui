import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig, type Plugin } from "vite";

function stripCrossorigin(): Plugin {
  return {
    name: "strip-crossorigin",
    enforce: "post",
    transformIndexHtml: (html) => html.replace(/\s+crossorigin(?==["']|[\s/>])/g, ""),
  };
}

export default defineConfig({
  plugins: [svelte(), stripCrossorigin()],
  base: "./",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "es2021",
    cssMinify: "esbuild",
    chunkSizeWarningLimit: 650,
    rolldownOptions: {
      checks: {
        pluginTimings: false,
      },
    },
  },
  server: {
    host: "127.0.0.1",
    port: 5174,
    strictPort: true,
  },
});
