import type { IncomingMessage, ServerResponse } from 'node:http';
import { ApiError } from '@smarteverything/domain';

export const PUBLIC_BODY_LIMIT = 64 * 1024;

export const BODY_LIMIT = 16 * 1024 * 1024;

export function readBody(request: IncomingMessage, limit: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    request.on('data', (chunk: Buffer) => {
      size += chunk.byteLength;
      if (size > limit) {
        reject(
          new ApiError('payload_too_large', `The body is larger than ${String(limit)} bytes.`),
        );
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.once('end', () => {
      resolve(Buffer.concat(chunks));
    });
    request.once('error', reject);
  });
}

export function parseJsonBody(request: IncomingMessage, raw: Buffer): unknown {
  if (raw.byteLength === 0) {
    return undefined;
  }
  const type = request.headers['content-type'] ?? '';
  if (!type.toLowerCase().startsWith('application/json')) {
    throw new ApiError(
      'unsupported_media_type',
      `A body must be sent as application/json; received ${type === '' ? 'no content type' : type}.`,
    );
  }
  try {
    const parsed: unknown = JSON.parse(raw.toString('utf8'));
    return parsed;
  } catch (error) {
    throw new ApiError(
      'invalid_request',
      `The body is not JSON: ${error instanceof Error ? error.message : String(error)}.`,
    );
  }
}

export function sendJson(response: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(text),
    'cache-control': 'no-store',
  });
  response.end(text);
}

export function sendError(response: ServerResponse, error: ApiError): void {
  if (response.headersSent) {
    response.destroy(error);
    return;
  }
  sendJson(response, error.status, error.body());
}

export function bearerOf(request: IncomingMessage): string | null {
  const header = request.headers.authorization ?? '';
  const match = /^Bearer (\S+)$/.exec(header);
  return match?.[1] ?? null;
}

export function remoteOf(request: IncomingMessage): string {
  return request.socket.remoteAddress ?? 'unknown';
}
