// Server-side render of the site's static pages (the home page's intro, legal pages and blog), built with `vite build --ssr` and
// written into dist/ by scripts/prerender.mjs. The pages need no script to be read.
import { StrictMode, type ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { BLOG_PATH, BlogIndexPage, BlogPostPage, postPath } from "./blog/BlogPages";
import { posts } from "./blog/content";
import { postJsonLd, rssFeed } from "./blog/seo";
import { DESCRIPTION, OPERATOR_NAME, PRODUCT_NAME, TAGLINE } from "./config";
import { HomeIntro } from "./home/HomeIntro";
import { LegalPage } from "./legal/LegalPage";
import { PrivacyPolicy } from "./legal/PrivacyPolicy";
import { TermsOfUse } from "./legal/TermsOfUse";
import { CONTACT_EMAIL, PRIVACY_URL, SITE_URL, TERMS_URL } from "./links";

export interface StaticPage {
  /** Built HTML file under dist/. */
  file: string;
  /** Built HTML file whose shell this page is written into, when it has no entry of its own; defaults to `file`. */
  template?: string;
  title: string;
  description: string;
  canonical: string;
  ogType?: "website" | "article";
  /** ISO dates, for article tags and the sitemap's lastmod. */
  published?: string;
  modified?: string;
  jsonLd?: object[];
  render: () => string;
}

const render = (page: ReactNode) => renderToString(<StrictMode>{page}</StrictMode>);
const abs = (path: string) => `${SITE_URL}${path}`;
const site = { name: PRODUCT_NAME, siteUrl: SITE_URL, author: OPERATOR_NAME };
const BLOG_TITLE = `Blog | ${PRODUCT_NAME}`;
const FEED_PATH = `${BLOG_PATH}feed.xml`;

export const pages: StaticPage[] = [
  {
    // The app's own page: the intro is what readers without scripts see; the app replaces it on start.
    file: "index.html",
    title: `${PRODUCT_NAME}: ${TAGLINE}`,
    description: DESCRIPTION,
    canonical: abs("/"),
    jsonLd: [
      { "@context": "https://schema.org", "@type": "WebSite", name: PRODUCT_NAME, url: abs("/"), description: DESCRIPTION },
      {
        "@context": "https://schema.org",
        "@type": "WebApplication",
        name: PRODUCT_NAME,
        url: abs("/"),
        description: DESCRIPTION,
        applicationCategory: "MultimediaApplication",
        operatingSystem: "Any",
        browserRequirements: "Requires JavaScript and a modern web browser.",
      },
    ],
    render: () => render(<HomeIntro />),
  },
  {
    file: "privacy/index.html",
    title: `Privacy policy | ${PRODUCT_NAME}`,
    description: `How ${PRODUCT_NAME} keeps your document photos on your device, and how it handles your email address.`,
    canonical: PRIVACY_URL,
    render: () =>
      render(
        <LegalPage>
          <PrivacyPolicy />
        </LegalPage>,
      ),
  },
  {
    file: "terms/index.html",
    title: `Terms of use | ${PRODUCT_NAME}`,
    description: `The rules for using ${PRODUCT_NAME}, what a repaired photo is and isn't, and what we are responsible for.`,
    canonical: TERMS_URL,
    render: () =>
      render(
        <LegalPage>
          <TermsOfUse />
        </LegalPage>,
      ),
  },
  {
    file: "blog/index.html",
    title: BLOG_TITLE,
    description: `Guides from ${PRODUCT_NAME} on taking, fixing and sharing photos of paper documents: straightening pages, removing shadows and making PDFs.`,
    canonical: abs(BLOG_PATH),
    modified: posts.map((p) => p.updated).sort().at(-1),
    jsonLd: [
      {
        "@context": "https://schema.org",
        "@type": "Blog",
        name: BLOG_TITLE,
        url: abs(BLOG_PATH),
        blogPost: posts.map((p) => ({
          "@type": "BlogPosting",
          headline: p.title,
          datePublished: p.published,
          dateModified: p.updated,
          url: abs(postPath(p)),
        })),
      },
    ],
    render: () => render(<BlogIndexPage posts={posts} />),
  },
  ...posts.map(
    (post): StaticPage => ({
      file: `blog/${post.slug}/index.html`,
      template: "blog/index.html",
      title: `${post.title} | ${PRODUCT_NAME}`,
      description: post.description,
      canonical: abs(postPath(post)),
      ogType: "article",
      published: post.published,
      modified: post.updated,
      jsonLd: postJsonLd(post, abs(postPath(post)), abs(BLOG_PATH), site),
      // The three newest other posts, so every post links onward and none is left without inbound links.
      render: () => render(<BlogPostPage post={post} related={posts.filter((p) => p !== post).slice(0, 3)} />),
    }),
  ),
];

/** The blog's RSS feed, written to dist/blog/feed.xml and linked from every page's head. */
export const feed = {
  path: FEED_PATH,
  title: BLOG_TITLE,
  xml: rssFeed(posts, abs(BLOG_PATH), abs(FEED_PATH), site, BLOG_TITLE),
};

/**
 * RFC 9116 contact for reporting security problems, served at /.well-known/security.txt. The standard
 * requires an expiry under a year away, so each build sets one a year from the build date.
 */
export function securityTxt(builtAt: Date): string {
  const expires = new Date(builtAt.getTime() + 365 * 24 * 60 * 60 * 1000).toISOString().replace(/\.\d{3}Z$/, "Z");
  return [
    `Contact: mailto:${CONTACT_EMAIL}`,
    `Expires: ${expires}`,
    "Preferred-Languages: en",
    `Canonical: ${abs("/.well-known/security.txt")}`,
    "",
  ].join("\n");
}

/** Every indexable address (each static page, the app's home page first), for dist/sitemap.xml. */
export function sitemapXml(): string {
  const urls = pages
    .map((p) => ({ loc: p.canonical, modified: p.modified }))
    .map(({ loc, modified }) => `<url><loc>${loc}</loc>${modified ? `<lastmod>${modified}</lastmod>` : ""}</url>`)
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>\n`;
}
