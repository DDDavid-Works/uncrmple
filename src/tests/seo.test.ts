import caddyfile from "../../Caddyfile.template?raw";
import indexHtml from "../../index.html?raw";
import robotsTxt from "../../public/robots.txt?raw";
import staticfile from "../../Staticfile?raw";
import { DEFAULT_SITE_URL } from "../links";

// The app runs on a temporary Railway address until launch, when it moves onto the official domain.
// Only the server decides what stays out of search, by host, so nothing in the build has to change at launch.
describe("search engine settings", () => {
  const officialHost = new URL(DEFAULT_SITE_URL).host;

  it("sends noindex for every address except the official domain", () => {
    const host = officialHost.replace(/\./g, "\\.");
    expect(caddyfile).toMatch(new RegExp(`^\\s*@unofficial not host ${host}\\r?$`, "m"));
    expect(caddyfile).toContain('header @unofficial X-Robots-Tag "noindex"');
  });

  it("ships a page that search engines may index, with a description", () => {
    expect(indexHtml).not.toMatch(/name="robots"/);
    expect(indexHtml).toContain('<meta name="description" content="%DESCRIPTION%" />');
  });

  it("lets crawlers fetch pages, so they can see the noindex header", () => {
    expect(robotsTxt).toMatch(/User-agent: \*\r?\nAllow: \/\r?\n/);
    expect(robotsTxt).not.toMatch(/Disallow/);
  });

  it("returns 404 for unknown paths instead of the app page", () => {
    expect(staticfile).toMatch(/^index_fallback: false$/m);
  });
});
