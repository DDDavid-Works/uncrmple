/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { DESCRIPTION, SEARCH_TITLE } from "./src/config";
import { contentSecurityPolicyFor, SECURITY_HEADERS } from "./src/security-headers";

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

export default defineConfig({
  plugins: [
    react(),
    {
      // Fill %SEARCH_TITLE% / %DESCRIPTION% in index.html from src/config.ts, so branding lives in one place.
      name: "branding",
      transformIndexHtml: (html) =>
        html
          .replaceAll("%SEARCH_TITLE%", escapeHtml(SEARCH_TITLE))
          .replaceAll("%DESCRIPTION%", escapeHtml(DESCRIPTION)),
    },
    {
      // Blog posts have no HTML file of their own (scripts/prerender.mjs writes them at build time), so the
      // dev server renders /blog/ and /blog/<slug>/ on request into the blog shell, letting a post be
      // previewed as it is written. The SEO tags are added only by the build.
      name: "blog-dev-pages",
      apply: "serve",
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          const url = ((req as { url?: string }).url ?? "").split("?")[0]!;
          if (!/^\/blog(\/[a-z0-9-]*\/?)?$/.test(url)) return next();
          try {
            const { pages } = (await server.ssrLoadModule("/src/entry-server.tsx")) as typeof import("./src/entry-server");
            const path = url.endsWith("/") ? url : `${url}/`;
            const page = pages.find((p) => p.file === `${path.slice(1)}index.html`);
            if (!page) return next();
            const { default: template } = (await server.ssrLoadModule("/blog/index.html?raw")) as { default: string };
            const shell = await server.transformIndexHtml(url, template);
            res.setHeader("Content-Type", "text/html; charset=utf-8");
            res.end(
              shell.replace("<!--head-->", () => `<title>${escapeHtml(page.title)}</title>`).replace("<!--app-html-->", () => page.render()),
            );
          } catch (error) {
            next(error);
          }
        });
      },
    },
    {
      // `vite preview` sends the production headers, with the worker's stricter policy on its script.
      name: "security-headers",
      configurePreviewServer(server) {
        server.middlewares.use((req, res, next) => {
          for (const [name, value] of Object.entries(SECURITY_HEADERS)) res.setHeader(name, value);
          res.setHeader("Content-Security-Policy", contentSecurityPolicyFor((req as { url?: string }).url ?? "/"));
          next();
        });
      },
    },
  ],
  build: {
    // The app, plus static pages that scripts/prerender.mjs fills from src/entry-server.tsx. Blog posts have
    // no entry of their own: each is written into a copy of the blog shell.
    rolldownOptions: {
      input: { main: "index.html", privacy: "privacy/index.html", terms: "terms/index.html", blog: "blog/index.html" },
    },
  },
  server: { port: 7200, strictPort: true },
  // The dev server is left without them: its hot reload needs inline scripts and its own connections.
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
