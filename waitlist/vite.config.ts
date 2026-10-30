import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    // One HTML entry per page; scripts/prerender.mjs fills each with server-rendered markup.
    rolldownOptions: {
      input: { main: "index.html", privacy: "privacy/index.html", terms: "terms/index.html" },
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    include: ["tests/**/*.test.{ts,tsx}"],
    setupFiles: ["tests/setup.ts"],
  },
});
