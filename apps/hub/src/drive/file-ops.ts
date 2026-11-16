import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { copyFile, mkdir, open, rename, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { StagedWrite } from './intents';
import { syncDirectory } from './unsynced';

export async function stageFile(
  path: string,
  source: AsyncIterable<Uint8Array>,
): Promise<StagedWrite> {
  const hash = createHash('sha256');
  const handle = await open(path, 'wx', 0o600);
  let bytes = 0;
  try {
    for await (const chunk of source) {
      await handle.write(chunk);
      hash.update(chunk);
      bytes += chunk.byteLength;
    }
    await handle.sync();
  } finally {
    await handle.close();
  }
  return { bytes, sha256: hash.digest('hex') };
}

export async function* readNoFollow(path: string): AsyncGenerator<Uint8Array> {
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    yield* handle.createReadStream({ autoClose: false });
  } finally {
    await handle.close();
  }
}

export async function chmodNoFollow(path: string, mode: number): Promise<void> {
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    await handle.chmod(mode);
  } finally {
    await handle.close();
  }
}

export async function cloneFile(from: string, to: string, temporary: string): Promise<void> {
  await mkdir(dirname(temporary), { recursive: true, mode: 0o700 });
  await mkdir(dirname(to), { recursive: true, mode: 0o700 });
  const source = await open(from, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    await copyFile(
      `/proc/self/fd/${String(source.fd)}`,
      temporary,
      constants.COPYFILE_FICLONE | constants.COPYFILE_EXCL,
    );
    const copied = await open(temporary, 'r');
    try {
      await copied.sync();
    } finally {
      await copied.close();
    }
    await rename(temporary, to);
    await syncDirectory(dirname(to));
  } catch (cause) {
    await rm(temporary, { force: true });
    throw cause;
  } finally {
    await source.close();
  }
}

export async function writeDurable(path: string, temporary: string, text: string): Promise<void> {
  await mkdir(dirname(temporary), { recursive: true, mode: 0o700 });
  await writeFile(temporary, text, { mode: 0o600, flag: 'wx' });
  const handle = await open(temporary, 'r');
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(temporary, path);
  await syncDirectory(dirname(path));
}
