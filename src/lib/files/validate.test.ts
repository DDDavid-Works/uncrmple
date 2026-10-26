import { readDimensions, sniffFormat } from "./sniff";
import { validateImageBytes } from "./validate";
import { MAX_FILE_BYTES } from "./limits";
import { jpegHeader, pngHeader, webpVp8x } from "../../tests/fixtures";

describe("sniffFormat", () => {
  it("detects by magic bytes", () => {
    expect(sniffFormat(pngHeader(10, 10))).toBe("png");
    expect(sniffFormat(jpegHeader(10, 10))).toBe("jpeg");
    expect(sniffFormat(webpVp8x(10, 10))).toBe("webp");
  });
  it("rejects other content regardless of name", () => {
    expect(sniffFormat(new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'/>"))).toBeNull();
    expect(sniffFormat(new Uint8Array(0))).toBeNull();
  });
});

describe("readDimensions", () => {
  it("reads PNG, JPEG and WebP dimensions", () => {
    expect(readDimensions(pngHeader(800, 600), "png")).toEqual({ width: 800, height: 600 });
    expect(readDimensions(jpegHeader(4032, 3024), "jpeg")).toEqual({ width: 4032, height: 3024 });
    expect(readDimensions(webpVp8x(1200, 1600), "webp")).toEqual({ width: 1200, height: 1600 });
  });
  it("returns null for truncated headers", () => {
    expect(readDimensions(jpegHeader(10, 10).subarray(0, 15), "jpeg")).toBeNull();
    expect(readDimensions(pngHeader(10, 10).subarray(0, 20), "png")).toBeNull();
  });
});

describe("validateImageBytes", () => {
  it("accepts a normal photo", () => {
    const r = validateImageBytes(jpegHeader(4032, 3024), 3_000_000);
    expect(r).toEqual({ ok: true, format: "jpeg", dimensions: { width: 4032, height: 3024 } });
  });
  it("rejects empty, oversized, and unknown files", () => {
    expect(validateImageBytes(new Uint8Array(0), 0)).toMatchObject({ ok: false });
    expect(validateImageBytes(jpegHeader(1000, 1000), MAX_FILE_BYTES + 1)).toMatchObject({ ok: false });
    expect(validateImageBytes(new Uint8Array([1, 2, 3, 4]), 4)).toMatchObject({ ok: false });
  });
  it("rejects images that are too large or too small before decoding", () => {
    expect(validateImageBytes(pngHeader(9000, 9000), 1000)).toMatchObject({ ok: false });
    expect(validateImageBytes(pngHeader(13000, 200), 1000)).toMatchObject({ ok: false });
    expect(validateImageBytes(pngHeader(50, 50), 1000)).toMatchObject({ ok: false });
  });
});
