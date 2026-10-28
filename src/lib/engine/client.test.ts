import type { Engine } from "./jobs";
import type { FromWorker, ToWorker } from "./protocol";
import { workerEngine } from "./client";

/** A stand-in worker: records posted jobs and lets the test send its replies. */
class FakeWorker {
  posted: ToWorker[] = [];
  terminated = false;
  onmessage: ((e: MessageEvent<FromWorker>) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  postMessage(m: ToWorker) { this.posted.push(m); }
  terminate() { this.terminated = true; }
  reply(m: FromWorker) { this.onmessage?.({ data: m } as MessageEvent<FromWorker>); }
}

const ASSESSMENT = { ok: true, value: { verdict: "good" } } as never;

function setup() {
  const worker = new FakeWorker();
  const local = { assess: vi.fn(async () => ({ ok: true, value: { verdict: "local" } })) } as unknown as Engine;
  const engine = workerEngine(() => worker as unknown as Worker, () => local);
  return { worker, local, engine };
}
const tick = () => new Promise((r) => setTimeout(r, 0));

describe("worker engine client", () => {
  it("sends jobs to a worker that can process images and returns its results", async () => {
    const { worker, local, engine } = setup();
    worker.reply({ type: "hello", ok: true });
    const file = new Blob(["x"]);
    const result = engine.assess(file);
    await tick();
    expect(worker.posted).toEqual([{ id: 1, kind: "assess", args: [file] }]);
    worker.reply({ type: "result", id: 1, result: ASSESSMENT });
    expect(await result).toBe(ASSESSMENT);
    expect(local.assess).not.toHaveBeenCalled();
  });

  it("works on the page when the worker cannot decode images", async () => {
    const { worker, local, engine } = setup();
    worker.reply({ type: "hello", ok: false });
    expect(await engine.assess(new Blob(["x"]))).toMatchObject({ ok: true, value: { verdict: "local" } });
    expect(worker.posted).toEqual([]);
    expect(worker.terminated).toBe(true);
    expect(local.assess).toHaveBeenCalledTimes(1);
  });

  it("works on the page when the worker fails to start", async () => {
    const { worker, local, engine } = setup();
    worker.onerror?.(new Event("error"));
    await engine.assess(new Blob(["x"]));
    expect(local.assess).toHaveBeenCalledTimes(1);
  });

  it("fails a job in progress if the worker stops, rather than leaving it waiting", async () => {
    const { worker, engine } = setup();
    worker.reply({ type: "hello", ok: true });
    const result = engine.assess(new Blob(["x"]));
    await tick();
    worker.onerror?.(new Event("error"));
    expect(await result).toMatchObject({ ok: false, error: { code: "processing-failed" } });
  });
});
