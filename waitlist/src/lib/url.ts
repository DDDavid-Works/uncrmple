/**
 * Turns a configured site address into an origin with a scheme and no trailing slash, so
 * "example.com/" becomes "https://example.com". Without the scheme, canonical links and the
 * sitemap would be read as relative paths. Empty input stays empty.
 */
export function toOrigin(raw: string): string {
  const s = raw.trim().replace(/\/+$/, "");
  if (s === "") return "";
  return /^https?:\/\//i.test(s) ? s : `https://${s}`;
}
