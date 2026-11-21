// Build-time pre-render: writes the server-rendered static pages (src/entry-server.tsx) and their SEO tags
// into the HTML files Vite built, so they read without a script, then the blog feed and the sitemap.
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = path.resolve(import.meta.dirname, "..");
const server = path.join(root, "dist-server");
const { pages, feed, sitemapXml } = await import(pathToFileURL(path.join(server, "entry-server.js")).href);

const esc = (s) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
// JSON-LD is data, not script: the Content-Security-Policy does not run or block it.
const ld = (data) => `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, "\\u003c")}</script>`;

// Blog posts have no HTML entry of their own: each is written into a copy of the blog's built shell.
// Every shell is read before any page is written, since the blog index overwrites the shell it shares.
const templates = new Map();
for (const file of new Set(pages.map((p) => p.template ?? p.file))) {
  templates.set(file, await readFile(path.join(root, "dist", file), "utf8"));
}

for (const page of pages) {
  const article = page.ogType === "article";
  const head = [
    `<title>${esc(page.title)}</title>`,
    `<meta name="description" content="${esc(page.description)}" />`,
    `<link rel="canonical" href="${esc(page.canonical)}" />`,
    `<meta property="og:type" content="${article ? "article" : "website"}" />`,
    `<meta property="og:title" content="${esc(page.title)}" />`,
    `<meta property="og:description" content="${esc(page.description)}" />`,
    `<meta property="og:url" content="${esc(page.canonical)}" />`,
    article && page.published && `<meta property="article:published_time" content="${page.published}" />`,
    article && page.modified && `<meta property="article:modified_time" content="${page.modified}" />`,
    `<link rel="alternate" type="application/rss+xml" title="${esc(feed.title)}" href="${feed.path}" />`,
    ...(page.jsonLd ?? []).map(ld),
  ]
    .filter(Boolean)
    .join("\n    ");
  const html = templates
    .get(page.template ?? page.file)
    .replace("<!--head-->", () => head)
    .replace("<!--app-html-->", () => page.render());
  if (html.includes("<!--head-->") || html.includes("<!--app-html-->")) {
    throw new Error(`Pre-render placeholders were not replaced in ${page.file}`);
  }
  const file = path.join(root, "dist", page.file);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, html);
}
await writeFile(path.join(root, "dist", feed.path.slice(1)), feed.xml);
await writeFile(path.join(root, "dist", "sitemap.xml"), sitemapXml());
await rm(server, { recursive: true, force: true });
console.log(`Pre-rendered ${pages.length} page${pages.length === 1 ? "" : "s"}, the blog feed and the sitemap`);
