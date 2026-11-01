// HTTP response headers for the repair app. Caddyfile.template sends them in production (Railway) and
// vite.config.ts sends them from `vite preview`; src/tests/security-headers.test.ts keeps the two in step.
// They are headers, not a <meta> tag, because a meta policy does not reach the Web Worker that holds the pixels.

/**
 * Only this site's own code may run, and the page and worker may not contact any server: connect-src
 * allows blob: (reading local object URLs for export) and nothing else, so document data cannot be sent
 * anywhere even by injected code. OpenCV.js needs 'unsafe-eval' (its embind bindings build functions with
 * new Function) and 'wasm-unsafe-eval' (to compile its WebAssembly); inline and third-party scripts stay blocked.
 */
export const CONTENT_SECURITY_POLICY = [
  "default-src 'none'",
  "script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval'",
  "worker-src 'self'",
  "style-src 'self'",
  "img-src 'self' blob: data:",
  "font-src 'self'",
  "connect-src blob:",
  "manifest-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join("; ");

export const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  "Content-Security-Policy": CONTENT_SECURITY_POLICY,
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  "Cross-Origin-Opener-Policy": "same-origin",
};
