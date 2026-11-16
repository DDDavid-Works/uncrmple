// Server-side render of the app's static pages, built with `vite build --ssr` and written into dist/ by
// scripts/prerender.mjs. The pages need no script to be read.
import { StrictMode, type ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { PRODUCT_NAME } from "../config";
import { PRIVACY_URL } from "../links";
import { LegalPage } from "./LegalPage";
import { PrivacyPolicy } from "./PrivacyPolicy";

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
];
