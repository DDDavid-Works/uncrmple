// Build-time pre-render: injects server-rendered markup and SEO tags into dist/index.html.
import { readFile, writeFile, rm } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const { render, seo } = await import(pathToFileURL(path.join(root, "dist-server", "entry-server.js")).href);

const esc = (s) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
const url = seo.siteUrl ? `${seo.siteUrl}/` : "";

const head = [
  `<title>${esc(seo.title)}</title>`,
  `<meta name="description" content="${esc(seo.description)}" />`,
  `<meta property="og:type" content="website" />`,
  `<meta property="og:title" content="${esc(seo.title)}" />`,
  `<meta property="og:description" content="${esc(seo.description)}" />`,
  `<meta name="twitter:card" content="summary" />`,
  url && `<link rel="canonical" href="${url}" />`,
  url && `<meta property="og:url" content="${url}" />`,
  `<script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: seo.name,
    description: seo.description,
    ...(url && { url }),
  }).replace(/</g, "\\u003c")}</script>`,
]
  .filter(Boolean)
  .join("\n    ");

const indexPath = path.join(root, "dist", "index.html");
const html = (await readFile(indexPath, "utf8"))
  .replace("<!--head-->", () => head)
  .replace("<!--app-html-->", () => render());
if (html.includes("<!--app-html-->") || html.includes("<!--head-->")) {
  throw new Error("Pre-render placeholders were not replaced");
}
await writeFile(indexPath, html);

await writeFile(
  path.join(root, "dist", "robots.txt"),
  `User-agent: *\nAllow: /\n${url ? `Sitemap: ${url}sitemap.xml\n` : ""}`,
);
if (url) {
  await writeFile(
    path.join(root, "dist", "sitemap.xml"),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${url}</loc></url></urlset>\n`,
  );
}
await rm(path.join(root, "dist-server"), { recursive: true, force: true });
console.log("Pre-rendered dist/index.html" + (url ? " with sitemap" : " (no VITE_SITE_URL: canonical and sitemap skipped)"));
