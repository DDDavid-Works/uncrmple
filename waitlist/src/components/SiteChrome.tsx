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
  /** On the home page the links jump within the page; elsewhere they lead back to the home page's sections. */
  onHome?: boolean;
};

export function SiteHeader({ onHome = false }: HeaderProps) {
  const base = onHome ? "" : "/";
  return (
    <div className="site-header-bar">
      <header className="site-header wrap">
        <a href="/" className="logo-link" aria-label={`${PRODUCT_NAME} home`}>
          <Logo />
        </a>
        <nav aria-label="Main" className="site-nav">
          <a href={`${base}#how`}>How it works</a>
          <a href={`${base}#privacy`}>Privacy</a>
        </nav>
        <a className="btn" href={`${base}#waitlist`}>
          Join the waitlist
        </a>
      </header>
    </div>
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
