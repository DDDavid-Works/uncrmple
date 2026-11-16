// Build-time pre-render: writes the server-rendered static pages (src/legal/entry-server.tsx) and their
// title, description and canonical link into the HTML files Vite built, so they read without a script.
import { readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = path.resolve(import.meta.dirname, "..");
const server = path.join(root, "dist-server");
const { pages } = await import(pathToFileURL(path.join(server, "entry-server.js")).href);

const esc = (s) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

for (const page of pages) {
  const file = path.join(root, "dist", page.file);
  const head = [
    `<title>${esc(page.title)}</title>`,
    `<meta name="description" content="${esc(page.description)}" />`,
    `<link rel="canonical" href="${esc(page.canonical)}" />`,
  ].join("\n    ");
  const html = (await readFile(file, "utf8"))
    .replace("<!--head-->", () => head)
    .replace("<!--app-html-->", () => page.render());
  if (html.includes("<!--head-->") || html.includes("<!--app-html-->")) {
    throw new Error(`Pre-render placeholders were not replaced in ${page.file}`);
  }
  await writeFile(file, html);
}
await rm(server, { recursive: true, force: true });
console.log(`Pre-rendered ${pages.length} page${pages.length === 1 ? "" : "s"}: ${pages.map((p) => p.file).join(", ")}`);
