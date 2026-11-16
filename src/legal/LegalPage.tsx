import type { ReactNode } from "react";
import { AppFooter } from "../components/AppFooter";
import { Logo } from "../components/Logo";
import { PRODUCT_NAME, WORDMARK } from "../config";

/** Frame for a static legal page: the app's top bar with a link home, the page, and the app footer. */
export function LegalPage({ children }: { children: ReactNode }) {
  return (
    <div className="app">
      <header className="topbar">
        <a className="brand legal__home" href="/">
          <Logo className="brand__mark" />
          <span className="brand__name" aria-hidden="true">
            {WORDMARK}
          </span>
          <span className="visually-hidden">{PRODUCT_NAME} home</span>
        </a>
      </header>
      {children}
      <AppFooter />
    </div>
  );
}
