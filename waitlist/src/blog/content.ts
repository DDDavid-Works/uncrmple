// The app now serves the blog from content/blog/ (src/blog/); this copy is only for the waitlist site until it is retired.
import { loadPosts } from "./posts";

/** Every published post in content/blog/, newest first. Read at build time; drafts are left out. */
export const posts = loadPosts(
  import.meta.glob<string>("../../content/blog/*.md", { query: "?raw", import: "default", eager: true }),
);
