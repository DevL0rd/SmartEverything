import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { OWNER_TOKEN_FILE } from '../apps/hub/src/server/access.ts';
import { SERVICE_READY, SERVICE_READY_FILE } from '../apps/hub/src/service/configuration.ts';

const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]']);
const REQUEST_DEADLINE_MS = 5000;

class AndroidUpdateHomeError extends Error {
  override readonly name = 'AndroidUpdateHomeError';
}

export async function readAndroidUpdateHome(data: string, path: string): Promise<unknown> {
  const ready = SERVICE_READY.parse(
    JSON.parse(await readFile(join(data, SERVICE_READY_FILE), 'utf8')),
  );
  const hub = new URL(ready.url);
  const url = new URL(path, hub);
  if (!LOOPBACK.has(hub.hostname) || url.origin !== hub.origin)
    throw new AndroidUpdateHomeError(
      'The Android update executor requires the local hub listener.',
    );
  const token = (await readFile(join(data, OWNER_TOKEN_FILE), 'utf8')).trim();
  const reply = await fetch(url, {
    headers: { authorization: `Bearer ${token}` },
    redirect: 'error',
    signal: AbortSignal.timeout(REQUEST_DEADLINE_MS),
  });
  if (!reply.ok)
    throw new AndroidUpdateHomeError(
      `The hub could not read Android update information (${String(reply.status)}).`,
    );
  return reply.json();
}
