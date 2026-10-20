import { request as plainRequest, type IncomingMessage } from 'node:http';
import { request as secureRequest } from 'node:https';
import type { LookupFunction } from 'node:net';

const HTTP_RESPONSE_BYTES_MAX = 16 * 1024 * 1024;

export interface HttpExchange {
  readonly url: URL;
  readonly method: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string | undefined;
  readonly lookup: LookupFunction | undefined;
  readonly signal: AbortSignal;
}

export interface HttpAnswer {
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: Buffer;
}

export class HttpResponseTooLargeError extends Error {
  override readonly name = 'HttpResponseTooLargeError';

  constructor() {
    super(`The answer is larger than ${String(HTTP_RESPONSE_BYTES_MAX)} bytes.`);
  }
}

function flattened(headers: IncomingMessage['headers']): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers).flatMap(([name, value]) =>
      value === undefined ? [] : [[name, Array.isArray(value) ? value.join(', ') : value]],
    ),
  );
}

function collected(response: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    response.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > HTTP_RESPONSE_BYTES_MAX) {
        response.destroy(new HttpResponseTooLargeError());
        return;
      }
      chunks.push(chunk);
    });
    response.once('end', () => {
      resolve(Buffer.concat(chunks));
    });
    response.once('error', reject);
  });
}

export function exchange(sent: HttpExchange): Promise<HttpAnswer> {
  const open = sent.url.protocol === 'https:' ? secureRequest : plainRequest;
  return new Promise((resolve, reject) => {
    const request = open(
      sent.url,
      {
        method: sent.method,
        headers: sent.headers,
        signal: sent.signal,
        ...(sent.lookup === undefined ? {} : { lookup: sent.lookup }),
      },
      (response) => {
        collected(response).then((body) => {
          resolve({
            status: response.statusCode ?? 0,
            headers: flattened(response.headers),
            body,
          });
        }, reject);
      },
    );
    request.once('error', reject);
    request.end(sent.body);
  });
}
