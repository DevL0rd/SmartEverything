import { z } from 'zod';
import type { NativeHubNetwork, NativeHubResponse } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { assertHubLease, type HubRouteLease } from './active-route';
import { hubNetwork } from './route-platform';

const UPLOAD_METHOD = z.enum(['POST', 'PUT', 'PATCH']);

export interface UploadOptions {
  readonly signal?: AbortSignal;
  readonly onProgress: (sentBytes: number, totalBytes: number) => void;
}

export interface UploadBody {
  readonly kind: 'bytes';
  readonly method: z.output<typeof UPLOAD_METHOD>;
  readonly body: Blob;
  readonly onProgress: UploadOptions['onProgress'];
}

export interface BinaryUpload extends Omit<UploadBody, 'kind'> {
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly signal: AbortSignal | undefined;
}

export function uploadBodyOf(method: string, body: Blob, options: UploadOptions): UploadBody {
  return {
    kind: 'bytes',
    method: UPLOAD_METHOD.parse(method),
    body,
    onProgress: options.onProgress,
  };
}

type UploadBridge = NativeHubNetwork &
  Required<Pick<NativeHubNetwork, 'openUpload' | 'sendUpload' | 'finishUpload' | 'abortUpload'>>;

const BRIDGE_CHUNK_BYTES = 1024 * 1024;

let uploadSequence = 0;

export class UploadUnsupportedError extends Error {
  override readonly name = 'UploadUnsupportedError';

  constructor() {
    super('Update the desktop app to upload files to your hub.');
  }
}

function cancelled(signal: AbortSignal): Error {
  if (signal.reason instanceof Error) return signal.reason;
  const error = new Error('The upload was cancelled.');
  error.name = 'AbortError';
  return error;
}

function assertActive(signal: AbortSignal | undefined): void {
  if (signal?.aborted === true) throw cancelled(signal);
}

function uploads(network: NativeHubNetwork): network is UploadBridge {
  return (
    network.openUpload !== undefined &&
    network.sendUpload !== undefined &&
    network.finishUpload !== undefined &&
    network.abortUpload !== undefined
  );
}

function bridged(lease: HubRouteLease | undefined, network: NativeHubNetwork): boolean {
  if (lease === undefined || network.request === undefined) return false;
  return lease.nativeAuthority === true || lease.endpoint.kind === 'lan';
}

export async function sendUpload(
  lease: HubRouteLease | undefined,
  upload: BinaryUpload,
): Promise<Response> {
  const network = hubNetwork();
  if (lease === undefined || !bridged(lease, network)) return xhrUpload(upload);
  assertHubLease(lease, upload.method);
  if (!uploads(network)) throw new UploadUnsupportedError();
  return bridgedUpload(network, lease, upload);
}

function responseOf(answer: NativeHubResponse): Response {
  return new Response(answer.body === '' ? null : answer.body, {
    status: answer.status,
    headers: answer.headers,
  });
}

async function bridgedUpload(
  bridge: UploadBridge,
  lease: HubRouteLease,
  upload: BinaryUpload,
): Promise<Response> {
  const { signal, body } = upload;
  assertActive(signal);
  uploadSequence += 1;
  const id = `upload-${String(uploadSequence)}`;
  const total = body.size;
  await bridge.openUpload({
    scopeId: lease.scopeId,
    ...(lease.binding === undefined ? {} : { binding: lease.binding }),
    ...(lease.nativeRouteGeneration === undefined
      ? {}
      : { routeGeneration: lease.nativeRouteGeneration }),
    id,
    url: upload.url,
    method: upload.method,
    headers: upload.headers,
    length: total,
  });
  const abort = (): void => {
    background(bridge.abortUpload(id), 'route.upload_abort_failed');
  };
  signal?.addEventListener('abort', abort, { once: true });
  try {
    await sendChunks(bridge, id, upload);
    assertActive(signal);
    return responseOf(await bridge.finishUpload(id));
  } catch (error) {
    if (signal?.aborted !== true) abort();
    throw error;
  } finally {
    signal?.removeEventListener('abort', abort);
  }
}

async function sendChunks(bridge: UploadBridge, id: string, upload: BinaryUpload): Promise<void> {
  const { signal, body } = upload;
  const total = body.size;
  let sent = 0;
  while (sent < total) {
    const end = Math.min(total, sent + BRIDGE_CHUNK_BYTES);
    const data = new Uint8Array(await body.slice(sent, end).arrayBuffer());
    assertActive(signal);
    if (!(await bridge.sendUpload({ id, data }))) return;
    sent = end;
    upload.onProgress(sent, total);
  }
}

function headersOf(raw: string): Headers {
  const headers = new Headers();
  for (const line of raw.split(/\r?\n/)) {
    const colon = line.indexOf(':');
    if (colon > 0) headers.append(line.slice(0, colon).trim(), line.slice(colon + 1).trim());
  }
  return headers;
}

function xhrUpload(upload: BinaryUpload): Promise<Response> {
  return new Promise<Response>((resolve, reject) => {
    const { signal, body } = upload;
    if (signal?.aborted === true) {
      reject(cancelled(signal));
      return;
    }
    const xhr = new XMLHttpRequest();
    const abort = (): void => {
      xhr.abort();
    };
    const fail = (error: Error): void => {
      signal?.removeEventListener('abort', abort);
      reject(error);
    };
    xhr.open(upload.method, upload.url);
    for (const [name, value] of Object.entries(upload.headers)) xhr.setRequestHeader(name, value);
    xhr.upload.onprogress = (event): void => {
      upload.onProgress(event.loaded, body.size);
    };
    xhr.onload = (): void => {
      signal?.removeEventListener('abort', abort);
      if (xhr.responseURL !== '' && xhr.responseURL !== upload.url) {
        reject(new TypeError('Hub redirects are forbidden'));
        return;
      }
      resolve(
        new Response(xhr.responseText === '' ? null : xhr.responseText, {
          status: xhr.status,
          headers: headersOf(xhr.getAllResponseHeaders()),
        }),
      );
    };
    xhr.onerror = (): void => {
      fail(new TypeError('Network request failed'));
    };
    xhr.ontimeout = (): void => {
      fail(new TypeError('Network request timed out'));
    };
    xhr.onabort = (): void => {
      fail(signal === undefined ? new Error('The upload was cancelled.') : cancelled(signal));
    };
    signal?.addEventListener('abort', abort, { once: true });
    xhr.send(body);
  });
}
