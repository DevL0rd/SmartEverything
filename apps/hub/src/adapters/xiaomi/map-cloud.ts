import type { JsonValue } from '@smarteverything/domain';
import type { XiaomiCloud } from './cloud-api';
import type { XiaomiDependencies } from './dependencies';

const DOWNLOAD_TIMEOUT_MS = 15_000;
const HTTP_OK = 200;
export const MAP_DOWNLOAD_MAX_BYTES = 32 * 1024 * 1024;

export type MapDownloadReason = 'protocol' | 'network' | 'status' | 'size';

export class MapDownloadError extends Error {
  override readonly name = 'MapDownloadError';

  constructor(
    readonly reason: MapDownloadReason,
    readonly status: number | null,
  ) {
    super(
      status === null
        ? `The vacuum map download failed: ${reason}.`
        : `The vacuum map download failed: ${reason} ${String(status)}.`,
    );
  }
}

export interface MapCloud {
  readonly call: (path: string, data: JsonValue) => Promise<JsonValue>;
  readonly download: (url: string) => Promise<Uint8Array>;
}

async function downloadSigned(
  fetch: XiaomiDependencies['fetch'],
  url: string,
): Promise<Uint8Array> {
  if (!URL.canParse(url) || new URL(url).protocol !== 'https:') {
    throw new MapDownloadError('protocol', null);
  }
  const response = await fetch(url, {
    method: 'GET',
    redirect: 'manual',
    signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
  }).catch(() => {
    throw new MapDownloadError('network', null);
  });
  if (response.status !== HTTP_OK) {
    throw new MapDownloadError('status', response.status);
  }
  return readCapped(response);
}

async function readCapped(response: Response): Promise<Uint8Array> {
  const declared = Number(response.headers.get('content-length'));
  if (declared > MAP_DOWNLOAD_MAX_BYTES) {
    await response.body?.cancel();
    throw new MapDownloadError('size', null);
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  if (response.body === null) return new Uint8Array();
  const reader: ReadableStreamDefaultReader<Uint8Array> = response.body.getReader();
  for (let part = await reader.read(); !part.done; part = await reader.read()) {
    total += part.value.length;
    if (total > MAP_DOWNLOAD_MAX_BYTES) {
      await reader.cancel();
      throw new MapDownloadError('size', null);
    }
    chunks.push(part.value);
  }
  return new Uint8Array(Buffer.concat(chunks));
}

export function createMapCloud(
  cloud: Pick<XiaomiCloud, 'call'>,
  dependencies: Pick<XiaomiDependencies, 'fetch'>,
): MapCloud {
  return {
    call: (path, data) => cloud.call(path, data),
    download: (url) => downloadSigned(dependencies.fetch, url),
  };
}
