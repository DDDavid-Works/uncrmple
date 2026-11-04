import { PRODUCT_NAME } from "../config";
import { BLOG_URL, CONTACT_EMAIL, PRIVACY_URL, TERMS_URL } from "../links";

/** Opens in a new tab so following a link never discards the photos being worked on. */
function ExternalLink({ href, children }: { href: string; children: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children}
      <span className="visually-hidden"> (opens in a new tab)</span>
    </a>
  );
}

export function AppFooter() {
  return (
    <footer className="app__footer muted">
      <p>
        &copy; {PRODUCT_NAME} {new Date().getFullYear()}
      </p>
      <nav aria-label="Footer" className="app__footer-links">
        <ExternalLink href={BLOG_URL}>Blog</ExternalLink>
        <ExternalLink href={PRIVACY_URL}>Privacy policy</ExternalLink>
        <ExternalLink href={TERMS_URL}>Terms of use</ExternalLink>
        <a href={`mailto:${CONTACT_EMAIL}`}>Contact</a>
      </nav>
    </footer>
  );
}
