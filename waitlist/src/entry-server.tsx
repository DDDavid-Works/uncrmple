import { StrictMode, type ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { App } from "./App";
import { PrivacyPage } from "./PrivacyPage";
import { TermsPage } from "./TermsPage";
import { BlogIndexPage, BlogPostPage, postPath } from "./blog/BlogPages";
import { posts } from "./blog/content";
import { postJsonLd, rssFeed } from "./blog/seo";
import {
  BLOG_PATH,
  CONTACT_EMAIL,
  DESCRIPTION,
  OPERATOR_NAME,
  PRIVACY_PATH,
  PRODUCT_NAME,
  SITE_URL,
  TAGLINE,
  TERMS_PATH,
  WAITLIST_ENDPOINT,
} from "./config";

function render(page: ReactNode): string {
  return renderToString(<StrictMode>{page}</StrictMode>);
}

export const site = {
  name: PRODUCT_NAME,
  siteUrl: SITE_URL,
  contactEmail: CONTACT_EMAIL,
  author: OPERATOR_NAME,
  /** The only outside origin the pages may contact (the signup form), or "" when signups are off. */
  formOrigin: WAITLIST_ENDPOINT === "" ? "" : new URL(WAITLIST_ENDPOINT).origin,
};

const abs = (path: string) => (SITE_URL ? `${SITE_URL}${path}` : "");
const BLOG_TITLE = `Blog | ${PRODUCT_NAME}`;

export type Page = {
  /** Built HTML file under dist/. */
  file: string;
  /** Built HTML file whose shell (stylesheet, placeholders) this page is written into; defaults to `file`. */
  template?: string;
  path: string;
  title: string;
  description: string;
  ogType?: "website" | "article";
  /** ISO dates, for article tags and the sitemap's lastmod. */
  published?: string;
  modified?: string;
  jsonLd?: object[];
  render: () => string;
};

/** Every pre-rendered page: its built HTML file under dist/, URL path and SEO text. */
export const pages: Page[] = [
  {
    file: "index.html",
    path: "/",
    title: `${PRODUCT_NAME}: ${TAGLINE}`,
    description: DESCRIPTION,
    jsonLd: [
      {
        "@context": "https://schema.org",
        "@type": "WebSite",
        name: PRODUCT_NAME,
        description: DESCRIPTION,
        ...(SITE_URL && { url: abs("/") }),
      },
    ],
    render: () => render(<App />),
  },
  {
    file: "privacy/index.html",
    path: PRIVACY_PATH,
    title: `Privacy policy | ${PRODUCT_NAME}`,
    description: `How ${PRODUCT_NAME} keeps your document photos on your device, and how it handles your email address.`,
    render: () => render(<PrivacyPage />),
  },
  {
    file: "terms/index.html",
    path: TERMS_PATH,
    title: `Terms of use | ${PRODUCT_NAME}`,
    description: `The rules for using ${PRODUCT_NAME}, what a repaired photo is and isn't, and what we are responsible for.`,
    render: () => render(<TermsPage />),
  },
  {
    file: "blog/index.html",
    path: BLOG_PATH,
    title: BLOG_TITLE,
    description: `Guides from ${PRODUCT_NAME} on taking, fixing and sharing photos of paper documents: straightening pages, removing shadows and making PDFs.`,
    modified: posts.map((p) => p.updated).sort().at(-1),
    jsonLd: [
      {
        "@context": "https://schema.org",
        "@type": "Blog",
        name: BLOG_TITLE,
        ...(SITE_URL && { url: abs(BLOG_PATH) }),
        blogPost: posts.map((p) => ({
          "@type": "BlogPosting",
          headline: p.title,
          datePublished: p.published,
          dateModified: p.updated,
          ...(SITE_URL && { url: abs(postPath(p)) }),
        })),
      },
    ],
    render: () => render(<BlogIndexPage posts={posts} />),
  },
  ...posts.map(
    (post): Page => ({
      file: `blog/${post.slug}/index.html`,
      template: "blog/index.html",
      path: postPath(post),
      title: `${post.title} | ${PRODUCT_NAME}`,
      description: post.description,
      ogType: "article",
      published: post.published,
      modified: post.updated,
      jsonLd: postJsonLd(post, abs(postPath(post)), abs(BLOG_PATH), site),
      // The three newest other posts, so every post links onward and none is left without inbound links.
      render: () => render(<BlogPostPage post={post} related={posts.filter((p) => p !== post).slice(0, 3)} />),
    }),
  ),
];

/** The blog's RSS feed, written to dist/blog/feed.xml; "" when there is no site address to link to. */
export const feed = {
  path: `${BLOG_PATH}feed.xml`,
  title: BLOG_TITLE,
  xml: SITE_URL ? rssFeed(posts, abs(BLOG_PATH), abs(`${BLOG_PATH}feed.xml`), site, BLOG_TITLE) : "",
};
