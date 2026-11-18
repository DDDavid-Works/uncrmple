// Server-side render of the app's static pages, built with `vite build --ssr` and written into dist/ by
// scripts/prerender.mjs. The pages need no script to be read.
import { StrictMode, type ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { PRODUCT_NAME } from "../config";
import { PRIVACY_URL, TERMS_URL } from "../links";
import { LegalPage } from "./LegalPage";
import { PrivacyPolicy } from "./PrivacyPolicy";
import { TermsOfUse } from "./TermsOfUse";

export interface StaticPage {
  /** Built HTML file under dist/, created by the matching entry in vite.config.ts. */
  file: string;
  title: string;
  description: string;
  canonical: string;
  render: () => string;
}

const render = (page: ReactNode) => renderToString(<StrictMode>{page}</StrictMode>);

export const pages: StaticPage[] = [
  {
    file: "privacy/index.html",
    title: `Privacy policy | ${PRODUCT_NAME}`,
    description: `How ${PRODUCT_NAME} keeps your document photos on your device, and how it handles your email address.`,
    canonical: PRIVACY_URL,
    render: () =>
      render(
        <LegalPage>
          <PrivacyPolicy />
        </LegalPage>,
      ),
  },
  {
    file: "terms/index.html",
    title: `Terms of use | ${PRODUCT_NAME}`,
    description: `The rules for using ${PRODUCT_NAME}, what a repaired photo is and isn't, and what we are responsible for.`,
    canonical: TERMS_URL,
    render: () =>
      render(
        <LegalPage>
          <TermsOfUse />
        </LegalPage>,
      ),
  },
];
