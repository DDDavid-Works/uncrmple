// Build-time pre-render: injects server-rendered markup and SEO tags into each page's dist HTML.
import { mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const { pages, site, feed } = await import(pathToFileURL(path.join(root, "dist-server", "entry-server.js")).href);

const esc = (s) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
const pageUrl = (p) => (site.siteUrl ? `${site.siteUrl}${p.path}` : "");

// Static hosting can't send security headers, so the policy rides in a meta tag: scripts, fonts and
// images only from this site, and network requests only here and to the signup form's service.
const csp = [
  "default-src 'self'",
  "script-src 'self'",
  // React pre-renders the demo divider position as an inline style attribute.
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  `connect-src 'self'${site.formOrigin ? ` ${site.formOrigin}` : ""}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const ld = (data) => `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, "\\u003c")}</script>`;

// Blog posts have no HTML entry of their own: each is written into a copy of the blog's built shell.
// Every shell is read before any page is written, since the blog index overwrites the shell it shares.
const templates = new Map();
for (const file of new Set(pages.map((p) => p.template ?? p.file))) {
  templates.set(file, await readFile(path.join(root, "dist", file), "utf8"));
}

for (const page of pages) {
  const url = pageUrl(page);
  const article = page.ogType === "article";
  const head = [
    `<meta http-equiv="Content-Security-Policy" content="${csp}" />`,
    `<meta name="referrer" content="strict-origin-when-cross-origin" />`,
    `<title>${esc(page.title)}</title>`,
    `<meta name="description" content="${esc(page.description)}" />`,
    `<meta property="og:type" content="${article ? "article" : "website"}" />`,
    `<meta property="og:site_name" content="${esc(site.name)}" />`,
    `<meta property="og:title" content="${esc(page.title)}" />`,
    `<meta property="og:description" content="${esc(page.description)}" />`,
    article && page.published && `<meta property="article:published_time" content="${page.published}" />`,
    article && page.modified && `<meta property="article:modified_time" content="${page.modified}" />`,
    `<meta name="twitter:card" content="summary" />`,
    url && `<link rel="canonical" href="${url}" />`,
    url && `<meta property="og:url" content="${url}" />`,
    feed.xml && `<link rel="alternate" type="application/rss+xml" title="${esc(feed.title)}" href="${feed.path}" />`,
    ...(page.jsonLd ?? []).map(ld),
  ]
    .filter(Boolean)
    .join("\n    ");

  const template = templates.get(page.template ?? page.file);
  const html = template.replace("<!--head-->", () => head).replace("<!--app-html-->", () => page.render());
  if (html.includes("<!--app-html-->") || html.includes("<!--head-->")) {
    throw new Error(`Pre-render placeholders were not replaced in ${page.file}`);
  }
  const htmlPath = path.join(root, "dist", page.file);
  await mkdir(path.dirname(htmlPath), { recursive: true });
  await writeFile(htmlPath, html);
}
if (feed.xml) await writeFile(path.join(root, "dist", feed.path.slice(1)), feed.xml);

const home = site.siteUrl ? `${site.siteUrl}/` : "";
await writeFile(
  path.join(root, "dist", "robots.txt"),
  `User-agent: *\nAllow: /\n${home ? `Sitemap: ${home}sitemap.xml\n` : ""}`,
);
if (home) {
  const urls = pages
    .map((p) => `<url><loc>${pageUrl(p)}</loc>${p.modified ? `<lastmod>${p.modified}</lastmod>` : ""}</url>`)
    .join("");
  await writeFile(
    path.join(root, "dist", "sitemap.xml"),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>\n`,
  );
}
// RFC 9116 contact for security reports; it must be renewed before it expires, so each build sets a year ahead.
const expires = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().replace(/\.\d{3}Z$/, "Z");
await mkdir(path.join(root, "dist", ".well-known"), { recursive: true });
await writeFile(
  path.join(root, "dist", ".well-known", "security.txt"),
  [
    `Contact: mailto:${site.contactEmail}`,
    `Expires: ${expires}`,
    "Preferred-Languages: en",
    home && `Canonical: ${home}.well-known/security.txt`,
  ]
    .filter(Boolean)
    .join("\n") + "\n",
);
await rm(path.join(root, "dist-server"), { recursive: true, force: true });
console.log(
  `Pre-rendered ${pages.length} pages` + (home ? " with sitemap" : " (no VITE_SITE_URL: canonical and sitemap skipped)"),
);
