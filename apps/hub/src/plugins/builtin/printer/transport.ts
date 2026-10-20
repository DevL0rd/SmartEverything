import { request as httpRequest, type ClientRequest, type IncomingMessage } from 'node:http';
import { isIP } from 'node:net';
import { connect as tlsConnect, type PeerCertificate, type TLSSocket } from 'node:tls';
import { PrinterError } from '@smarteverything/domain';
import { portOf } from './address';
import { authenticationScheme, basicHeader, digestHeader, type Credentials } from './http-auth';

export const CONNECT_TIMEOUT_MS = 5_000;
export const READ_TIMEOUT_MS = 10_000;
export const LONG_POLL_TIMEOUT_MS = 330_000;

export interface TransportConfig {
  readonly url: URL;
  readonly pin: string | null;
  readonly credentials: Credentials | null;
}

export interface HttpReply {
  readonly status: number;
  readonly contentType: string;
  readonly body: Uint8Array;
}

export interface PostOptions {
  readonly readTimeoutMs?: number;
  readonly signal?: AbortSignal;
}

export interface PeerSummary {
  readonly fingerprint: string;
  readonly subject: string;
  readonly validFrom: string;
  readonly validTo: string;
}

class PinMismatch extends Error {
  override readonly name = 'PinMismatch';

  constructor(
    readonly expected: string,
    readonly presented: string,
  ) {
    super('The printer presented a certificate that is not the pinned one.');
  }
}

function textOf(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? '';
}

function summaryOf(certificate: PeerCertificate): PeerSummary {
  return {
    fingerprint: certificate.fingerprint256,
    subject: textOf(certificate.subject.CN) || textOf(certificate.subject.O),
    validFrom: certificate.valid_from,
    validTo: certificate.valid_to,
  };
}

export function probeCertificate(host: string, port: number): Promise<PeerSummary> {
  return new Promise((resolve, reject) => {
    const socket = tlsConnect({
      host: host.replace(/^\[|\]$/gu, ''),
      port,
      rejectUnauthorized: false,
      ...(isIP(host.replace(/^\[|\]$/gu, '')) === 0 ? { servername: host } : {}),
    });
    socket.setTimeout(CONNECT_TIMEOUT_MS, () => {
      socket.destroy();
      reject(new PrinterError('unreachable', `${host}:${String(port)} did not answer in time`));
    });
    socket.once('secureConnect', () => {
      const summary = summaryOf(socket.getPeerCertificate());
      socket.end();
      resolve(summary);
    });
    socket.once('error', (cause) => {
      reject(unreachable(host, port, cause));
    });
  });
}

function unreachable(host: string, port: number, cause: Error): PrinterError {
  return new PrinterError(
    'unreachable',
    `${host}:${String(port)} is not reachable: ${cause.message}`,
    {
      code: 'code' in cause && typeof cause.code === 'string' ? cause.code : null,
    },
  );
}

function bodyOf(reply: IncomingMessage): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    reply.on('data', (chunk: Buffer) => chunks.push(chunk));
    reply.once('end', () => {
      resolve(Buffer.concat(chunks));
    });
    reply.once('error', reject);
    reply.once('aborted', () => {
      reject(new Error('The printer closed the connection before the reply ended.'));
    });
  });
}

function pathOf(url: URL): string {
  return `${url.pathname}${url.search}`;
}

interface Exchange {
  readonly reply: HttpReply;
  readonly challenge: string | null;
}

function verifiedSocket(
  url: URL,
  pin: string | null,
  signal: AbortSignal | undefined,
): Promise<TLSSocket> {
  const host = url.hostname.replace(/^\[|\]$/gu, '');
  return new Promise((resolve, reject) => {
    const socket = tlsConnect({
      host,
      port: portOf(url),
      rejectUnauthorized: false,
      ...(isIP(host) === 0 ? { servername: host } : {}),
      ...(signal === undefined ? {} : { signal }),
    });
    socket.setTimeout(CONNECT_TIMEOUT_MS, () => {
      socket.destroy(new Error('timed out'));
    });
    socket.once('error', reject);
    socket.once('secureConnect', () => {
      const presented = socket.getPeerCertificate().fingerprint256;
      if (pin !== presented) {
        socket.destroy();
        reject(new PinMismatch(pin ?? '', presented));
        return;
      }
      socket.off('error', reject);
      socket.setTimeout(0);
      resolve(socket);
    });
  });
}

function guardSockets(request: ClientRequest, connected: boolean, readMs: number): void {
  request.on('socket', (socket) => {
    socket.setTimeout(connected ? readMs : CONNECT_TIMEOUT_MS);
    if (!connected) {
      socket.once('connect', () => {
        socket.setTimeout(readMs);
      });
    }
    socket.on('timeout', () => {
      request.destroy(new Error('timed out'));
    });
  });
}

async function exchangeOf(response: IncomingMessage): Promise<Exchange> {
  const body = await bodyOf(response);
  const challenge = response.headers['www-authenticate'];
  return {
    reply: {
      status: response.statusCode ?? 0,
      contentType: response.headers['content-type'] ?? '',
      body,
    },
    challenge: typeof challenge === 'string' ? challenge : null,
  };
}

export class IppTransport {
  #scheme: 'basic' | 'digest' | null = null;
  #challenge: string | null = null;
  #count = 0;

  constructor(private readonly config: TransportConfig) {}

  async post(body: Uint8Array, options: PostOptions = {}): Promise<HttpReply> {
    const first = await this.#exchange(body, options, this.#authorization());
    if (first.reply.status !== 401 || this.config.credentials === null) return first.reply;
    this.#learn(first.challenge);
    const header = this.#authorization();
    if (header === null) return first.reply;
    return (await this.#exchange(body, options, header)).reply;
  }

  #learn(challenge: string | null): void {
    this.#challenge = challenge;
    this.#scheme = challenge === null ? null : authenticationScheme(challenge);
    this.#count = 0;
  }

  #authorization(): string | null {
    const { credentials } = this.config;
    if (credentials === null || this.#scheme === null) return null;
    if (this.#scheme === 'basic') return basicHeader(credentials);
    this.#count += 1;
    return this.#challenge === null
      ? null
      : digestHeader(this.#challenge, {
          method: 'POST',
          path: pathOf(this.config.url),
          credentials,
          count: this.#count,
        });
  }

  async #exchange(
    body: Uint8Array,
    options: PostOptions,
    authorization: string | null,
  ): Promise<Exchange> {
    const { url, pin } = this.config;
    const secure = url.protocol === 'https:';
    try {
      const socket = secure ? await verifiedSocket(url, pin, options.signal) : null;
      return await this.#send(body, options, authorization, socket);
    } catch (cause) {
      throw this.#failure(cause);
    }
  }

  #send(
    body: Uint8Array,
    options: PostOptions,
    authorization: string | null,
    socket: TLSSocket | null,
  ): Promise<Exchange> {
    const { url } = this.config;
    return new Promise((resolve, reject) => {
      const request = httpRequest(
        {
          protocol: 'http:',
          hostname: url.hostname.replace(/^\[|\]$/gu, ''),
          port: portOf(url),
          path: pathOf(url),
          method: 'POST',
          signal: options.signal,
          headers: {
            'Content-Type': 'application/ipp',
            'Content-Length': body.length,
            Connection: 'close',
            ...(authorization === null ? {} : { Authorization: authorization }),
          },
          ...(socket === null ? { agent: false } : { createConnection: (): TLSSocket => socket }),
        },
        (response) => {
          exchangeOf(response).then(resolve, reject);
        },
      );
      guardSockets(request, socket !== null, options.readTimeoutMs ?? READ_TIMEOUT_MS);
      request.on('error', reject);
      request.end(body);
    });
  }

  #failure(cause: unknown): PrinterError {
    if (cause instanceof PinMismatch) {
      return new PrinterError('certificate_changed', cause.message, {
        expected: cause.expected,
        presented: cause.presented,
      });
    }
    const error = cause instanceof Error ? cause : new Error(String(cause));
    return unreachable(this.config.url.hostname, portOf(this.config.url), error);
  }
}
