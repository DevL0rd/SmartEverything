import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import type { IncomingMessage } from 'node:http';
import { Agent, request } from 'node:https';
import { isIP } from 'node:net';
import { connect } from 'node:tls';
import type { Duplex } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import {
  API_ENDPOINTS as E,
  CLIENT_TOKEN,
  MACHINE_UPDATE_MANIFEST,
  MACHINE_UPDATE_STAGED,
  apiErrorOf,
  type MachineUpdateArtifact,
  type MachineUpdateManifest,
} from '@smarteverything/domain';
import { z } from 'zod';

export interface PublisherTarget {
  readonly url: URL;
  readonly pin: string | undefined;
  readonly token: string;
}

const PIN = z.string().regex(/^[0-9a-f]{64}$/u);

export class PublisherAddressError extends Error {
  override readonly name = 'PublisherAddressError';

  constructor() {
    super('--hub must be the https address of the hub, such as https://nas.local:7880.');
  }
}

export class PublisherTokenError extends Error {
  override readonly name = 'PublisherTokenError';

  constructor(file: string) {
    super(`${file} must hold one publisher client token and nothing else.`);
  }
}

export class PublisherPinError extends Error {
  override readonly name = 'PublisherPinError';

  constructor() {
    super('The hub certificate does not match --pin.');
  }
}

export class PublisherReplyError extends Error {
  override readonly name = 'PublisherReplyError';

  constructor(what: string, expected: string) {
    super(`The hub replied ${what}; expected ${expected}.`);
  }
}

export async function publisherTarget(options: {
  readonly hub: string;
  readonly pin: string | undefined;
  readonly tokenFile: string;
}): Promise<PublisherTarget> {
  const url = new URL(options.hub);
  if (url.protocol !== 'https:') throw new PublisherAddressError();
  const token = (await readFile(options.tokenFile, 'utf8')).trim();
  if (!CLIENT_TOKEN.safeParse(token).success) throw new PublisherTokenError(options.tokenFile);
  return {
    url,
    pin: options.pin === undefined ? undefined : PIN.parse(options.pin),
    token,
  };
}

class PinnedAgent extends Agent {
  constructor(
    private readonly host: string,
    private readonly port: number,
    private readonly pin: string,
  ) {
    super();
  }

  override createConnection(
    _options: unknown,
    callback?: (cause: Error | null, stream: Duplex) => void,
  ): undefined {
    const socket = connect({
      host: this.host,
      port: this.port,
      ...(isIP(this.host) === 0 ? { servername: this.host } : {}),
      rejectUnauthorized: false,
    });
    socket.once('error', (cause) => {
      callback?.(cause, socket);
    });
    socket.once('secureConnect', () => {
      const key = socket
        .getPeerX509Certificate()
        ?.publicKey.export({ type: 'spki', format: 'der' });
      if (key !== undefined && createHash('sha256').update(key).digest('hex') === this.pin) {
        callback?.(null, socket);
      } else {
        callback?.(new PublisherPinError(), socket);
        socket.destroy();
      }
    });
    return undefined;
  }
}

function agentOf(target: PublisherTarget): Agent {
  const { url, pin } = target;
  if (pin === undefined) return new Agent();
  return new PinnedAgent(url.hostname, Number(url.port === '' ? 443 : url.port), pin);
}

export interface Call {
  readonly method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  readonly path: string;
  readonly json?: unknown;
  readonly file?: { readonly path: string; readonly size: number };
}

function replyOf(message: IncomingMessage): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    message.on('data', (chunk: Buffer) => chunks.push(chunk));
    message.once('error', reject);
    message.once('end', () => {
      const text = Buffer.concat(chunks).toString('utf8');
      resolve({
        status: message.statusCode ?? 0,
        body: text === '' ? undefined : JSON.parse(text),
      });
    });
  });
}

function headersOf(
  target: PublisherTarget,
  call: Call,
  body: string | undefined,
): Record<string, string | number> {
  const length = call.file?.size ?? (body === undefined ? undefined : Buffer.byteLength(body));
  return {
    authorization: `Bearer ${target.token}`,
    ...(call.file === undefined ? {} : { 'content-type': 'application/octet-stream' }),
    ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    ...(length === undefined ? {} : { 'content-length': length }),
  };
}

export async function send(target: PublisherTarget, call: Call): Promise<unknown> {
  const body = call.json === undefined ? undefined : JSON.stringify(call.json);
  const outgoing = request(new URL(call.path, target.url), {
    method: call.method,
    agent: agentOf(target),
    headers: headersOf(target, call, body),
  });
  const answered = new Promise<IncomingMessage>((resolve, reject) => {
    outgoing.once('response', resolve);
    outgoing.once('error', reject);
  });
  if (call.file !== undefined) await pipeline(createReadStream(call.file.path), outgoing);
  else outgoing.end(body);
  const { status, body: reply } = await replyOf(await answered);
  if (status >= 200 && status < 300) return reply;
  throw apiErrorOf(status, reply);
}

export async function uploadArtifact(
  target: PublisherTarget,
  artifact: MachineUpdateArtifact,
  path: string,
): Promise<void> {
  const reply = MACHINE_UPDATE_STAGED.parse(
    await send(target, {
      method: 'PUT',
      path: `/api/machine-update/files/${encodeURIComponent(artifact.file)}`,
      file: { path, size: (await stat(path)).size },
    }),
  );
  if (reply.sha256 !== artifact.sha256 || reply.size !== artifact.size) {
    throw new PublisherReplyError(`${artifact.file} as ${reply.sha256}`, artifact.sha256);
  }
}

export async function publishUploaded(
  target: PublisherTarget,
  manifest: MachineUpdateManifest,
  runtimeVersion: string | undefined,
): Promise<MachineUpdateManifest> {
  const reply = await send(target, {
    method: E.publishMachineUpdate.method,
    path: E.publishMachineUpdate.path,
    json: { manifest, ...(runtimeVersion === undefined ? {} : { runtimeVersion }) },
  });
  return MACHINE_UPDATE_MANIFEST.parse(reply);
}

export async function rollbackRelease(target: PublisherTarget): Promise<MachineUpdateManifest> {
  return MACHINE_UPDATE_MANIFEST.parse(
    await send(target, {
      method: E.rollbackMachineUpdate.method,
      path: E.rollbackMachineUpdate.path,
    }),
  );
}

export async function withdrawRelease(target: PublisherTarget): Promise<void> {
  await send(target, {
    method: E.withdrawMachineUpdate.method,
    path: E.withdrawMachineUpdate.path,
  });
}
