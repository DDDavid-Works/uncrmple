import { Marked } from "marked";

/** A published blog post, read from content/blog/<slug>.md. */
export type Post = {
  slug: string;
  title: string;
  /** Search-result and link-preview summary. */
  description: string;
  /** ISO dates (YYYY-MM-DD). */
  published: string;
  updated: string;
  /** Body rendered to HTML. Posts are written by us and committed, so the HTML is trusted. */
  html: string;
  readingMinutes: number;
};

// Search engines cut titles at about 60 characters and descriptions at about 160, so longer text
// would be truncated in results. The site name is added to the title after these limits.
export const TITLE_MAX = 60;
export const DESCRIPTION_MIN = 70;
export const DESCRIPTION_MAX = 160;

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const markdown = new Marked({ gfm: true });

/** Splits "---\nkey: value\n---\nbody" into its fields and body. Values are plain strings. */
export function parseFrontmatter(source: string): { fields: Record<string, string>; body: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(source);
  if (!match) throw new Error("must start with a --- frontmatter block");
  const fields: Record<string, string> = {};
  for (const line of match[1]!.split(/\r?\n/)) {
    if (line.trim() === "" || line.trimStart().startsWith("#")) continue;
    const colon = line.indexOf(":");
    if (colon < 1) throw new Error(`frontmatter line "${line}" is not "key: value"`);
    const value = line.slice(colon + 1).trim();
    fields[line.slice(0, colon).trim()] = value.replace(/^(["'])(.*)\1$/, "$2");
  }
  return { fields, body: match[2]! };
}

function isRealDate(s: string): boolean {
  if (!DATE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(s);
}

/** Parses and checks one post; returns null for drafts. Throws with the reason a post is invalid. */
export function parsePost(slug: string, source: string): Post | null {
  if (!SLUG.test(slug)) throw new Error("file name must be lowercase words joined by hyphens, like fix-a-photo.md");
  const { fields, body } = parseFrontmatter(source);
  if (fields.draft === "true") return null;

  const { title = "", description = "", date = "" } = fields;
  const updated = fields.updated ?? date;
  if (title === "") throw new Error("needs a title");
  if (title.length > TITLE_MAX) throw new Error(`title is ${title.length} characters; keep it to ${TITLE_MAX}`);
  if (description.length < DESCRIPTION_MIN || description.length > DESCRIPTION_MAX) {
    throw new Error(
      `description is ${description.length} characters; keep it between ${DESCRIPTION_MIN} and ${DESCRIPTION_MAX}`,
    );
  }
  if (!isRealDate(date)) throw new Error("date must be a real date written YYYY-MM-DD");
  if (!isRealDate(updated)) throw new Error("updated must be a real date written YYYY-MM-DD");
  if (updated < date) throw new Error("updated is earlier than date");

  const tokens = markdown.lexer(body);
  // The title is the page's only h1; a second one muddles the outline search engines read.
  if (tokens.some((t) => t.type === "heading" && t.depth === 1)) {
    throw new Error("body must not contain a # heading; the title is the page heading, so start sections at ##");
  }
  if (body.trim() === "") throw new Error("has no body");

  const words = body.split(/\s+/).filter(Boolean).length;
  return {
    slug,
    title,
    description,
    published: date,
    updated,
    html: markdown.parser(tokens),
    readingMinutes: Math.max(1, Math.round(words / 200)),
  };
}

/**
 * Turns the raw post files (path → contents) into published posts, newest first.
 * Any invalid post fails the build, naming the file, so a broken page is never published.
 */
export function loadPosts(files: Record<string, string>): Post[] {
  const posts: Post[] = [];
  for (const [file, source] of Object.entries(files)) {
    const slug = file.replace(/^.*\//, "").replace(/\.md$/, "");
    try {
      const post = parsePost(slug, source);
      if (post) posts.push(post);
    } catch (error) {
      throw new Error(`Blog post ${file}: ${(error as Error).message}`);
    }
  }
  return posts.sort((a, b) => b.published.localeCompare(a.published) || a.slug.localeCompare(b.slug));
}

/** "2026-11-04" → "4 November 2026", the date style the rest of the site uses. */
export function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}
