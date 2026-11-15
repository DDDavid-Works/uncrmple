// HTTP response headers for the repair app. Caddyfile.template sends them in production (Railway) and
// vite.config.ts sends them from `vite preview`; src/tests/security-headers.test.ts keeps the two in step.
// They are headers, not a <meta> tag, because a meta policy does not reach the Web Worker that holds the pixels.

const policy = (connectSrc: string) =>
  [
    "default-src 'none'",
    "script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval'",
    "worker-src 'self'",
    "style-src 'self'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    `connect-src ${connectSrc}`,
    "manifest-src 'self'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join("; ");

/**
 * Only this site's own code may run. The page may connect to local blob: URLs (reading object URLs for
 * export) and to this site itself, for the anonymous usage counts in src/lib/analytics (sent to /e, which
 * the server forwards); no other server can be reached, even by injected code. OpenCV.js needs
 * 'unsafe-eval' (its embind bindings build functions with new Function) and 'wasm-unsafe-eval' (to compile
 * its WebAssembly); inline and third-party scripts stay blocked.
 */
export const PAGE_CONTENT_SECURITY_POLICY = policy("blob: 'self'");

/**
 * The image-processing worker decodes and repairs the photos, so it may reach no server at all, not even
 * this site: only blob: URLs. A dedicated worker follows the policy sent with its own script.
 */
export const WORKER_CONTENT_SECURITY_POLICY = policy("blob:");

/** Built name of the worker script (src/lib/engine/engine.worker.ts), as Caddyfile.template matches it. */
export const WORKER_SCRIPT_PATH = "/assets/engine.worker-*.js";

export function isWorkerScript(path: string): boolean {
  return /^\/assets\/engine\.worker-[^/]+\.js$/.test(path.split("?")[0]!);
}

export function contentSecurityPolicyFor(path: string): string {
  return isWorkerScript(path) ? WORKER_CONTENT_SECURITY_POLICY : PAGE_CONTENT_SECURITY_POLICY;
}

/** Sent with every response; the Content-Security-Policy depends on the path (see above). */
export const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  "Cross-Origin-Opener-Policy": "same-origin",
};
