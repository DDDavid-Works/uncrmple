import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { trackPageview } from "./lib/analytics/track";
// Bundled with the app (not loaded from a font CDN), so no third-party request is made.
import "@fontsource-variable/rubik";
import "./styles.css";
// The pre-rendered intro (src/home/HomeIntro.tsx) is drawn in the legal pages' layout until the app starts.
import "./legal/legal.css";

trackPageview();

// createRoot replaces the pre-rendered intro in #root with the app.
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
