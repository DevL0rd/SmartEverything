const UTF16_LE = [0xff, 0xfe];

const UTF16_BE = [0xfe, 0xff];

const UTF8_BOM = [0xef, 0xbb, 0xbf];

function startsWith(bytes: Uint8Array, prefix: readonly number[]): boolean {
  return prefix.every((value, index) => bytes[index] === value);
}

function swapped(bytes: Uint8Array): Uint8Array {
  const out = new Uint8Array(bytes.length - (bytes.length % 2));
  for (let index = 0; index < out.length; index += 2) {
    out[index] = bytes[index + 1] ?? 0;
    out[index + 1] = bytes[index] ?? 0;
  }
  return out;
}

export class BinaryContentError extends Error {
  override readonly name = 'BinaryContentError';

  constructor() {
    super('The file holds binary data, not text.');
  }
}

export function decodeText(bytes: Uint8Array): string {
  if (startsWith(bytes, UTF16_LE)) {
    return new TextDecoder('utf-16le').decode(bytes.subarray(2));
  }
  if (startsWith(bytes, UTF16_BE)) {
    return new TextDecoder('utf-16le').decode(swapped(bytes.subarray(2)));
  }
  const body = startsWith(bytes, UTF8_BOM) ? bytes.subarray(3) : bytes;
  if (body.includes(0)) {
    throw new BinaryContentError();
  }
  return new TextDecoder('utf-8').decode(body);
}

export function plainText(bytes: Uint8Array): string {
  return decodeText(bytes).replace(/\s+/gu, ' ').trim();
}
