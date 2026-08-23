import { mount } from "svelte";
import ElectronWorkbench from "./components/ElectronWorkbench.svelte";
import { initAppearance } from "./lib/appearance";

import "@svadmin/ui/app.css";
import "./app.css";

const target = document.getElementById("app");

if (!target) {
  throw new Error("Missing #app mount target");
}

initAppearance();

export default mount(ElectronWorkbench, { target });
