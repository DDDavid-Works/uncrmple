import { defineConfig, type Plugin } from "vitest/config";
import react from "@vitejs/plugin-react";

/**
 * Blog posts have no HTML file of their own (scripts/prerender.mjs writes them at build time), so in
 * dev this renders /blog/ and /blog/<slug>/ on request into the blog shell, letting a post be previewed
 * as it is written. SEO tags are added only by the build.
 */
function blogDevPages(): Plugin {
  return {
    name: "blog-dev-pages",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = ((req as { url?: string }).url ?? "").split("?")[0]!;
        if (!url.startsWith("/blog")) return next();
        try {
          const { pages } = await server.ssrLoadModule("/src/entry-server.tsx");
          const page = (pages as { path: string; title: string; render: () => string }[]).find(
            (p) => p.path === url || p.path === `${url}/`,
          );
          if (!page) return next();
          const { default: template } = await server.ssrLoadModule("/blog/index.html?raw");
          const shell = await server.transformIndexHtml(url, template as string);
          res.setHeader("Content-Type", "text/html; charset=utf-8");
          res.end(shell.replace("<!--head-->", `<title>${page.title}</title>`).replace("<!--app-html-->", page.render()));
        } catch (error) {
          next(error);
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), blogDevPages()],
  build: {
    // One HTML entry per page; scripts/prerender.mjs fills each with server-rendered markup.
    rolldownOptions: {
      input: { main: "index.html", privacy: "privacy/index.html", terms: "terms/index.html", blog: "blog/index.html" },
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    include: ["tests/**/*.test.{ts,tsx}"],
    setupFiles: ["tests/setup.ts"],
  },
});
