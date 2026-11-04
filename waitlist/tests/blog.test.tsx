import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BlogIndexPage, BlogPostPage } from "../src/blog/BlogPages";
import { posts } from "../src/blog/content";
import { DESCRIPTION_MAX, TITLE_MAX, formatDate, loadPosts, parsePost } from "../src/blog/posts";
import { postJsonLd, rssFeed } from "../src/blog/seo";

const DESC = "A description long enough for a search result, telling readers what this post covers in full.";
const post = (fields: Record<string, string>, body = "Some text.\n\n## A section\n\nMore text.") =>
  `---\n${Object.entries({ title: "A post", description: DESC, date: "2026-11-04", ...fields })
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n")}\n---\n${body}`;

describe("blog post parsing", () => {
  it("reads the fields and renders the Markdown body", () => {
    const p = parsePost("a-post", post({ title: '"Fix: a photo"' }))!;
    expect(p).toMatchObject({ slug: "a-post", title: "Fix: a photo", published: "2026-11-04", updated: "2026-11-04" });
    expect(p.html).toContain("<h2>A section</h2>");
    expect(p.readingMinutes).toBe(1);
  });

  it("leaves drafts out", () => {
    expect(parsePost("a-post", post({ draft: "true" }))).toBeNull();
  });

  it.each([
    ["Bad_Name", post({}), /file name/],
    ["a-post", "no frontmatter", /frontmatter/],
    ["a-post", post({ title: "" }), /title/],
    ["a-post", post({ title: "x".repeat(TITLE_MAX + 1) }), /title is/],
    ["a-post", post({ description: "Too short." }), /description/],
    ["a-post", post({ description: "x".repeat(DESCRIPTION_MAX + 1) }), /description/],
    ["a-post", post({ date: "2026-02-30" }), /date/],
    ["a-post", post({ updated: "2026-11-01" }), /earlier/],
    ["a-post", post({}, "# Second title\n\nText."), /# heading/],
    ["a-post", post({}, "  "), /no body/],
  ])("rejects %s with an invalid post (%#)", (slug, source, reason) => {
    expect(() => parsePost(slug, source)).toThrow(reason);
  });

  it("sorts newest first and names the broken file", () => {
    const sorted = loadPosts({
      "/c/old.md": post({ date: "2026-01-01" }),
      "/c/new.md": post({ date: "2026-06-01" }),
      "/c/hidden.md": post({ draft: "true" }),
    });
    expect(sorted.map((p) => p.slug)).toEqual(["new", "old"]);
    expect(() => loadPosts({ "/c/broken.md": "oops" })).toThrow(/broken\.md/);
  });

  it("formats dates like the rest of the site", () => {
    expect(formatDate("2026-11-04")).toBe("4 November 2026");
  });
});

describe("published posts", () => {
  it("are all valid and have unique slugs", () => {
    expect(posts.length).toBeGreaterThan(0);
    expect(new Set(posts.map((p) => p.slug)).size).toBe(posts.length);
  });
});

describe("blog pages", () => {
  const [first, ...rest] = posts;

  it("lists every post with a link to its page", () => {
    render(<BlogIndexPage posts={posts} />);
    expect(screen.getByRole("heading", { level: 1, name: "Blog" })).toBeInTheDocument();
    for (const p of posts) {
      expect(screen.getByRole("link", { name: p.title })).toHaveAttribute("href", `/blog/${p.slug}/`);
    }
  });

  it("shows a post with one h1, its date, a waitlist link and onward links", () => {
    render(<BlogPostPage post={first!} related={rest} />);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1, name: first!.title })).toBeInTheDocument();
    expect(screen.getAllByText(formatDate(first!.published))[0]!.closest("time")).toHaveAttribute(
      "datetime",
      first!.published,
    );
    const cta = within(screen.getByRole("complementary"));
    expect(cta.getByRole("link", { name: "Join the waitlist" })).toHaveAttribute("href", "/#waitlist");
    const crumbs = within(screen.getByRole("navigation", { name: "Breadcrumb" }));
    expect(crumbs.getByRole("link", { name: "Blog" })).toHaveAttribute("href", "/blog/");
    for (const p of rest) expect(screen.getByRole("link", { name: p.title })).toHaveAttribute("href", `/blog/${p.slug}/`);
  });

  it("is linked from the header and footer of every page", () => {
    render(<BlogIndexPage posts={[]} />);
    for (const nav of ["Main", "Footer"]) {
      expect(within(screen.getByRole("navigation", { name: nav })).getByRole("link", { name: "Blog" })).toHaveAttribute(
        "href",
        "/blog/",
      );
    }
  });
});

describe("blog SEO", () => {
  const site = { name: "Uncrmple", siteUrl: "https://uncrmple.app", author: "Darrel David" };
  const p = parsePost("a-post", post({ title: "Tips & <tricks>", updated: "2026-11-10" }))!;

  it("describes a post as a BlogPosting with breadcrumbs", () => {
    const [article, crumbs] = postJsonLd(p, "https://uncrmple.app/blog/a-post/", "https://uncrmple.app/blog/", site);
    expect(article).toMatchObject({
      "@type": "BlogPosting",
      headline: "Tips & <tricks>",
      datePublished: "2026-11-04",
      dateModified: "2026-11-10",
      url: "https://uncrmple.app/blog/a-post/",
    });
    expect(crumbs).toMatchObject({ "@type": "BreadcrumbList" });
  });

  it("leaves out absolute URLs when the site address is unknown", () => {
    const ld = postJsonLd(p, "", "", { ...site, siteUrl: "" });
    expect(ld).toHaveLength(1);
    expect(ld[0]).not.toHaveProperty("url");
  });

  it("writes a valid, escaped RSS feed", () => {
    const xml = rssFeed([p], "https://uncrmple.app/blog/", "https://uncrmple.app/blog/feed.xml", site, "Blog");
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    expect(doc.querySelector("parsererror")).toBeNull();
    expect(doc.querySelector("item > title")?.textContent).toBe("Tips & <tricks>");
    expect(doc.querySelector("item > link")?.textContent).toBe("https://uncrmple.app/blog/a-post/");
  });
});
