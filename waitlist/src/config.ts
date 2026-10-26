// Single place for branding and deployment settings. The product name is still TBD
// (see PROJECT.md), so nothing else in the codebase should hardcode it.
export const PRODUCT_NAME = "Document Photo Repair";
export const TAGLINE = "Fix the photo. Keep the document.";
export const DESCRIPTION =
  "Turn messy document photos into clean, readable scans in seconds. Straighten, remove shadows and export a PDF, right in your browser.";

const env = import.meta.env;

const WEB3FORMS_ENDPOINT = "https://api.web3forms.com/submit";

/**
 * Web3Forms access key. It is designed to be public (it ships in the page and only routes
 * submissions to your inbox), so it is read from env rather than committed.
 */
const ACCESS_KEY: string = (env.VITE_WEB3FORMS_ACCESS_KEY ?? "").trim();

/** Where signups are POSTed. Empty means signups are not open. */
export const WAITLIST_ENDPOINT: string = ACCESS_KEY === "" ? "" : WEB3FORMS_ENDPOINT;
/** Extra fields sent with every signup. */
export const WAITLIST_FIELDS: Record<string, string> = {
  access_key: ACCESS_KEY,
  subject: `New ${PRODUCT_NAME} waitlist signup`,
  from_name: `${PRODUCT_NAME} waitlist`,
};
/** Public origin without trailing slash; empty disables canonical/sitemap output. */
export const SITE_URL: string = (env.VITE_SITE_URL ?? "").trim().replace(/\/+$/, "");
