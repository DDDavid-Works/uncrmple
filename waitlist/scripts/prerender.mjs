// Build-time pre-render: injects server-rendered markup and SEO tags into each page's dist HTML.
import { readFile, writeFile, rm } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const { pages, site } = await import(pathToFileURL(path.join(root, "dist-server", "entry-server.js")).href);

const esc = (s) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
const pageUrl = (p) => (site.siteUrl ? `${site.siteUrl}${p.path}` : "");

for (const page of pages) {
  const url = pageUrl(page);
  const head = [
    `<title>${esc(page.title)}</title>`,
    `<meta name="description" content="${esc(page.description)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:title" content="${esc(page.title)}" />`,
    `<meta property="og:description" content="${esc(page.description)}" />`,
    `<meta name="twitter:card" content="summary" />`,
    url && `<link rel="canonical" href="${url}" />`,
    url && `<meta property="og:url" content="${url}" />`,
    page.path === "/" &&
      `<script type="application/ld+json">${JSON.stringify({
        "@context": "https://schema.org",
        "@type": "WebSite",
        name: site.name,
        description: page.description,
        ...(url && { url }),
      }).replace(/</g, "\\u003c")}</script>`,
  ]
    .filter(Boolean)
    .join("\n    ");

  const htmlPath = path.join(root, "dist", page.file);
  const html = (await readFile(htmlPath, "utf8"))
    .replace("<!--head-->", () => head)
    .replace("<!--app-html-->", () => page.render());
  if (html.includes("<!--app-html-->") || html.includes("<!--head-->")) {
    throw new Error(`Pre-render placeholders were not replaced in ${page.file}`);
  }
  await writeFile(htmlPath, html);
}

const home = site.siteUrl ? `${site.siteUrl}/` : "";
await writeFile(
  path.join(root, "dist", "robots.txt"),
  `User-agent: *\nAllow: /\n${home ? `Sitemap: ${home}sitemap.xml\n` : ""}`,
);
if (home) {
  const urls = pages.map((p) => `<url><loc>${pageUrl(p)}</loc></url>`).join("");
  await writeFile(
    path.join(root, "dist", "sitemap.xml"),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>\n`,
  );
}
await rm(path.join(root, "dist-server"), { recursive: true, force: true });
console.log(
  `Pre-rendered ${pages.length} pages` + (home ? " with sitemap" : " (no VITE_SITE_URL: canonical and sitemap skipped)"),
);
