import { createHash, randomBytes } from 'node:crypto';
import { ApiError } from '@smarteverything/domain';
import { shellyPasswordHash, ShellyAuthenticationError } from '@smarteverything/shelly/rpc';
import type { ShellyTransportTls } from '@smarteverything/shelly';
import { Agent, fetch, type Response } from 'undici';
import { z } from 'zod';

const REQUEST_MS = 10000;
const CHALLENGE = z.object({
  realm: z.string().min(1),
  nonce: z.string().min(1),
  qop: z.literal('auth'),
  algorithm: z.literal('SHA-256'),
});
const BYTES = z.instanceof(Uint8Array);
const agents = new WeakMap<ShellyTransportTls, Agent>();

export interface ShellyHttpOptions {
  readonly address: string;
  readonly id: string;
  readonly password: string | null;
  readonly signal: AbortSignal;
  readonly tls: ShellyTransportTls | null;
}

function agentOf(tls: ShellyTransportTls): Agent {
  const known = agents.get(tls);
  if (known !== undefined) return known;
  const agent = new Agent({
    connect: {
      rejectUnauthorized: true,
      ...(tls.caPem === null ? {} : { ca: tls.caPem }),
      ...(tls.clientCertificate === null ? {} : { cert: tls.clientCertificate }),
      ...(tls.clientKey === null ? {} : { key: tls.clientKey }),
    },
  });
  agents.set(tls, agent);
  return agent;
}

export function shellyHttp(
  url: URL,
  options: Pick<ShellyHttpOptions, 'signal' | 'tls'> & {
    readonly headers?: Record<string, string>;
  },
): Promise<Response> {
  return fetch(url, {
    signal: AbortSignal.any([options.signal, AbortSignal.timeout(REQUEST_MS)]),
    redirect: 'error',
    ...(options.headers === undefined ? {} : { headers: options.headers }),
    ...(options.tls === null ? {} : { dispatcher: agentOf(options.tls) }),
  });
}

export async function readBounded(response: Response, limit: number): Promise<string> {
  const reader = response.body?.getReader();
  if (reader === undefined) return '';
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      const chunk = BYTES.parse(next.value);
      size += chunk.byteLength;
      if (size > limit)
        throw new ApiError('upstream_failed', `The answer is larger than ${String(limit)} bytes.`);
      chunks.push(chunk);
    }
  } finally {
    await reader.cancel();
  }
  return Buffer.concat(chunks).toString('utf8');
}

export async function authenticatedShellyGet(
  options: ShellyHttpOptions,
  url: URL,
): Promise<Response> {
  let response = await shellyHttp(url, options);
  for (let attempt = 0; response.status === 401 && attempt < 2; attempt += 1) {
    const challenge = response.headers.get('www-authenticate');
    await response.body?.cancel();
    response = await shellyHttp(url, {
      ...options,
      headers: { Authorization: digestHeader(options, url, challenge) },
    });
  }
  if (response.status === 401)
    throw new ShellyAuthenticationError('the device rejected the password');
  if (!response.ok)
    throw new ApiError('upstream_failed', `The device answered HTTP ${String(response.status)}.`);
  return response;
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function digestHeader(options: ShellyHttpOptions, url: URL, header: string | null): string {
  if (options.password === null)
    throw new ShellyAuthenticationError('a local access password is required');
  const text = header?.startsWith('Digest ') === true ? header.slice(7) : null;
  if (text === null) throw new ShellyAuthenticationError('the HTTP challenge is not supported');
  const values: unknown = Object.fromEntries(
    [...text.matchAll(/([a-z]+)=(?:"([^"\\]*)"|([^,\s]+))/gi)].map((match) => [
      match[1],
      match[2] ?? match[3],
    ]),
  );
  const challenge = CHALLENGE.parse(values);
  if (challenge.realm !== options.id)
    throw new ShellyAuthenticationError('the HTTP realm differs from the enrolled device');
  const cnonce = randomBytes(12).toString('hex');
  const nc = '00000001';
  const uri = url.pathname + url.search;
  const response = sha256(
    `${shellyPasswordHash(options.id, options.password)}:${challenge.nonce}:${nc}:${cnonce}:auth:${sha256(`GET:${uri}`)}`,
  );
  return `Digest username="admin", realm=${JSON.stringify(challenge.realm)}, nonce=${JSON.stringify(challenge.nonce)}, uri=${JSON.stringify(uri)}, algorithm=SHA-256, response="${response}", qop=auth, nc=${nc}, cnonce="${cnonce}"`;
}
