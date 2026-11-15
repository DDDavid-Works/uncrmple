import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { trackPageview } from "./lib/analytics/track";
// Bundled with the app (not loaded from a font CDN), so no third-party request is made.
import "@fontsource-variable/rubik";
import "./styles.css";

trackPageview();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
