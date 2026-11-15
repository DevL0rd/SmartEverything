const MAGIC = 'icns';

const HEADER_BYTES = 8;

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export function isPng(bytes: Uint8Array): boolean {
  return PNG_SIGNATURE.every((value, index) => bytes[index] === value);
}

export function largestIcnsPng(bytes: Uint8Array): Uint8Array | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (
    bytes.length < HEADER_BYTES ||
    Buffer.from(bytes.subarray(0, 4)).toString('latin1') !== MAGIC
  ) {
    return null;
  }
  const end = Math.min(view.getUint32(4), bytes.length);
  let best: Uint8Array | null = null;
  for (let offset = HEADER_BYTES; offset + HEADER_BYTES <= end;) {
    const length = view.getUint32(offset + 4);
    if (length < HEADER_BYTES || offset + length > end) break;
    const data = bytes.subarray(offset + HEADER_BYTES, offset + length);
    if (isPng(data) && (best === null || data.length > best.length)) best = data;
    offset += length;
  }
  return best;
}
