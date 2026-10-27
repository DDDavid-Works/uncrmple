import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
// Bundled with the app (not loaded from a font CDN), so no third-party request is made.
import "@fontsource-variable/space-grotesk";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
