// Anonymous usage counts, sent to Umami Cloud through this site's own /e address (Caddyfile.template
// forwards it), so the page never contacts a third party and the Content-Security-Policy only has to
// allow the site itself. Sending is off unless VITE_UMAMI_WEBSITE_ID is set at build time AND the page is
// served from the official domain, so local runs, tests and the temporary Railway address send nothing.
// Failures are ignored: counting must never get in the way of a repair.
import { SITE_URL } from "../../links";
import type { AnalyticsEvent } from "./events";

/** Same-origin path that the server forwards to Umami's collection endpoint. */
export const ANALYTICS_PATH = "/e";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface TrackerConfig {
  /** Umami website ID; empty or malformed turns sending off. */
  websiteId: string;
  /** Only pages served from this host send anything. */
  allowedHost: string;
  /** Host of the current page. */
  currentHost: string;
  send: (path: string, body: string) => void;
}

export interface Tracker {
  readonly enabled: boolean;
  pageview: () => void;
  track: (event: AnalyticsEvent) => void;
}

export function createTracker(config: TrackerConfig): Tracker {
  const websiteId = config.websiteId.trim();
  const enabled = UUID.test(websiteId) && config.currentHost === config.allowedHost;

  // Only what Umami needs to file the hit: no referrer, query string, screen size or language.
  const post = (extra: Record<string, unknown>) => {
    if (!enabled) return;
    try {
      const payload = { website: websiteId, hostname: config.allowedHost, url: "/", title: "", ...extra };
      config.send(ANALYTICS_PATH, JSON.stringify({ type: "event", payload }));
    } catch {
      // ignored on purpose
    }
  };

  return {
    enabled,
    pageview: () => post({}),
    track: (event) => post({ name: event.name, data: event.data }),
  };
}

/** keepalive lets a hit sent just before the page closes (e.g. right after a download) still arrive. */
function beacon(path: string, body: string): void {
  void fetch(path, {
    method: "POST",
    body,
    headers: { "Content-Type": "application/json" },
    keepalive: true,
    credentials: "omit",
    referrerPolicy: "no-referrer",
  }).catch(() => undefined);
}

const tracker = createTracker({
  websiteId: import.meta.env.VITE_UMAMI_WEBSITE_ID ?? "",
  allowedHost: new URL(SITE_URL).host,
  currentHost: typeof location === "undefined" ? "" : location.host,
  send: beacon,
});

/** Count one visit to the app. */
export const trackPageview = (): void => tracker.pageview();

/** Count one action; see events.ts for the complete list. */
export const track = (event: AnalyticsEvent): void => tracker.track(event);
