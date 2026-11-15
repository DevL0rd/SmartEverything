const EXIF_PREFIX = 'Exif\0\0';
const ORIENTATION_TAG = 0x0112;
const ENTRY_SIZE = 12;
const APP1 = 0xe1;
const SEGMENT_MAX = 0xffff;
const SOI_SIZE = 2;

export function uprightExif(exif: Buffer): Buffer {
  const copy = Buffer.from(exif);
  const base =
    copy.toString('latin1', 0, EXIF_PREFIX.length) === EXIF_PREFIX ? EXIF_PREFIX.length : 0;
  const little = copy.toString('latin1', base, base + 2) === 'II';
  const u16 = (at: number): number => (little ? copy.readUInt16LE(at) : copy.readUInt16BE(at));
  const u32 = (at: number): number => (little ? copy.readUInt32LE(at) : copy.readUInt32BE(at));
  if (copy.length < base + 8) return copy;
  const ifd = base + u32(base + 4);
  if (ifd + 2 > copy.length) return copy;
  const count = u16(ifd);
  for (let index = 0; index < count; index += 1) {
    const entry = ifd + 2 + index * ENTRY_SIZE;
    if (entry + ENTRY_SIZE > copy.length) return copy;
    if (u16(entry) === ORIENTATION_TAG) {
      if (little) copy.writeUInt16LE(1, entry + 8);
      else copy.writeUInt16BE(1, entry + 8);
      return copy;
    }
  }
  return copy;
}

export function embedExif(jpeg: Buffer, exif: Buffer): Buffer {
  const payload =
    exif.toString('latin1', 0, EXIF_PREFIX.length) === EXIF_PREFIX
      ? exif
      : Buffer.concat([Buffer.from(EXIF_PREFIX, 'latin1'), exif]);
  if (payload.length + 2 > SEGMENT_MAX) return jpeg;
  const header = Buffer.from([0xff, APP1, 0, 0]);
  header.writeUInt16BE(payload.length + 2, 2);
  return Buffer.concat([jpeg.subarray(0, SOI_SIZE), header, payload, jpeg.subarray(SOI_SIZE)]);
}
