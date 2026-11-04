import type { Post } from "./posts";

type Site = { name: string; siteUrl: string; author: string };

const xml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** schema.org data for a post: the article itself and its place under Home › Blog. */
export function postJsonLd(post: Post, url: string, blogUrl: string, site: Site): object[] {
  const article = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.description,
    datePublished: post.published,
    dateModified: post.updated,
    author: { "@type": "Person", name: site.author },
    publisher: { "@type": "Organization", name: site.name, ...(site.siteUrl && { url: `${site.siteUrl}/` }) },
    ...(url && { url, mainEntityOfPage: url }),
  };
  // Breadcrumb items need absolute URLs, so they are only emitted when the site address is known.
  if (!url) return [article];
  return [
    article,
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: `${site.siteUrl}/` },
        { "@type": "ListItem", position: 2, name: "Blog", item: blogUrl },
        { "@type": "ListItem", position: 3, name: post.title, item: url },
      ],
    },
  ];
}

/** RSS 2.0 feed of every post. Feed readers need absolute links, so it is only built with a site address. */
export function rssFeed(posts: Post[], blogUrl: string, feedUrl: string, site: Site, title: string): string {
  const items = posts
    .map((p) => {
      const link = `${blogUrl}${p.slug}/`;
      return [
        "<item>",
        `<title>${xml(p.title)}</title>`,
        `<link>${link}</link>`,
        `<guid isPermaLink="true">${link}</guid>`,
        `<description>${xml(p.description)}</description>`,
        `<pubDate>${new Date(`${p.published}T00:00:00Z`).toUTCString()}</pubDate>`,
        "</item>",
      ].join("");
    })
    .join("\n");
  const latest = posts.map((p) => p.updated).sort().at(-1);
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel>`,
    `<title>${xml(title)}</title>`,
    `<link>${blogUrl}</link>`,
    `<description>${xml(`Guides from ${site.name} on fixing photos of paper documents.`)}</description>`,
    `<language>en</language>`,
    `<atom:link href="${feedUrl}" rel="self" type="application/rss+xml" />`,
    ...(latest ? [`<lastBuildDate>${new Date(`${latest}T00:00:00Z`).toUTCString()}</lastBuildDate>`] : []),
    items,
    `</channel></rss>`,
    "",
  ].join("\n");
}
