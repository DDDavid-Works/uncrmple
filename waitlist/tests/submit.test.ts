import { submitEmail } from "../src/lib/submit";

const resp = (ok: boolean, body: unknown) => ({ ok, json: async () => body }) as Response;
const asFetch = (f: unknown) => f as typeof fetch;
const URL = "https://x.test/f";

describe("submitEmail", () => {
  it("fails without calling the network when no endpoint is configured", async () => {
    const f = vi.fn();
    const r = await submitEmail("", "a@b.co", {}, asFetch(f));
    expect(r.ok).toBe(false);
    expect(f).not.toHaveBeenCalled();
  });
  it("POSTs JSON with the extra fields and reports success", async () => {
    const f = vi.fn().mockResolvedValue(resp(true, { success: true }));
    const r = await submitEmail(URL, "a@b.co", { access_key: "k" }, asFetch(f));
    expect(r).toEqual({ ok: true });
    expect(f).toHaveBeenCalledWith(
      URL,
      expect.objectContaining({ method: "POST", body: '{"access_key":"k","email":"a@b.co"}' }),
    );
  });
  it("fails when HTTP is OK but the service says success is false", async () => {
    const f = vi.fn().mockResolvedValue(resp(true, { success: false, message: "Invalid key" }));
    expect((await submitEmail(URL, "a@b.co", {}, asFetch(f))).ok).toBe(false);
  });
  it("fails when the response is not JSON", async () => {
    const f = vi.fn().mockResolvedValue({ ok: true, json: async () => { throw new Error("bad"); } });
    expect((await submitEmail(URL, "a@b.co", {}, asFetch(f))).ok).toBe(false);
  });
  it("reports a server error", async () => {
    const f = vi.fn().mockResolvedValue(resp(false, { success: true }));
    expect((await submitEmail(URL, "a@b.co", {}, asFetch(f))).ok).toBe(false);
  });
  it("reports a network failure", async () => {
    const f = vi.fn().mockRejectedValue(new Error("down"));
    expect((await submitEmail(URL, "a@b.co", {}, asFetch(f))).ok).toBe(false);
  });
});
