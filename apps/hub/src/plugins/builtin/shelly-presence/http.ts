import { shellyHttp } from './http-transport';
import type { ShellyTransportTls } from '@smarteverything/domain';
import { redactText } from '@smarteverything/logging';
import { createHash, randomBytes } from 'node:crypto';
import { ApiError } from '@smarteverything/domain';
import { z } from 'zod';
import { ShellyAuthenticationError, shellyPasswordHash } from './rpc-auth';
const CHALLENGE = z.object({
  realm: z.string().min(1).max(100),
  nonce: z.string().min(1).max(300),
  qop: z.literal('auth'),
  algorithm: z.literal('SHA-256'),
});
export interface ShellyHttpOptions {
  readonly address: string;
  readonly id: string;
  readonly password: string | null;
  readonly signal: AbortSignal;
  readonly tls: ShellyTransportTls | null;
}
export async function shellyLogs(
  options: ShellyHttpOptions,
  lines: number,
): Promise<{ text: string }> {
  const url = new URL(`/debug/log?n=${String(lines)}&f=0`, options.address);
  const response = await authenticatedShellyFile(options, url);
  return { text: redactText(await boundedText(response), 262144) };
}
export async function authenticatedShellyFile(
  options: ShellyHttpOptions,
  url: URL,
): Promise<Response> {
  const signal = AbortSignal.any([options.signal, AbortSignal.timeout(10000)]);
  let response = await shellyHttp(url, { signal, tls: options.tls });
  for (let attempt = 0; response.status === 401 && attempt < 2; attempt += 1) {
    const challenge = response.headers.get('www-authenticate');
    await response.body?.cancel();
    response = await shellyHttp(url, {
      signal,
      tls: options.tls,
      headers: { Authorization: httpAuthorization(options, url, challenge) },
    });
  }
  if (response.status === 401)
    throw new ShellyAuthenticationError('the device rejected the log reader password');
  if (!response.ok)
    throw new ApiError('upstream_failed', `Shelly logs returned HTTP ${String(response.status)}.`);
  return response;
}
function httpAuthorization(options: ShellyHttpOptions, url: URL, header: string | null): string {
  if (options.password === null)
    throw new ShellyAuthenticationError('a local access password is required');
  if (header === null || !header.startsWith('Digest ') || header.length > 4096)
    throw new ShellyAuthenticationError('the HTTP challenge is not supported');
  const values: unknown = Object.fromEntries(
    [...header.slice(7).matchAll(/([a-z]+)=(?:"([^"\\]*)"|([^,\s]+))/gi)].map((match) => [
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
  const hash = (value: string): string => createHash('sha256').update(value).digest('hex');
  const response = hash(
    `${shellyPasswordHash(options.id, options.password)}:${challenge.nonce}:${nc}:${cnonce}:auth:${hash(`GET:${uri}`)}`,
  );
  return `Digest username="admin", realm=${JSON.stringify(challenge.realm)}, nonce=${JSON.stringify(challenge.nonce)}, uri=${JSON.stringify(uri)}, algorithm=SHA-256, response="${response}", qop=auth, nc=${nc}, cnonce="${cnonce}"`;
}
export async function boundedText(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (reader === undefined) return '';
  let bytes = 0;
  const chunks: Uint8Array[] = [];
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      const raw: unknown = chunk.value;
      const value = z.instanceof(Uint8Array).parse(raw);
      bytes += value.byteLength;
      if (bytes > 262144)
        throw new ApiError('upstream_failed', 'Shelly logs exceed the bounded download limit.');
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
  return Buffer.concat(chunks).toString('utf8');
}
