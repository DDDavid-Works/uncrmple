import { CONTACT_EMAIL, PRIVACY_PATH, PRODUCT_NAME, TERMS_PATH, WORDMARK } from "../config";
import { Logo as LogoMark } from "./Logo";

function Logo() {
  return (
    <span className="logo">
      <LogoMark className="logo-mark" />
      <span aria-hidden="true">{WORDMARK}</span>
      <span className="visually-hidden">{PRODUCT_NAME}</span>
    </span>
  );
}

type HeaderProps = {
  /** Where "Join the waitlist" points: the on-page form, or the home page's form from other pages. */
  waitlistHref: string;
};

export function SiteHeader({ waitlistHref }: HeaderProps) {
  return (
    <header className="site-header wrap">
      <a href="/" className="logo-link" aria-label={`${PRODUCT_NAME} home`}>
        <Logo />
      </a>
      <a className="btn" href={waitlistHref}>
        Join the waitlist
      </a>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-footer wrap">
      <Logo />
      <p className="fine">&copy; {PRODUCT_NAME} {new Date().getFullYear()}</p>
      <nav aria-label="Footer" className="footer-links">
        <a href={PRIVACY_PATH}>Privacy policy</a>
        <a href={TERMS_PATH}>Terms of use</a>
        <a href={`mailto:${CONTACT_EMAIL}`}>Contact</a>
      </nav>
    </footer>
  );
}
