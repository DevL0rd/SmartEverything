import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, readdir, readlink } from 'node:fs/promises';
import { join, posix } from 'node:path';
import { z } from 'zod';

export const ENTRY = z.strictObject({
  path: z.string().min(1),
  type: z.enum(['file', 'dir', 'link']),
  size: z.int().nonnegative(),
  sha256: z
    .string()
    .regex(/^[0-9a-f]{64}$/u)
    .nullable(),
  mode: z.int().nonnegative(),
  linkTarget: z.string().nullable(),
});

export const MANIFEST = z.strictObject({
  name: z.string().min(1),
  createdAt: z.iso.datetime(),
  entries: z.array(ENTRY),
});

export type Entry = z.infer<typeof ENTRY>;
export type Manifest = z.infer<typeof MANIFEST>;

export const OWNER_READ_WRITE = 0o600;
export const PERMISSION_BITS = 0o7777;

export interface Difference {
  readonly path: string;
  readonly reason: string;
}

export interface Report {
  readonly missing: readonly string[];
  readonly doubled: readonly string[];
  readonly unexpected: readonly string[];
  readonly changed: readonly Difference[];
  readonly checked: number;
}

export interface CompareOptions {
  readonly modes: boolean;
}

export function ok(report: Report): boolean {
  return (
    report.missing.length === 0 &&
    report.doubled.length === 0 &&
    report.unexpected.length === 0 &&
    report.changed.length === 0
  );
}

function sameMode(expected: number, actual: number): boolean {
  return (
    ((expected | OWNER_READ_WRITE) & PERMISSION_BITS) ===
    ((actual | OWNER_READ_WRITE) & PERMISSION_BITS)
  );
}

export function sha256File(file: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(file);
    stream.once('error', reject);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.once('end', () => {
      resolve(hash.digest('hex'));
    });
  });
}

export async function walk(root: string, within = ''): Promise<Entry[]> {
  const directory = within === '' ? root : join(root, within);
  const names = (await readdir(directory)).sort();
  const entries: Entry[] = [];
  for (const name of names) {
    const relative = within === '' ? name : posix.join(within, name);
    const absolute = join(root, relative);
    const stat = await lstat(absolute);
    if (stat.isDirectory()) {
      entries.push({
        path: relative,
        type: 'dir',
        size: 0,
        sha256: null,
        mode: stat.mode & PERMISSION_BITS,
        linkTarget: null,
      });
      entries.push(...(await walk(root, relative)));
    } else if (stat.isSymbolicLink()) {
      entries.push({
        path: relative,
        type: 'link',
        size: stat.size,
        sha256: null,
        mode: stat.mode & PERMISSION_BITS,
        linkTarget: await readlink(absolute),
      });
    } else if (stat.isFile()) {
      entries.push({
        path: relative,
        type: 'file',
        size: stat.size,
        sha256: await sha256File(absolute),
        mode: stat.mode & PERMISSION_BITS,
        linkTarget: null,
      });
    } else {
      throw new Error(
        `${absolute} is neither a file, a folder nor a link; the manifest cannot hold it.`,
      );
    }
  }
  return entries;
}

function isConflictName(path: string): boolean {
  return /conflict/iu.test(posix.basename(path));
}

function differences(expected: Entry, actual: Entry, options: CompareOptions): readonly string[] {
  const found: string[] = [];
  if (expected.type !== actual.type) {
    found.push(`type ${actual.type}, expected ${expected.type}`);
    return found;
  }
  if (expected.type === 'file') {
    if (expected.size !== actual.size)
      found.push(`size ${String(actual.size)}, expected ${String(expected.size)}`);
    if (expected.sha256 !== actual.sha256)
      found.push(`sha256 ${String(actual.sha256)}, expected ${String(expected.sha256)}`);
  }
  if (expected.type === 'link' && expected.linkTarget !== actual.linkTarget) {
    found.push(`link target ${String(actual.linkTarget)}, expected ${String(expected.linkTarget)}`);
  }
  if (options.modes && expected.type !== 'link' && !sameMode(expected.mode, actual.mode)) {
    found.push(`mode ${actual.mode.toString(8)}, expected ${expected.mode.toString(8)}`);
  }
  return found;
}

export function compare(
  expected: readonly Entry[],
  actual: readonly Entry[],
  options: CompareOptions,
): Report {
  const wanted = new Map(expected.map((entry) => [entry.path, entry]));
  const present = new Map(actual.map((entry) => [entry.path, entry]));
  const expectedHashes = new Set(
    expected.flatMap((entry) => (entry.sha256 === null ? [] : [entry.sha256])),
  );
  const missing: string[] = [];
  const changed: Difference[] = [];
  for (const entry of expected) {
    const found = present.get(entry.path);
    if (found === undefined) {
      missing.push(entry.path);
      continue;
    }
    for (const reason of differences(entry, found, options))
      changed.push({ path: entry.path, reason });
  }
  const doubled: string[] = [];
  const unexpected: string[] = [];
  for (const entry of actual) {
    if (wanted.has(entry.path)) continue;
    const copy =
      isConflictName(entry.path) || (entry.sha256 !== null && expectedHashes.has(entry.sha256));
    (copy ? doubled : unexpected).push(entry.path);
  }
  return { missing, doubled, unexpected, changed, checked: expected.length };
}

export function summary(report: Report): string {
  const lines = [
    `checked ${String(report.checked)} entries: ${String(report.missing.length)} lost, ${String(report.doubled.length)} doubled, ${String(report.unexpected.length)} unexpected, ${String(report.changed.length)} wrong`,
    ...report.missing.map((path) => `lost: ${path}`),
    ...report.doubled.map((path) => `doubled: ${path}`),
    ...report.unexpected.map((path) => `unexpected: ${path}`),
    ...report.changed.map((difference) => `wrong: ${difference.path}: ${difference.reason}`),
  ];
  return lines.join('\n');
}
