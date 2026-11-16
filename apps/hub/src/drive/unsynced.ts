import { mkdir, open, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export async function writeUnsynced(path: string, temporary: string, text: string): Promise<void> {
  await mkdir(dirname(temporary), { recursive: true, mode: 0o700 });
  await writeFile(temporary, text, { mode: 0o600, flag: 'wx' });
  await rename(temporary, path);
}

export async function syncDirectory(path: string): Promise<void> {
  const handle = await open(path, 'r');
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

export async function stageEmptyFile(path: string): Promise<void> {
  const handle = await open(path, 'wx', 0o600);
  await handle.close();
}
