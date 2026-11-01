// Links to the public website, which hosts the privacy policy and terms. Kept out of config.ts because
// vite.config.ts imports that file in Node, where import.meta.env does not exist.

/** Where the waitlist site is served until uncrmple.app is set up; override with VITE_SITE_URL at build time. */
const DEFAULT_SITE_URL = "https://uncrmple-production.up.railway.app";

/** Adds https:// when missing and drops trailing slashes, so "example.com/" still makes working links. */
export function toOrigin(raw: string): string {
  const s = raw.trim().replace(/\/+$/, "");
  return /^https?:\/\//i.test(s) ? s : `https://${s}`;
}

export const SITE_URL: string = toOrigin(import.meta.env.VITE_SITE_URL?.trim() || DEFAULT_SITE_URL);
export const PRIVACY_URL = `${SITE_URL}/privacy/`;
export const TERMS_URL = `${SITE_URL}/terms/`;
/** Same contact as the waitlist site (waitlist/src/config.ts); VITE_CONTACT_EMAIL overrides it. */
export const CONTACT_EMAIL: string = import.meta.env.VITE_CONTACT_EMAIL?.trim() || "dddavid.works@gmail.com";
