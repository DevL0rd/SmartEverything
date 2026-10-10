export interface ImageSize {
  readonly width: number;
  readonly height: number;
}

function png(bytes: Buffer): ImageSize | null {
  return bytes.length >= 24 && bytes.toString('ascii', 1, 4) === 'PNG'
    ? { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) }
    : null;
}

function gif(bytes: Buffer): ImageSize | null {
  return bytes.length >= 10 && bytes.toString('ascii', 0, 3) === 'GIF'
    ? { width: bytes.readUInt16LE(6), height: bytes.readUInt16LE(8) }
    : null;
}

function isFrameMarker(marker: number): boolean {
  return marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
}

function jpeg(bytes: Buffer): ImageSize | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    return null;
  }
  let offset = 2;
  while (offset + 9 < bytes.length) {
    const marker = bytes[offset + 1] ?? 0;
    if (bytes[offset] !== 0xff) {
      return null;
    }
    if (isFrameMarker(marker)) {
      return { height: bytes.readUInt16BE(offset + 5), width: bytes.readUInt16BE(offset + 7) };
    }
    offset += 2 + bytes.readUInt16BE(offset + 2);
  }
  return null;
}

function webp(bytes: Buffer): ImageSize | null {
  if (bytes.length < 30 || bytes.toString('ascii', 8, 12) !== 'WEBP') {
    return null;
  }
  const chunk = bytes.toString('ascii', 12, 16);
  if (chunk === 'VP8X') {
    return { width: 1 + bytes.readUIntLE(24, 3), height: 1 + bytes.readUIntLE(27, 3) };
  }
  if (chunk === 'VP8L') {
    const bits = bytes.readUInt32LE(21);
    return { width: 1 + (bits & 0x3fff), height: 1 + ((bits >> 14) & 0x3fff) };
  }
  if (chunk === 'VP8 ') {
    return { width: bytes.readUInt16LE(26) & 0x3fff, height: bytes.readUInt16LE(28) & 0x3fff };
  }
  return null;
}

export function imageSize(bytes: Buffer): ImageSize | null {
  const size = png(bytes) ?? gif(bytes) ?? jpeg(bytes) ?? webp(bytes);
  return size !== null && size.width > 0 && size.height > 0 ? size : null;
}
