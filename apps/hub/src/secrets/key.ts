import { randomBytes } from 'node:crypto';
import { chmod, mkdir, open, readFile, stat } from 'node:fs/promises';
import { platform } from 'node:os';
import { join } from 'node:path';
import type { Logger } from '@smarteverything/logging';
import { isMissing } from '../fs-util';

const KEY_BYTES = 32;
export const KEY_FILE_NAME = 'secret.key';

export class SecretKeyError extends Error {
  override readonly name = 'SecretKeyError';

  constructor(
    readonly path: string,
    reason: string,
  ) {
    super(`The hub secret key at ${path} cannot be used: ${reason}.`);
  }
}

function checkedKey(path: string, key: Buffer): Buffer {
  if (key.length !== KEY_BYTES) {
    throw new SecretKeyError(
      path,
      `expected ${String(KEY_BYTES)} bytes, received ${String(key.length)}`,
    );
  }
  return key;
}

async function createKeyFile(path: string): Promise<Buffer> {
  const key = randomBytes(KEY_BYTES);
  const handle = await open(path, 'wx', 0o600);
  try {
    await handle.writeFile(key);
  } finally {
    await handle.close();
  }
  return key;
}

export async function loadSecretKey(dataDirectory: string, log: Logger): Promise<Buffer> {
  await mkdir(dataDirectory, { recursive: true, mode: 0o700 });
  const path = join(dataDirectory, KEY_FILE_NAME);
  const status = await stat(path).catch((error: unknown) => {
    if (isMissing(error)) {
      return null;
    }
    throw error;
  });
  if (status === null) {
    return createKeyFile(path);
  }
  if (platform() !== 'win32' && (status.mode & 0o077) !== 0) {
    await chmod(path, 0o600);
    log.warn('secret_key.mode_fixed', { was: (status.mode & 0o777).toString(8) });
  }
  return checkedKey(path, await readFile(path));
}
