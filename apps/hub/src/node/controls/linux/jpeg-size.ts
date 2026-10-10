const START_OF_FRAME = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
]);

export interface ImageSize {
  readonly width: number;
  readonly height: number;
}

export function jpegSize(data: Buffer): ImageSize | null {
  let offset = 2;
  while (offset + 9 < data.length) {
    if (data[offset] !== 0xff) {
      return null;
    }
    const marker = data[offset + 1] ?? 0;
    if (START_OF_FRAME.has(marker)) {
      return { height: data.readUInt16BE(offset + 5), width: data.readUInt16BE(offset + 7) };
    }
    offset += 2 + data.readUInt16BE(offset + 2);
  }
  return null;
}
