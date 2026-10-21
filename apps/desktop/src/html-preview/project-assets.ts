import { request as requestHttps } from 'node:https';
import { request as requestHttp, type IncomingMessage } from 'node:http';
import { BrowserPolicyError, chatFilesUrl } from '@smarteverything/domain';
import type { NativeHtmlPage, NativeHtmlTransportPort } from './page.js';

const HEADERS = [
  'content-type',
  'content-length',
  'content-range',
  'accept-ranges',
  'location',
  'content-security-policy',
  'cache-control',
  'referrer-policy',
  'x-content-type-options',
];
export function projectAsset(
  port: NativeHtmlTransportPort,
  page: NativeHtmlPage,
  request: Request,
): Promise<Response> {
  const { input } = page;
  port.authorize(input.scopeId, input.authorization, page.owner);
  const prefix = chatFilesUrl(input.page.chatId, '');
  const url = new URL(`${input.binding.canonicalOrigin}${prefix}${assetPath(request.url)}`);
  const lease = port.lease(input.scopeId, url.href, input.binding);
  const signals = [page.signal, request.signal];
  if (lease.signal !== undefined) signals.push(lease.signal);
  const signal = AbortSignal.any(signals);
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const create = lease.url.protocol === 'https:' ? requestHttps : requestHttp;
    const range = request.headers.get('range');
    const upstream = create(lease.url, {
      method: request.method,
      agent: lease.agent,
      signal,
      ...{ hubAbortSignal: signal },
      headers: {
        authorization: input.authorization,
        'accept-encoding': 'identity',
        ...(range === null ? {} : { range }),
      },
    });
    upstream.on('response', (response) => {
      try {
        resolve(assetResponse(response, request.method, signal, prefix));
      } catch (cause) {
        response.destroy();
        reject(
          cause instanceof Error
            ? cause
            : new BrowserPolicyError('Project asset response was invalid.'),
        );
      }
    });
    upstream.on('error', (cause: Error) => {
      if (!signal.aborted) port.failed?.(input.scopeId, undefined);
      reject(cause);
    });
    upstream.end();
  });
}
function assetPath(value: string): string {
  const url = new URL(value);
  return `${url.pathname}${url.search}`;
}
function assetResponse(
  response: IncomingMessage,
  method: string,
  signal: AbortSignal,
  prefix: string,
): Response {
  const status = response.statusCode;
  if (status === undefined) throw new BrowserPolicyError('Project asset response has no status.');
  const headers = new Headers();
  for (const name of HEADERS) {
    const value = response.headers[name];
    if (typeof value === 'string') headers.set(name, value);
  }
  const location = headers.get('location');
  if (location !== null) {
    if (
      !location.startsWith(`${prefix}/`) ||
      location.startsWith(`${prefix}//`) ||
      /[\\\r\n]/u.test(location)
    )
      throw new BrowserPolicyError('Page redirects must stay inside the chat project.');
    headers.set('location', location.slice(prefix.length));
  }
  if (method === 'HEAD' || [204, 205, 304].includes(status)) {
    response.resume();
    return new Response(null, { status, headers });
  }
  return new Response(assetStream(response, signal), { status, headers });
}
function assetStream(response: IncomingMessage, signal: AbortSignal): ReadableStream<Uint8Array> {
  response.pause();
  return new ReadableStream<Uint8Array>({
    start(controller): void {
      const abort = (): void => {
        response.destroy();
      };
      signal.addEventListener('abort', abort, { once: true });
      response.once('close', () => {
        signal.removeEventListener('abort', abort);
      });
      response.on('data', (chunk: Buffer) => {
        controller.enqueue(new Uint8Array(chunk));
        response.pause();
      });
      response.once('end', () => {
        controller.close();
      });
      response.once('error', (cause: Error) => {
        controller.error(cause);
      });
      response.once('aborted', () => {
        controller.error(new BrowserPolicyError('Project asset stream was interrupted.'));
      });
      if (signal.aborted) abort();
    },
    pull(): void {
      response.resume();
    },
    cancel(): void {
      response.destroy();
    },
  });
}
