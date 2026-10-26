/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: { port: 7200, strictPort: true },
  preview: { port: 7200, strictPort: true },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/tests/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    // The OpenCV.js export is a thenable emscripten Module; interop on an externalized CJS
    // package would make `import()` try to await it.
    server: { deps: { inline: ["@techstark/opencv-js"] } },
  },
});
