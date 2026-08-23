import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig, type Plugin } from "vite";
import { fileURLToPath } from "node:url";

function stripCrossorigin(): Plugin {
  return {
    name: "strip-crossorigin",
    enforce: "post",
    transformIndexHtml: (html) => html.replace(/\s+crossorigin(?==["']|[\s/>])/g, ""),
  };
}

export default defineConfig(({ mode }) => {
  const electronBuild = mode === "electron";

  return {
    plugins: [svelte(), stripCrossorigin()],
    base: "./",
    build: {
      outDir: electronBuild ? "dist-electron" : "dist",
      emptyOutDir: true,
      target: "es2021",
      cssMinify: "esbuild",
      chunkSizeWarningLimit: 650,
      rolldownOptions: {
        ...(electronBuild
          ? { input: fileURLToPath(new URL("./electron.html", import.meta.url)) }
          : {}),
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
  };
});
