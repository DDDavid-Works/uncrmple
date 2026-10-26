type Bytes = Uint8Array<ArrayBuffer>;

export function pngHeader(w: number, h: number): Bytes {
  const b = new Uint8Array(33);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
  b.set([0x49, 0x48, 0x44, 0x52], 12);
  const v = new DataView(b.buffer);
  v.setUint32(16, w);
  v.setUint32(20, h);
  return b;
}

export function jpegHeader(w: number, h: number): Bytes {
  // SOI, APP0 (len 16), SOF0
  const b = new Uint8Array(2 + 18 + 19);
  b.set([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
  const v = new DataView(b.buffer);
  v.setUint16(20, 0xffc0);
  v.setUint16(22, 17);
  b[24] = 8;
  v.setUint16(25, h);
  v.setUint16(27, w);
  return b;
}

export function webpVp8x(w: number, h: number): Bytes {
  const b = new Uint8Array(30);
  b.set([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x58]);
  const wm = w - 1, hm = h - 1;
  b.set([wm & 255, (wm >> 8) & 255, (wm >> 16) & 255, hm & 255, (hm >> 8) & 255, (hm >> 16) & 255], 24);
  return b;
}
