import App from "./App.svelte";
import { mount } from "svelte";

// svadmin/ui design system — provides OKLCH design tokens, component styles,
// light/dark theme, and admin-ready typography. Workbench-specific layout
// overrides live in app.css.
import "@svadmin/ui/app.css";
import "./app.css";

const target = document.getElementById("app");

if (!target) {
  throw new Error("Missing #app mount target");
}

export default mount(App, { target });
