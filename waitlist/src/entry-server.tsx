import { StrictMode, type ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { App } from "./App";
import { PrivacyPage } from "./PrivacyPage";
import { TermsPage } from "./TermsPage";
import { DESCRIPTION, PRIVACY_PATH, PRODUCT_NAME, SITE_URL, TAGLINE, TERMS_PATH } from "./config";

function render(page: ReactNode): string {
  return renderToString(<StrictMode>{page}</StrictMode>);
}

export const site = { name: PRODUCT_NAME, siteUrl: SITE_URL };

/** Every pre-rendered page: its built HTML file under dist/, URL path and SEO text. */
export const pages = [
  {
    file: "index.html",
    path: "/",
    title: `${PRODUCT_NAME}: ${TAGLINE}`,
    description: DESCRIPTION,
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
];
