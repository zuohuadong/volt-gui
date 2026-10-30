import "@svadmin/ui/app.css";
import "./app.css";
import "./plugins-mcp.css";
import "./workbench-theme.css";

import { mount } from "svelte";
import App from "./App.svelte";
import { renderBootFailure } from "$lib/boot-failure";

const target = document.getElementById("app");
if (!target) throw new Error("Missing #app mount target");

try {
  mount(App, { target });
} catch (error) {
  console.error("[VoltUI] Failed to mount the workbench", error);
  renderBootFailure(target, error);
}
