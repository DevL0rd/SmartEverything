import { lstat, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { isMissing } from '../errors.ts';

const BLOCK_BYTES = 512;

async function visit(directory: string, onFile: (blocks: number) => void): Promise<void> {
  let names: string[];
  try {
    names = await readdir(directory);
  } catch (cause) {
    if (isMissing(cause)) return;
    throw cause;
  }
  for (const name of names) {
    try {
      const stat = await lstat(join(directory, name));
      if (stat.isDirectory()) await visit(join(directory, name), onFile);
      else if (stat.isFile()) onFile(stat.blocks);
    } catch (cause) {
      if (!isMissing(cause)) throw cause;
    }
  }
}

export async function allocatedBytes(directory: string): Promise<number> {
  let blocks = 0;
  await visit(directory, (count) => {
    blocks += count;
  });
  return blocks * BLOCK_BYTES;
}

export async function countFiles(directory: string): Promise<number> {
  let count = 0;
  await visit(directory, () => {
    count += 1;
  });
  return count;
}
