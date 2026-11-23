// Single place for branding. Also used by vite.config.ts to fill the page <title> and description in index.html.
export const PRODUCT_NAME = "Uncrmple";
/** Logotype shown in the header; screen readers get PRODUCT_NAME instead. */
export const WORDMARK = "uncrmple.";
export const TAGLINE = "Fix the photo. Keep the document.";
/**
 * The home page's title in search results and browser tabs: the words people search for, then the name.
 * The tagline is a slogan nobody searches for, so it stays on the page instead. Keep to 60 characters.
 */
export const SEARCH_TITLE = `Fix document photos: straighten, remove shadows | ${PRODUCT_NAME}`;
/** Search and link-preview summary for the app page. Keep to 160 characters. */
export const DESCRIPTION =
  "Fix photos of paper documents in your browser: straighten pages, remove shadows and export a clean PDF. Nothing to install, and photos never leave your device.";

/** Person responsible for the personal information described in the privacy policy. */
export const OPERATOR_NAME = "Darrel David";
export const OPERATOR_COUNTRY = "the Philippines";
/** Bump whenever the privacy policy text changes (src/legal/PrivacyPolicy.tsx). */
export const PRIVACY_UPDATED = "21 November 2026";
/** Bump whenever the terms of use text changes (src/legal/TermsOfUse.tsx). */
export const TERMS_UPDATED = "30 October 2026";
