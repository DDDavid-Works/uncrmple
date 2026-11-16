// Styles for the static legal pages. The built pages already hold their text (scripts/prerender.mjs);
// only the dev server, which serves the bare HTML shell, renders it here so the page can be previewed.
import "@fontsource-variable/rubik";
import "../styles.css";
import "./legal.css";

if (import.meta.env.DEV) {
  const root = document.getElementById("root");
  if (root && !root.firstElementChild) {
    void import("./dev-render").then((m) => m.renderInDev(root));
  }
}
