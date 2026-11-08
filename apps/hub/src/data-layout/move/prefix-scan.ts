import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { z } from 'zod';

const READ_CHUNK_BYTES = 1024 * 1024;
const COUNT = z.int().nonnegative();
const SHA256 = z.string().regex(/^[0-9a-f]{64}$/);

export const SCAN_REQUEST = z.strictObject({
  id: COUNT,
  path: z.string().min(1),
  prefix: z.string().min(1),
});

export const SCAN_RESPONSE = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('scanned'),
    id: COUNT,
    sha256: SHA256,
    bytes: COUNT,
    prefixHits: COUNT,
  }),
  z.strictObject({ kind: z.literal('failed'), id: COUNT, code: z.string().min(1) }),
]);

export type ScanRequest = z.infer<typeof SCAN_REQUEST>;
export type ScanResponse = z.infer<typeof SCAN_RESPONSE>;

export interface FileScan {
  readonly sha256: string;
  readonly bytes: number;
  readonly prefixHits: number;
}

const DIGIT_LOW = 0x30;
const DIGIT_HIGH = 0x39;
const UPPER_LOW = 0x41;
const UPPER_HIGH = 0x5a;
const LOWER_LOW = 0x61;
const LOWER_HIGH = 0x7a;
const UNDERSCORE = 0x5f;
const HYPHEN = 0x2d;
const NON_ASCII = 0x80;

function continuesName(byte: number): boolean {
  return (
    (byte >= DIGIT_LOW && byte <= DIGIT_HIGH) ||
    (byte >= UPPER_LOW && byte <= UPPER_HIGH) ||
    (byte >= LOWER_LOW && byte <= LOWER_HIGH) ||
    byte === UNDERSCORE ||
    byte === HYPHEN ||
    byte >= NON_ASCII
  );
}

export class PrefixCounter {
  private readonly needle: Buffer;
  private carry: Buffer = Buffer.alloc(0);
  private hits = 0;

  constructor(prefix: string) {
    this.needle = Buffer.from(prefix, 'utf8');
    if (this.needle.length === 0) {
      throw new Error('The prefix to search for is empty.');
    }
  }

  get count(): number {
    return this.hits;
  }

  push(chunk: Uint8Array): void {
    const window = Buffer.concat([this.carry, chunk]);
    const lastStart = window.length - this.needle.length - 1;
    for (let at = window.indexOf(this.needle); at !== -1 && at <= lastStart;) {
      if (!continuesName(window[at + this.needle.length] ?? 0)) {
        this.hits += 1;
      }
      at = window.indexOf(this.needle, at + 1);
    }
    this.carry = Buffer.from(window.subarray(Math.max(0, window.length - this.needle.length)));
  }

  finish(): number {
    if (this.carry.length >= this.needle.length && this.carry.indexOf(this.needle) === 0) {
      this.hits += 1;
    }
    this.carry = Buffer.alloc(0);
    return this.hits;
  }
}

export function countPrefix(text: string, prefix: string): number {
  const counter = new PrefixCounter(prefix);
  counter.push(Buffer.from(text, 'utf8'));
  return counter.finish();
}

export async function hashAndScan(path: string, prefix: string): Promise<FileScan> {
  const hash = createHash('sha256');
  const counter = new PrefixCounter(prefix);
  let bytes = 0;
  const stream = createReadStream(path, { highWaterMark: READ_CHUNK_BYTES });
  for await (const chunk of stream) {
    const data = Buffer.from(chunk);
    hash.update(data);
    counter.push(data);
    bytes += data.length;
  }
  return { sha256: hash.digest('hex'), bytes, prefixHits: counter.finish() };
}
