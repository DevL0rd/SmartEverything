import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { open, readFile, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { env } from 'node:process';
import { pipeline } from 'node:stream/promises';
import {
  API_ENDPOINTS,
  COMPUTER_FILES,
  COMPUTER_WINDOW_CONNECTION,
  RELEASE_UPLOAD_CHUNK_PATH,
  RELEASE_UPLOAD,
  apiErrorOf,
  type ReleaseArtifact,
  type ReleaseUpload,
  type ReleaseUploadRange,
} from '@smarteverything/domain';
import { messageOf } from '@smarteverything/logging';
import { hubFetch } from '../apps/hub/src/node/pinned-fetch.ts';

export const UPLOAD_CHUNK_BYTES = 8 * 1024 * 1024;

const ATTEMPTS = 3;

export class ReleaseUploadError extends Error {
  override readonly name = 'ReleaseUploadError';
}

export interface HubConnection {
  readonly url: URL;
  readonly token: string;
  readonly pin: string | undefined;
}

export function windowConnectionFile(): string {
  const base = env['XDG_CONFIG_HOME'];
  return join(
    base !== undefined && base !== '' ? base : join(homedir(), '.config'),
    'SmartEverything-node',
    COMPUTER_FILES.nodeWindow,
  );
}

export async function readHubConnection(
  file: string = windowConnectionFile(),
  override?: string,
): Promise<HubConnection> {
  let text: string;
  try {
    text = await readFile(file, 'utf8');
  } catch (cause) {
    throw new ReleaseUploadError(
      `${file} cannot be read (${messageOf(cause)}); open the SmartEverything Desktop app on this machine once so it pairs with your Hub`,
    );
  }
  const parsed = COMPUTER_WINDOW_CONNECTION.safeParse(JSON.parse(text));
  if (!parsed.success)
    throw new ReleaseUploadError(`${file} does not hold a Desktop window connection`);
  return {
    url: new URL(override ?? parsed.data.hub_url),
    token: parsed.data.token,
    pin: parsed.data.connection?.identity.tls.publicKeySha256,
  };
}

export type Transport = ReturnType<typeof hubFetch>;

function tlsRefusal(cause: unknown): boolean {
  const code =
    cause instanceof Error && cause.cause instanceof Error && 'code' in cause.cause
      ? String(cause.cause.code)
      : '';
  return /CERT|SELF_SIGNED|UNABLE_TO_VERIFY/u.test(code);
}

export function hubTransport(connection: HubConnection): Transport {
  const plain = hubFetch(undefined);
  const pinned = hubFetch(connection.pin);
  let useBoth = connection.pin !== undefined;
  const transport: Transport = async (input, init) => {
    if (!useBoth) return plain(input, init);
    try {
      return await plain(input, init);
    } catch (cause) {
      if (!tlsRefusal(cause)) throw cause;
      useBoth = false;
      return pinned(input, init);
    }
  };
  return transport;
}

interface Call {
  readonly method: 'GET' | 'POST' | 'PUT';
  readonly path: string;
  readonly json?: unknown;
  readonly bytes?: Buffer;
}

function requestOf(connection: HubConnection, call: Call): NonNullable<Parameters<Transport>[1]> {
  const headers: Record<string, string> = { authorization: `Bearer ${connection.token}` };
  if (call.json !== undefined) headers['content-type'] = 'application/json';
  if (call.bytes !== undefined) headers['content-type'] = 'application/octet-stream';
  return {
    method: call.method,
    headers,
    body: call.json === undefined ? (call.bytes ?? null) : JSON.stringify(call.json),
  };
}

async function callHub(
  connection: HubConnection,
  transport: Transport,
  call: Call,
): Promise<unknown> {
  const response = await transport(new URL(call.path, connection.url), requestOf(connection, call));
  const text = await response.text();
  const reply: unknown = text === '' ? undefined : JSON.parse(text);
  if (response.ok) return reply;
  throw apiErrorOf(response.status, reply);
}

export async function hashOfFile(file: string): Promise<string> {
  const hash = createHash('sha256');
  await pipeline(createReadStream(file), hash);
  return hash.digest('hex');
}

export function missingRanges(
  size: number,
  received: readonly ReleaseUploadRange[],
): readonly ReleaseUploadRange[] {
  const gaps: ReleaseUploadRange[] = [];
  let cursor = 0;
  for (const range of [...received].sort((left, right) => left.start - right.start)) {
    if (range.start > cursor) gaps.push({ start: cursor, end: range.start });
    cursor = Math.max(cursor, range.end);
  }
  if (cursor < size) gaps.push({ start: cursor, end: size });
  return gaps;
}

interface Chunk {
  readonly uploadId: string;
  readonly tar: string;
  readonly start: number;
  readonly end: number;
}

async function sendChunk(
  connection: HubConnection,
  transport: Transport,
  chunk: Chunk,
): Promise<void> {
  const handle = await open(chunk.tar, 'r');
  try {
    const bytes = Buffer.allocUnsafe(chunk.end - chunk.start);
    const { bytesRead } = await handle.read(bytes, 0, bytes.length, chunk.start);
    if (bytesRead !== bytes.length)
      throw new ReleaseUploadError(`${chunk.tar} changed while uploading`);
    const path = RELEASE_UPLOAD_CHUNK_PATH.replace(':uploadId', chunk.uploadId).replace(
      ':offset',
      String(chunk.start),
    );
    for (let attempt = 1; ; attempt += 1) {
      try {
        await callHub(connection, transport, { method: 'PUT', path, bytes });
        return;
      } catch (cause) {
        if (attempt >= ATTEMPTS) throw cause;
      }
    }
  } finally {
    await handle.close();
  }
}

export interface UploadRequest {
  readonly connection: HubConnection;
  readonly transport: Transport;
  readonly artifact: ReleaseArtifact;
  readonly tar: string;
  readonly progress?: (sent: number, total: number) => void;
}

export async function uploadRelease(request: UploadRequest): Promise<ReleaseUpload> {
  const { connection, transport, tar } = request;
  const size = (await stat(tar)).size;
  const sha256 = await hashOfFile(tar);
  let upload = RELEASE_UPLOAD.parse(
    await callHub(connection, transport, {
      method: 'POST',
      path: API_ENDPOINTS.beginReleaseUpload.path,
      json: { artifact: request.artifact, size, sha256 },
    }),
  );
  for (const gap of missingRanges(size, upload.received))
    for (let start = gap.start; start < gap.end; start += UPLOAD_CHUNK_BYTES) {
      const end = Math.min(start + UPLOAD_CHUNK_BYTES, gap.end);
      await sendChunk(connection, transport, { uploadId: upload.uploadId, tar, start, end });
      request.progress?.(end, size);
    }
  upload = RELEASE_UPLOAD.parse(
    await callHub(connection, transport, {
      method: 'POST',
      path: API_ENDPOINTS.finishReleaseUpload.path.replace(':uploadId', upload.uploadId),
    }),
  );
  return upload;
}
