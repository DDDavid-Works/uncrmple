import caddyfile from "../../Caddyfile.template?raw";
import { ANALYTICS_PATH } from "../lib/analytics/track";
import {
  contentSecurityPolicyFor,
  isWorkerScript,
  PAGE_CONTENT_SECURITY_POLICY,
  SECURITY_HEADERS,
  WORKER_CONTENT_SECURITY_POLICY,
  WORKER_SCRIPT_PATH,
} from "../security-headers";

const directive = (policy: string, name: string) => policy.split("; ").find((d) => d.startsWith(`${name} `));

describe("security headers", () => {
  it("are sent by the production Caddyfile exactly as `vite preview` sends them", () => {
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
      expect(caddyfile).toContain(`${name} "${value}"`);
    }
    expect(caddyfile).toContain(`@worker path ${WORKER_SCRIPT_PATH}`);
    expect(caddyfile).toContain(`@page not path ${WORKER_SCRIPT_PATH}`);
    expect(caddyfile).toContain(`header @page Content-Security-Policy "${PAGE_CONTENT_SECURITY_POLICY}"`);
    expect(caddyfile).toContain(`header @worker Content-Security-Policy "${WORKER_CONTENT_SECURITY_POLICY}"`);
  });

  it("let the image-processing worker reach no server, only local blob: URLs", () => {
    expect(directive(WORKER_CONTENT_SECURITY_POLICY, "connect-src")).toBe("connect-src blob:");
    expect(WORKER_CONTENT_SECURITY_POLICY).toContain("default-src 'none'");
  });

  it("let the page reach only blob: URLs and this site itself", () => {
    expect(directive(PAGE_CONTENT_SECURITY_POLICY, "connect-src")).toBe("connect-src blob: 'self'");
    expect(PAGE_CONTENT_SECURITY_POLICY).toContain("default-src 'none'");
  });

  it("give the worker script, and only it, the worker policy", () => {
    expect(isWorkerScript("/assets/engine.worker-95myCIuG.js")).toBe(true);
    expect(isWorkerScript("/assets/engine.worker-95myCIuG.js?v=1")).toBe(true);
    expect(isWorkerScript("/assets/index-Cu_rOLY0.js")).toBe(false);
    expect(isWorkerScript("/")).toBe(false);
    expect(contentSecurityPolicyFor("/assets/engine.worker-abc.js")).toBe(WORKER_CONTENT_SECURITY_POLICY);
    expect(contentSecurityPolicyFor("/index.html")).toBe(PAGE_CONTENT_SECURITY_POLICY);
  });

  it("forbid inline and third-party scripts", () => {
    for (const policy of [PAGE_CONTENT_SECURITY_POLICY, WORKER_CONTENT_SECURITY_POLICY]) {
      expect(policy).not.toContain("'unsafe-inline'");
      expect(policy).toContain("script-src 'self' ");
    }
  });

  it("forward only small POSTs to the analytics address, without cookies", () => {
    expect(caddyfile).toMatch(new RegExp(`@analytics \\{\\s*method POST\\s*path ${ANALYTICS_PATH}\\s*\\}`));
    expect(caddyfile).toMatch(/max_size 4KB/);
    expect(caddyfile).toContain("request_header -Cookie");
    expect(caddyfile).toContain("reverse_proxy https://cloud.umami.is");
  });

  // Live failure on 2026-11-21: Umami Cloud's Cloudflare answered 403 (error 1000) to every hit from
  // uncrmple.app, because the forwarded request still carried our Cloudflare's CF-Connecting-IP.
  it("drop Cloudflare's headers before forwarding, passing the visitor's address in Umami's header", () => {
    expect(caddyfile).toContain("header_up -CF-Connecting-IP");
    expect(caddyfile).toContain("header_up X-Umami-Client-IP {http.request.header.CF-Connecting-IP}");
  });
});
