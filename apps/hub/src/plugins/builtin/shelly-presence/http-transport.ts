import { request } from 'node:https';
import type { ClientRequest, IncomingMessage } from 'node:http';
import { createSecureContext } from 'node:tls';
import { ApiError, type ShellyTransportTls } from '@smarteverything/domain';
export interface ShellyHttpTransport {
  readonly signal: AbortSignal;
  readonly tls: ShellyTransportTls | null;
  readonly headers?: Readonly<Record<string, string>>;
}
export function shellyHttp(url: URL, options: ShellyHttpTransport): Promise<Response> {
  if (options.tls === null)
    return fetch(url, {
      signal: options.signal,
      redirect: 'error',
      ...(options.headers === undefined ? {} : { headers: options.headers }),
    });
  if (url.protocol !== 'https:')
    throw new ApiError(
      'invalid_request',
      'Controller TLS material requires an HTTPS device address.',
    );
  const tls = tlsOptions(options.tls);
  createSecureContext(tls);
  return new Promise((resolve, reject) => {
    const pending = request(
      url,
      {
        ...tls,
        signal: options.signal,
        headers: { 'Accept-Encoding': 'identity', ...options.headers },
      },
      (reply) => {
        readReply(reply, pending).then(resolve, reject);
      },
    );
    pending.on('error', reject);
    pending.end();
  });
}
function readReply(reply: IncomingMessage, pending: ClientRequest): Promise<Response> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let bytes = 0;
    reply.on('data', (raw: unknown) => {
      if (!Buffer.isBuffer(raw)) {
        pending.destroy(new ShellyHttpTransportError('received unsupported response bytes'));
        return;
      }
      bytes += raw.byteLength;
      if (bytes > 262144) {
        pending.destroy(
          new ShellyHttpTransportError('response exceeded the bounded 262144-byte limit'),
        );
        return;
      }
      chunks.push(raw);
    });
    reply.on('end', () => {
      const headers = new Headers();
      for (const [key, value] of Object.entries(reply.headers))
        if (value !== undefined) headers.set(key, Array.isArray(value) ? value.join(',') : value);
      const status = reply.statusCode ?? 500;
      try {
        resolve(
          new Response([204, 205, 304].includes(status) ? null : Buffer.concat(chunks), {
            status,
            headers,
          }),
        );
      } catch (cause) {
        reject(
          cause instanceof Error
            ? cause
            : new ShellyHttpTransportError('could not be decoded as a bounded HTTP response'),
        );
      }
    });
    reply.on('error', reject);
  });
}
export function tlsOptions(tls: ShellyTransportTls): {
  ca?: string;
  cert?: string;
  key?: string;
  rejectUnauthorized: true;
} {
  return {
    rejectUnauthorized: true,
    ...(tls.caPem === null ? {} : { ca: tls.caPem }),
    ...(tls.clientCertificate === null ? {} : { cert: tls.clientCertificate }),
    ...(tls.clientKey === null ? {} : { key: tls.clientKey }),
  };
}
class ShellyHttpTransportError extends Error {
  override readonly name = 'ShellyHttpTransportError';
  constructor(reason: string) {
    super(`The local HTTPS response ${reason}.`);
  }
}
