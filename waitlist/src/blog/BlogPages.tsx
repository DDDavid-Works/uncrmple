import { SiteFooter, SiteHeader } from "../components/SiteChrome";
import { BLOG_PATH, PRODUCT_NAME } from "../config";
import { formatDate, type Post } from "./posts";

export const postPath = (post: Post) => `${BLOG_PATH}${post.slug}/`;

function PostMeta({ post }: { post: Post }) {
  return (
    <p className="post-meta">
      <time dateTime={post.published}>{formatDate(post.published)}</time>
      {post.updated !== post.published && (
        <>
          {" · Updated "}
          <time dateTime={post.updated}>{formatDate(post.updated)}</time>
        </>
      )}
      {` · ${post.readingMinutes} min read`}
    </p>
  );
}

function PostList({ posts, headingLevel }: { posts: Post[]; headingLevel: 2 | 3 }) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return (
    <ul className="post-list">
      {posts.map((post) => (
        <li key={post.slug}>
          <article>
            <Heading>
              <a href={postPath(post)}>{post.title}</a>
            </Heading>
            <PostMeta post={post} />
            <p>{post.description}</p>
          </article>
        </li>
      ))}
    </ul>
  );
}

function WaitlistCta() {
  return (
    <aside className="post-cta" aria-label={`About ${PRODUCT_NAME}`}>
      <h2>Repair your document photos with {PRODUCT_NAME}</h2>
      <p>
        {PRODUCT_NAME} straightens pages, evens out shadows and exports a clean PDF, all in your browser. Your photos
        never leave your device.
      </p>
      <a className="btn" href="/#waitlist">
        Join the waitlist
      </a>
    </aside>
  );
}

export function BlogIndexPage({ posts }: { posts: Post[] }) {
  return (
    <>
      <SiteHeader />
      <main className="wrap legal blog">
        <h1>Blog</h1>
        <p className="blog-intro">Guides to taking, fixing and sharing photos of paper documents.</p>
        {posts.length === 0 ? <p>No posts yet.</p> : <PostList posts={posts} headingLevel={2} />}
      </main>
      <SiteFooter />
    </>
  );
}

export function BlogPostPage({ post, related }: { post: Post; related: Post[] }) {
  return (
    <>
      <SiteHeader />
      <main className="wrap legal blog">
        <nav aria-label="Breadcrumb" className="breadcrumb">
          <a href="/">Home</a> <span aria-hidden="true">/</span> <a href={BLOG_PATH}>Blog</a>
        </nav>
        <article>
          <h1>{post.title}</h1>
          <PostMeta post={post} />
          <div className="post-body" dangerouslySetInnerHTML={{ __html: post.html }} />
        </article>
        <WaitlistCta />
        {related.length > 0 && (
          <section aria-labelledby="more-posts" className="more-posts">
            <h2 id="more-posts">More from the blog</h2>
            <PostList posts={related} headingLevel={3} />
          </section>
        )}
      </main>
      <SiteFooter />
    </>
  );
}
