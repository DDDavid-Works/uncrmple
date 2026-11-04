import indexHtml from "../../index.html?raw";
import robotsTxt from "../../public/robots.txt?raw";
import staticfile from "../../Staticfile?raw";

// The app runs on a temporary Railway address, so it must stay out of search; uncrmple.app is the page that ranks.
describe("search engine settings", () => {
  it("keeps the app page out of search results and gives it a description", () => {
    expect(indexHtml).toContain('<meta name="robots" content="noindex" />');
    expect(indexHtml).toContain('<meta name="description" content="%DESCRIPTION%" />');
  });

  it("asks crawlers not to crawl the app", () => {
    expect(robotsTxt).toMatch(/User-agent: \*\r?\nDisallow: \/\r?\n/);
  });

  it("returns 404 for unknown paths instead of the app page", () => {
    expect(staticfile).toMatch(/^index_fallback: false$/m);
  });
});
