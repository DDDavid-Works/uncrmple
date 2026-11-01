import { buildZip, crc32, numberedNames } from "./zip";

const enc = (s: string) => new TextEncoder().encode(s);

/** Read the archive back through its central directory, as an unzip tool would. */
function readZip(zip: Uint8Array) {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  const end = zip.length - 22;
  expect(view.getUint32(end, true)).toBe(0x06054b50);
  const count = view.getUint16(end + 10, true);
  const size = view.getUint32(end + 12, true);
  let at = view.getUint32(end + 16, true);
  expect(at + size).toBe(end);
  const files: { name: string; data: Uint8Array; crc: number; method: number; flags: number }[] = [];
  for (let i = 0; i < count; i++) {
    expect(view.getUint32(at, true)).toBe(0x02014b50);
    const flags = view.getUint16(at + 8, true);
    const method = view.getUint16(at + 10, true);
    const crc = view.getUint32(at + 16, true);
    const length = view.getUint32(at + 20, true);
    const nameLength = view.getUint16(at + 28, true);
    const local = view.getUint32(at + 42, true);
    const name = new TextDecoder().decode(zip.subarray(at + 46, at + 46 + nameLength));
    expect(view.getUint32(local, true)).toBe(0x04034b50);
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    files.push({ name, data: zip.subarray(start, start + length), crc, method, flags });
    at += 46 + nameLength;
  }
  return files;
}

describe("crc32", () => {
  it("matches the standard check value", () => {
    expect(crc32(enc("123456789"))).toBe(0xcbf43926);
    expect(crc32(new Uint8Array())).toBe(0);
  });
});

describe("buildZip", () => {
  it("stores every file unchanged, in the given order, with its checksum", () => {
    const pngs = [enc("\x89PNG first"), enc("\x89PNG second"), enc("\x89PNG third")];
    const zip = buildZip(pngs.map((data, i) => ({ name: `0${i + 1}-page.png`, data })));
    const files = readZip(zip);
    expect(files.map((f) => f.name)).toEqual(["01-page.png", "02-page.png", "03-page.png"]);
    files.forEach((f, i) => {
      expect([...f.data]).toEqual([...pngs[i]!]);
      expect(f.crc).toBe(crc32(pngs[i]!));
      expect(f.method).toBe(0);
    });
  });

  it("marks names as UTF-8 so accented and non-Latin names survive", () => {
    const [file] = readZip(buildZip([{ name: "01-reçu-領収書.png", data: enc("x") }]));
    expect(file!.name).toBe("01-reçu-領収書.png");
    expect(file!.flags & 0x0800).toBe(0x0800);
  });

  it("writes the modification time in MS-DOS format", () => {
    const zip = buildZip([{ name: "a.png", data: enc("x") }], new Date(2026, 10, 1, 14, 30, 42));
    const view = new DataView(zip.buffer);
    expect(view.getUint16(10, true)).toBe((14 << 11) | (30 << 5) | 21);
    expect(view.getUint16(12, true)).toBe(((2026 - 1980) << 9) | (11 << 5) | 1);
  });

  it("makes a valid empty archive", () => {
    expect(readZip(buildZip([]))).toEqual([]);
  });
});

describe("numberedNames", () => {
  it("numbers files in page order, keeping duplicate names apart", () => {
    expect(numberedNames(["scan-repaired.png", "scan-repaired.png"])).toEqual(["01-scan-repaired.png", "02-scan-repaired.png"]);
  });

  it("widens the number for long exports so names still sort", () => {
    const names = numberedNames(Array.from({ length: 120 }, () => "p.png"));
    expect(names[0]).toBe("001-p.png");
    expect(names[119]).toBe("120-p.png");
  });

  it("replaces characters that are not allowed in file names", () => {
    expect(numberedNames(['a/b\\c:d*e?"f<g>h|i.png'])).toEqual(["01-a_b_c_d_e__f_g_h_i.png"]);
  });
});
