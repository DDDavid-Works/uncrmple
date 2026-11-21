import { render, screen } from "@testing-library/react";
import indexHtml from "../../index.html?raw";
import { DESCRIPTION, PRODUCT_NAME, TAGLINE } from "../config";
import { pages, sitemapXml } from "../entry-server";
import { MODES } from "../features/mode/ModeSelector";
import { BLOG_URL, SITE_URL } from "../links";
import { HomeIntro } from "./HomeIntro";

describe("home page intro", () => {
  it("says what the app does, in the app's own words, and links to the guides", () => {
    render(<HomeIntro />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(`${PRODUCT_NAME}: ${TAGLINE}`);
    expect(screen.getByText(DESCRIPTION)).toBeInTheDocument();
    for (const m of MODES) expect(screen.getByText(`${m.label}.`)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /guides/i })).toHaveAttribute("href", BLOG_URL);
  });

  it("is pre-rendered into the app's index.html with the home page's search tags", () => {
    expect(indexHtml).toContain("<!--head-->");
    expect(indexHtml).toContain('<div id="root"><!--app-html--></div>');
    const home = pages.find((p) => p.file === "index.html")!;
    expect(home).toMatchObject({ canonical: `${SITE_URL}/`, description: DESCRIPTION });
    expect(home.jsonLd!.map((d) => (d as { "@type": string })["@type"])).toEqual(["WebSite", "WebApplication"]);
    expect(home.render()).toContain(TAGLINE);
    // Listed once, first.
    expect(sitemapXml().match(new RegExp(`<loc>${SITE_URL}/</loc>`, "g"))).toHaveLength(1);
    expect(sitemapXml().indexOf(`<loc>${SITE_URL}/</loc>`)).toBeLessThan(sitemapXml().indexOf("/privacy/"));
  });
});
