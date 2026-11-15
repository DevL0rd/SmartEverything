import { createCipheriv, createHash } from 'node:crypto';
import { mkdir, open, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { isMissing } from '../errors.ts';
import { MANIFEST, walk, type Entry } from '../manifest.ts';

export const BIG_BYTES = 1 << 30;
export const BATCH_FILES = 5000;
export const BATCH_FOLDER_FILES = 100;
const CHUNK_BYTES = 1 << 20;
const SMALL_FILE_SPAN = 8192;
const SIZE_MIXER = 2654435761;

export interface Fixture {
  readonly name: string;
  readonly directory: string;
  readonly entries: readonly Entry[];
  readonly files: number;
  readonly bytes: number;
}

async function writeDeterministic(file: string, seed: string, length: number): Promise<void> {
  const key = createHash('sha256').update(`${seed}:key`).digest().subarray(0, 16);
  const iv = createHash('sha256').update(`${seed}:iv`).digest().subarray(0, 16);
  const cipher = createCipheriv('aes-128-ctr', key, iv);
  const zeros = Buffer.alloc(Math.min(CHUNK_BYTES, Math.max(length, 1)));
  const handle = await open(file, 'w');
  try {
    for (let offset = 0; offset < length; offset += CHUNK_BYTES) {
      const size = Math.min(CHUNK_BYTES, length - offset);
      await handle.write(cipher.update(zeros.subarray(0, size)));
    }
  } finally {
    await handle.close();
  }
}

async function cached(root: string, name: string, size: string): Promise<Fixture | null> {
  try {
    const text = await readFile(join(root, `${name}.manifest.json`), 'utf8');
    const parsed = MANIFEST.parse(JSON.parse(text));
    if (parsed.name !== `${name}:${size}`) return null;
    return summarize(name, join(root, name), parsed.entries);
  } catch (cause) {
    if (isMissing(cause)) return null;
    throw cause;
  }
}

function summarize(name: string, directory: string, entries: readonly Entry[]): Fixture {
  const files = entries.filter((entry) => entry.type === 'file');
  return {
    name,
    directory,
    entries,
    files: files.length,
    bytes: files.reduce((total, entry) => total + entry.size, 0),
  };
}

async function recorded(
  root: string,
  name: string,
  size: string,
  build: (directory: string) => Promise<void>,
): Promise<Fixture> {
  const known = await cached(root, name, size);
  if (known !== null) return known;
  const directory = join(root, name);
  await rm(directory, { recursive: true, force: true });
  await mkdir(directory, { recursive: true, mode: 0o755 });
  await build(directory);
  const entries = await walk(directory);
  await writeFile(
    join(root, `${name}.manifest.json`),
    `${JSON.stringify({ name: `${name}:${size}`, createdAt: new Date().toISOString(), entries })}\n`,
  );
  return summarize(name, directory, entries);
}

export function buildBig(root: string, bytes = BIG_BYTES): Promise<Fixture> {
  return recorded(root, 'big', String(bytes), (directory) =>
    writeDeterministic(join(directory, 'big.bin'), 'big', bytes),
  );
}

export function smallFileSize(index: number): number {
  return 1 + ((index * SIZE_MIXER) % SMALL_FILE_SPAN);
}

export function buildBatch(root: string, files = BATCH_FILES): Promise<Fixture> {
  return recorded(root, 'batch', String(files), async (directory) => {
    for (let index = 0; index < files; index += 1) {
      const folder = join(directory, `d${String(Math.floor(index / BATCH_FOLDER_FILES))}`);
      if (index % BATCH_FOLDER_FILES === 0) await mkdir(folder, { recursive: true });
      await writeDeterministic(
        join(folder, `f${String(index)}.bin`),
        `batch:${String(index)}`,
        smallFileSize(index),
      );
    }
  });
}
