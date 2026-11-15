import { countBucket } from "./events";
import { ANALYTICS_PATH, createTracker, track, trackPageview, type TrackerConfig } from "./track";

const ID = "3f2b8c1e-5d4a-4e7b-9c1f-2a6d8e0b4c7a";

function setup(overrides: Partial<TrackerConfig> = {}) {
  const sent: { path: string; body: unknown }[] = [];
  const tracker = createTracker({
    websiteId: ID,
    allowedHost: "uncrmple.app",
    currentHost: "uncrmple.app",
    send: (path, body) => sent.push({ path, body: JSON.parse(body) }),
    ...overrides,
  });
  return { tracker, sent };
}

describe("usage tracking", () => {
  it("sends nothing without a website ID, with a malformed one, or away from the official domain", () => {
    for (const overrides of [
      { websiteId: "" },
      { websiteId: "not-a-uuid" },
      { currentHost: "localhost:7200" },
      { currentHost: "uncrmple-production-4ada.up.railway.app" },
    ]) {
      const { tracker, sent } = setup(overrides);
      tracker.pageview();
      tracker.track({ name: "export", data: { format: "pdf", pages: "1" } });
      expect(tracker.enabled).toBe(false);
      expect(sent).toEqual([]);
    }
  });

  it("sends an event with its fixed data and nothing about the visitor's page or browser", () => {
    const { tracker, sent } = setup();
    tracker.track({ name: "export", data: { format: "zip", pages: "2-5" } });
    expect(sent).toEqual([
      {
        path: ANALYTICS_PATH,
        body: {
          type: "event",
          payload: { website: ID, hostname: "uncrmple.app", url: "/", title: "", name: "export", data: { format: "zip", pages: "2-5" } },
        },
      },
    ]);
  });

  it("sends a page view as an event without a name", () => {
    const { tracker, sent } = setup();
    tracker.pageview();
    expect(sent).toEqual([{ path: ANALYTICS_PATH, body: { type: "event", payload: { website: ID, hostname: "uncrmple.app", url: "/", title: "" } } }]);
  });

  it("never lets a failed send reach the caller", () => {
    const { tracker } = setup({
      send: () => {
        throw new Error("offline");
      },
    });
    expect(() => tracker.track({ name: "card_reset", data: {} })).not.toThrow();
  });

  it("makes no request from the test environment, which is not the official domain", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    trackPageview();
    track({ name: "image_download", data: { mode: "page" } });
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});

describe("countBucket", () => {
  it("reports counts only as ranges", () => {
    expect([0, 1, 2, 5, 6, 10, 11, 20].map(countBucket)).toEqual(["0", "1", "2-5", "2-5", "6-10", "6-10", "11+", "11+"]);
  });
});
