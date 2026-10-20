import { bytesToHex } from '../bytes';

export class OralbFrameError extends Error {
  override readonly name = 'OralbFrameError';

  constructor(
    readonly characteristic: string,
    readonly expected: string,
    readonly received: string,
  ) {
    super(
      `Oral-B frame on ${characteristic} is unreadable: expected ${expected}, received ${received}.`,
    );
  }
}

export class UnsupportedOralbProtocol extends Error {
  override readonly name = 'UnsupportedOralbProtocol';

  constructor(readonly protocol: number) {
    super(`Oral-B protocol ${String(protocol)} is not an iO protocol and is not supported.`);
  }
}

export class OralbRefusedError extends Error {
  override readonly name = 'OralbRefusedError';
}

function describe(bytes: Uint8Array): string {
  return `${String(bytes.length)} bytes ${bytesToHex(bytes)}`;
}

export function requireLength(
  characteristic: string,
  bytes: Uint8Array,
  lengths: readonly number[],
): void {
  if (!lengths.includes(bytes.length)) {
    throw new OralbFrameError(characteristic, `${lengths.join(' or ')} bytes`, describe(bytes));
  }
}

export function requireAtLeast(characteristic: string, bytes: Uint8Array, minimum: number): void {
  if (bytes.length < minimum) {
    throw new OralbFrameError(characteristic, `at least ${String(minimum)} bytes`, describe(bytes));
  }
}
