import { render, screen } from "@testing-library/react";
import indexHtml from "../../index.html?raw";
import ogImage from "../../public/og-image.png?inline";
import { DESCRIPTION, PRODUCT_NAME, SEARCH_TITLE, TAGLINE } from "../config";
import { DESCRIPTION_MAX, TITLE_MAX } from "../blog/posts";
import { pages, shareImage, sitemapXml } from "../entry-server";
import { MODES } from "../features/mode/ModeSelector";
import { BLOG_URL, SITE_URL } from "../links";
import { HomeIntro } from "./HomeIntro";

describe("home page intro", () => {
  it("says what the app does, in the app's own words, and links to the guides", () => {
    render(<HomeIntro />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(`${PRODUCT_NAME}: fix photos of paper documents`);
    expect(screen.getByText(TAGLINE).parentElement).toHaveTextContent(`${TAGLINE} ${DESCRIPTION}`);
    for (const m of MODES) expect(screen.getByText(`${m.label}.`)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /guides/i })).toHaveAttribute("href", BLOG_URL);
  });

  it("is pre-rendered into the app's index.html with the home page's search tags", () => {
    expect(indexHtml).toContain("<!--head-->");
    expect(indexHtml).toContain('<div id="root"><!--app-html--></div>');
    const home = pages.find((p) => p.file === "index.html")!;
    expect(home).toMatchObject({ canonical: `${SITE_URL}/`, title: SEARCH_TITLE, description: DESCRIPTION });
    expect(indexHtml).toContain("<title>%SEARCH_TITLE%</title>");
    expect(home.jsonLd!.map((d) => (d as { "@type": string })["@type"])).toEqual(["WebSite", "WebApplication"]);
    expect(home.render()).toContain(TAGLINE);
    // Listed once, first.
    expect(sitemapXml().match(new RegExp(`<loc>${SITE_URL}/</loc>`, "g"))).toHaveLength(1);
    expect(sitemapXml().indexOf(`<loc>${SITE_URL}/</loc>`)).toBeLessThan(sitemapXml().indexOf("/privacy/"));
  });

  it("fits its title and description into search results, and names the product", () => {
    // Search engines cut titles at about 60 characters and descriptions at about 160.
    expect(SEARCH_TITLE.length).toBeLessThanOrEqual(TITLE_MAX);
    expect(SEARCH_TITLE.endsWith(`| ${PRODUCT_NAME}`)).toBe(true);
    expect(DESCRIPTION.length).toBeLessThanOrEqual(DESCRIPTION_MAX);
  });
});

describe("share image", () => {
  it("is a 1200×630 PNG on the site, described for screen readers", () => {
    const bytes = atob(ogImage.slice(ogImage.indexOf(",") + 1));
    const u32 = (at: number) => [0, 1, 2, 3].reduce((n, i) => n * 256 + bytes.charCodeAt(at + i), 0);
    expect(bytes.slice(1, 4)).toBe("PNG");
    expect([u32(16), u32(20)]).toEqual([shareImage.width, shareImage.height]);
    expect(shareImage.url).toBe(`${SITE_URL}/og-image.png`);
    expect(shareImage.alt.length).toBeGreaterThan(20);
  });
});
