import { dirname } from 'node:path';
import { z } from 'zod';

interface FileId {
  readonly dev: string;
  readonly ino: string;
}

interface Stamped {
  readonly dev: bigint;
  readonly ino: bigint;
}

export interface ExchangeFiles {
  readonly stamp: (path: string) => Promise<Stamped | null>;
  readonly read: (path: string) => AsyncIterable<Uint8Array>;
  readonly rename: (from: string, to: string) => Promise<void>;
  readonly remove: (path: string) => Promise<void>;
  readonly syncDirectory: (path: string) => Promise<void>;
}

export interface ExchangePaths {
  readonly a: string;
  readonly b: string;
  readonly temporary: string;
}

const FILE_ID = z.strictObject({ dev: z.string(), ino: z.string() });

const MANIFEST = z.strictObject({ a: FILE_ID, b: FILE_ID });

function idOf(stamp: Stamped): FileId {
  return { dev: stamp.dev.toString(), ino: stamp.ino.toString() };
}

function holds(stamp: Stamped | null, id: FileId): boolean {
  return stamp !== null && stamp.dev.toString() === id.dev && stamp.ino.toString() === id.ino;
}

export function manifestPathOf(temporary: string): string {
  return `${temporary}.json`;
}

export function manifestOf(a: Stamped, b: Stamped): string {
  return JSON.stringify({ a: idOf(a), b: idOf(b) });
}

async function syncBoth(files: ExchangeFiles, first: string, second: string): Promise<void> {
  await files.syncDirectory(dirname(first));
  if (dirname(first) !== dirname(second)) {
    await files.syncDirectory(dirname(second));
  }
}

export async function swapPaths(files: ExchangeFiles, paths: ExchangePaths): Promise<void> {
  await files.rename(paths.a, paths.temporary);
  await files.rename(paths.b, paths.a);
  await files.rename(paths.temporary, paths.b);
  await syncBoth(files, paths.a, paths.b);
}

async function textOf(files: ExchangeFiles, path: string): Promise<string | null> {
  if ((await files.stamp(path)) === null) {
    return null;
  }
  const chunks: Buffer[] = [];
  for await (const chunk of files.read(path)) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf8');
}

export async function rollbackExchangeState(
  files: ExchangeFiles,
  paths: ExchangePaths,
): Promise<void> {
  const text = await textOf(files, manifestPathOf(paths.temporary));
  if (text === null) {
    return;
  }
  const manifest = MANIFEST.parse(JSON.parse(text));
  const [atA, atB, atTemporary] = [
    await files.stamp(paths.a),
    await files.stamp(paths.b),
    await files.stamp(paths.temporary),
  ];
  if (holds(atTemporary, manifest.a)) {
    if (atA !== null) {
      await files.rename(paths.a, paths.b);
    }
    await files.rename(paths.temporary, paths.a);
  } else if (holds(atA, manifest.b) && holds(atB, manifest.a)) {
    await swapPaths(files, paths);
  }
  await syncBoth(files, paths.a, paths.b);
  await files.remove(manifestPathOf(paths.temporary));
}
