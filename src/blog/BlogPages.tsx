import { PRODUCT_NAME } from "../config";
import { LegalPage } from "../legal/LegalPage";
import { formatDate, type Post } from "./posts";

export const BLOG_PATH = "/blog/";
/** The blog index's heading and search title: what the guides are about, in words people search for. */
export const BLOG_HEADING = "Guides to fixing photos of paper documents";
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

/** Under each post: the app itself is one link away, on this site. */
function AppCta() {
  return (
    <aside className="post-cta" aria-label={`About ${PRODUCT_NAME}`}>
      <h2>Repair your document photos with {PRODUCT_NAME}</h2>
      <p>
        {PRODUCT_NAME} straightens pages, evens out shadows and exports a clean PDF, all in your browser. Your photos
        never leave your device.
      </p>
      <a className="btn btn--primary" href="/">
        Repair a photo
      </a>
    </aside>
  );
}

export function BlogIndexPage({ posts }: { posts: Post[] }) {
  return (
    <LegalPage>
      <main className="legal blog">
        <h1>{BLOG_HEADING}</h1>
        <p className="blog-intro">
          A phone photo of a form, letter or receipt often comes out slanted, shadowed or faded. These guides explain
          why that happens, what can and can't be fixed afterwards, and how to take a photo that needs less fixing in
          the first place.
        </p>
        {posts.length === 0 ? <p>No posts yet.</p> : <PostList posts={posts} headingLevel={2} />}
      </main>
    </LegalPage>
  );
}

export function BlogPostPage({ post, related }: { post: Post; related: Post[] }) {
  return (
    <LegalPage>
      <main className="legal blog">
        <nav aria-label="Breadcrumb" className="breadcrumb">
          <a href="/">Home</a> <span aria-hidden="true">/</span> <a href={BLOG_PATH}>Blog</a>
        </nav>
        <article>
          <h1>{post.title}</h1>
          <PostMeta post={post} />
          <div className="post-body" dangerouslySetInnerHTML={{ __html: post.html }} />
        </article>
        <AppCta />
        {related.length > 0 && (
          <section aria-labelledby="more-posts" className="more-posts">
            <h2 id="more-posts">More from the blog</h2>
            <PostList posts={related} headingLevel={3} />
          </section>
        )}
      </main>
    </LegalPage>
  );
}
