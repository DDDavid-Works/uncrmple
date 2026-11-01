export interface ZipEntry {
  name: string;
  data: Uint8Array;
}

/** Entries and sizes beyond these need ZIP64, which a page export never reaches. */
const MAX_ENTRIES = 0xffff;
const MAX_BYTES = 0xffffffff;
/** General purpose flag 11: file names are UTF-8. */
const UTF8 = 0x0800;

let crcTable: Uint32Array | null = null;

/** CRC-32 (IEEE 802.3), as ZIP requires for every entry. */
export function crc32(data: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) crc = crcTable[(crc ^ data[i]!) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** MS-DOS date and time, the only timestamp a plain ZIP header holds (2-second precision, from 1980). */
function dosDateTime(d: Date): { time: number; date: number } {
  const year = Math.min(Math.max(d.getFullYear(), 1980), 2107);
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

/**
 * A ZIP archive of the given files, stored without compression: the images are PNGs, which are
 * already compressed, so deflating them again would cost time for almost no saving.
 */
export function buildZip(entries: ZipEntry[], modified = new Date()): Uint8Array {
  if (entries.length > MAX_ENTRIES) throw new RangeError("Too many files for one ZIP archive.");
  const encoder = new TextEncoder();
  const { time, date } = dosDateTime(modified);
  const files = entries.map((e) => ({ name: encoder.encode(e.name), data: e.data, crc: crc32(e.data) }));

  const localSize = files.reduce((n, f) => n + 30 + f.name.length + f.data.length, 0);
  const centralSize = files.reduce((n, f) => n + 46 + f.name.length, 0);
  const total = localSize + centralSize + 22;
  if (total > MAX_BYTES) throw new RangeError("The images are too large for one ZIP archive.");

  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  let at = 0;
  const u16 = (v: number) => {
    view.setUint16(at, v, true);
    at += 2;
  };
  const u32 = (v: number) => {
    view.setUint32(at, v, true);
    at += 4;
  };
  const bytes = (b: Uint8Array) => {
    out.set(b, at);
    at += b.length;
  };

  const offsets: number[] = [];
  for (const f of files) {
    offsets.push(at);
    u32(0x04034b50); // local file header
    u16(20); // version needed: 2.0
    u16(UTF8);
    u16(0); // stored
    u16(time);
    u16(date);
    u32(f.crc);
    u32(f.data.length); // compressed size
    u32(f.data.length); // uncompressed size
    u16(f.name.length);
    u16(0); // extra field length
    bytes(f.name);
    bytes(f.data);
  }

  const centralStart = at;
  files.forEach((f, i) => {
    u32(0x02014b50); // central directory header
    u16(20); // made by: 2.0
    u16(20); // version needed: 2.0
    u16(UTF8);
    u16(0);
    u16(time);
    u16(date);
    u32(f.crc);
    u32(f.data.length);
    u32(f.data.length);
    u16(f.name.length);
    u16(0); // extra field length
    u16(0); // comment length
    u16(0); // disk number
    u16(0); // internal attributes
    u32(0); // external attributes
    u32(offsets[i]!);
    bytes(f.name);
  });

  u32(0x06054b50); // end of central directory
  u16(0);
  u16(0);
  u16(files.length);
  u16(files.length);
  u32(centralSize);
  u32(centralStart);
  u16(0); // comment length
  return out;
}

/**
 * Names for the files in an export: numbered in page order so they sort the same way in any file
 * manager, with path separators and other characters file systems reject replaced.
 */
export function numberedNames(names: string[]): string[] {
  const width = Math.max(2, String(names.length).length);
  return names.map((n, i) => `${String(i + 1).padStart(width, "0")}-${n.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_")}`);
}
