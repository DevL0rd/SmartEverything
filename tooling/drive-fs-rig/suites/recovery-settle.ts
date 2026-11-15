import { lstat } from 'node:fs/promises';
import { join } from 'node:path';
import { isMissing } from '../errors.ts';
import { compare, ok, walk, type Entry, type Report } from '../manifest.ts';

export interface Snapshot {
  readonly present: number;
  readonly bytes: number;
  readonly complete: boolean;
  readonly signature: string;
}

export interface SettleIo {
  readonly snapshot: () => Promise<Snapshot>;
  readonly verify: () => Promise<Report>;
  readonly sleep: (ms: number) => Promise<void>;
  readonly now: () => number;
}

export interface SettleLimits {
  readonly idleMs: number;
  readonly graceMs: number;
  readonly pollMs: number;
}

export async function settle(io: SettleIo, limits: SettleLimits): Promise<Report> {
  let progressAt = io.now();
  let seen = '';
  let verified = '';
  let last: Report | null = null;
  for (;;) {
    const snapshot = await io.snapshot();
    const key = `${String(snapshot.present)}:${String(snapshot.bytes)}`;
    if (key !== seen) {
      seen = key;
      progressAt = io.now();
    }
    if (snapshot.complete && snapshot.signature !== verified) {
      verified = snapshot.signature;
      last = await io.verify();
      progressAt = io.now();
      if (ok(last)) {
        await io.sleep(limits.graceMs);
        return io.verify();
      }
    }
    if (io.now() - progressAt > limits.idleMs) return last ?? io.verify();
    await io.sleep(limits.pollMs);
  }
}

export async function hubSnapshot(
  directory: string,
  expected: readonly Entry[],
): Promise<Snapshot> {
  let present = 0;
  let bytes = 0;
  let newest = 0;
  let complete = true;
  for (const entry of expected) {
    if (entry.type !== 'file') continue;
    try {
      const stat = await lstat(join(directory, entry.path));
      present += 1;
      bytes += stat.size;
      newest = Math.max(newest, stat.mtimeMs);
      if (stat.size !== entry.size) complete = false;
    } catch (cause) {
      if (!isMissing(cause)) throw cause;
      complete = false;
    }
  }
  return { present, bytes, complete, signature: `${String(bytes)}:${String(newest)}` };
}

export async function hubReport(directory: string, expected: readonly Entry[]): Promise<Report> {
  let actual: readonly Entry[] = [];
  try {
    actual = await walk(directory);
  } catch (cause) {
    if (!isMissing(cause)) throw cause;
  }
  return compare(expected, actual, { modes: false });
}
