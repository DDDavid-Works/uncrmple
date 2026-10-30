// Links to the public website, which hosts the privacy policy and terms. Kept out of config.ts because
// vite.config.ts imports that file in Node, where import.meta.env does not exist.

/** Where the waitlist site is served until uncrmple.com is set up; override with VITE_SITE_URL at build time. */
const DEFAULT_SITE_URL = "https://uncrmple-production.up.railway.app";

export const SITE_URL: string = (import.meta.env.VITE_SITE_URL ?? DEFAULT_SITE_URL).trim().replace(/\/+$/, "");
export const PRIVACY_URL = `${SITE_URL}/privacy/`;
export const TERMS_URL = `${SITE_URL}/terms/`;
export const CONTACT_EMAIL = "hello@uncrmple.com";
