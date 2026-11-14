import { localHub, type LocalHubLayout } from './local-hub.ts';

const REQUEST_DEADLINE_MS = 5000;

class AndroidUpdateHomeError extends Error {
  override readonly name = 'AndroidUpdateHomeError';
}

export async function readAndroidUpdateHome(
  layout: LocalHubLayout,
  path: string,
): Promise<unknown> {
  const hub = await localHub(layout);
  const url = new URL(path, hub.url);
  if (url.origin !== hub.url.origin)
    throw new AndroidUpdateHomeError(
      'The Android update executor requires the local hub listener.',
    );
  const reply = await fetch(url, {
    headers: { authorization: `Bearer ${hub.token}` },
    redirect: 'error',
    signal: AbortSignal.timeout(REQUEST_DEADLINE_MS),
  });
  if (!reply.ok)
    throw new AndroidUpdateHomeError(
      `The hub could not read Android update information (${String(reply.status)}).`,
    );
  return reply.json();
}
