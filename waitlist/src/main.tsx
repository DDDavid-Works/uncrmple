import { StrictMode } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";

const container = document.getElementById("root");
if (!container) throw new Error("Root element #root not found");

const app = (
  <StrictMode>
    <App />
  </StrictMode>
);

// Pre-rendered pages already contain markup; hydrate it. Dev server starts empty.
if (container.hasChildNodes()) {
  hydrateRoot(container, app);
} else {
  createRoot(container).render(app);
}
