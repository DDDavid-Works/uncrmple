import { probeImage } from "./decode";

const file = new Blob(["x"], { type: "image/jpeg" });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("probeImage", () => {
  it("reads the size with createImageBitmap and releases the bitmap", async () => {
    const close = vi.fn();
    const create = vi.fn(async () => ({ width: 3000, height: 2000, close }));
    vi.stubGlobal("createImageBitmap", create);
    const decode = vi.fn();
    HTMLImageElement.prototype.decode = decode;
    await expect(probeImage(file, "blob:x")).resolves.toEqual({ width: 3000, height: 2000 });
    expect(create).toHaveBeenCalledWith(file, { imageOrientation: "from-image" });
    expect(close).toHaveBeenCalled();
    expect(decode).not.toHaveBeenCalled();
  });

  it("falls back to an image element when createImageBitmap refuses the file", async () => {
    vi.stubGlobal("createImageBitmap", vi.fn(async () => { throw new Error("unsupported"); }));
    HTMLImageElement.prototype.decode = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(HTMLImageElement.prototype, "naturalWidth", "get").mockReturnValue(640);
    vi.spyOn(HTMLImageElement.prototype, "naturalHeight", "get").mockReturnValue(480);
    await expect(probeImage(file, "blob:x")).resolves.toEqual({ width: 640, height: 480 });
  });

  it("reports an image neither route can decode", async () => {
    vi.stubGlobal("createImageBitmap", vi.fn(async () => { throw new Error("corrupt"); }));
    HTMLImageElement.prototype.decode = vi.fn().mockRejectedValue(new Error("corrupt"));
    await expect(probeImage(file, "blob:x")).rejects.toThrow(/could not decode/);
  });
});
