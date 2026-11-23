import type { RasterImage } from "../../types/repair";
import { TINT_GAIN, tintChannels } from "./tint";

function flat(width: number, height: number, rgb: [number, number, number]): RasterImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = rgb[0];
    data[i + 1] = rgb[1];
    data[i + 2] = rgb[2];
    data[i + 3] = 255;
  }
  return { width, height, data };
}

describe("tintChannels", () => {
  it("puts neutral grey at 128 in both channels, whatever its brightness", () => {
    for (const v of [40, 150, 240]) {
      const [warm, green] = tintChannels(flat(8, 8, [v, v, v]));
      expect(new Set(warm.data)).toEqual(new Set([128]));
      expect(new Set(green.data)).toEqual(new Set([128]));
    }
  });

  it("magnifies a faint warm tint and a faint green tint", () => {
    const [warm] = tintChannels(flat(8, 8, [152, 148, 144]));
    expect(warm.data[0]).toBe(128 + TINT_GAIN * 8);
    const [, green] = tintChannels(flat(8, 8, [150, 154, 150]));
    expect(green.data[0]).toBe(128 + TINT_GAIN * 4);
  });

  it("leaves the source image unchanged", () => {
    const img = flat(4, 4, [200, 180, 160]);
    const before = new Uint8ClampedArray(img.data);
    tintChannels(img);
    expect(img.data).toEqual(before);
  });
});
