import { StrictMode } from "react";
import { renderToString } from "react-dom/server";
import { App } from "./App";
import { DESCRIPTION, PRODUCT_NAME, SITE_URL, TAGLINE } from "./config";

export function render(): string {
  return renderToString(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

export const seo = {
  title: `${PRODUCT_NAME}: ${TAGLINE}`,
  description: DESCRIPTION,
  name: PRODUCT_NAME,
  siteUrl: SITE_URL,
};
