import { request as httpRequest, type IncomingMessage } from 'node:http';
import { request as httpsRequest } from 'node:https';
import type { NativeHubResourceOpen } from '@smarteverything/domain';
import type { HubLeasePort } from './lease.js';
import { HubTransportError } from './policy.js';

const HEADER_TIMEOUT_MS = 15_000;
export const RESOURCE_IDLE_TIMEOUT_MS = 60_000;
export const RESOURCE_HIGH_WATER_MARK = 64 * 1024;

function validateResponse(
  response: IncomingMessage,
  signal: AbortSignal,
  policies: HubLeasePort,
  input: NativeHubResourceOpen,
): void {
  const status = response.statusCode;
  if (status === undefined || (status >= 300 && status < 400 && status !== 304)) {
    response.destroy();
    throw new HubTransportError('Resource redirects or absent status are refused');
  }
  response.setTimeout(RESOURCE_IDLE_TIMEOUT_MS, () => {
    response.destroy(new HubTransportError('Resource upstream became idle'));
  });
  response.once('error', (): void => {
    if (!signal.aborted) policies.failed?.(input.scopeId, input.routeGeneration);
  });
}

interface ResourceHttpOptions {
  readonly method: 'GET' | 'HEAD';
  readonly headers: Readonly<Record<string, string>>;
  readonly signal: AbortSignal;
}
function validateTransport(url: URL): void {
  const loopback = ['127.0.0.1', '[::1]', 'localhost'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback))
    throw new HubTransportError('Resources require verified HTTPS or an owned loopback route');
}
export function openResourceResponse(
  policies: HubLeasePort,
  input: NativeHubResourceOpen,
  options: ResourceHttpOptions,
): Promise<IncomingMessage> {
  const { method, headers, signal } = options;
  const lease = policies.lease(input.scopeId, input.url, input.binding, input.routeGeneration);
  validateTransport(lease.url);
  const combined = lease.signal === undefined ? signal : AbortSignal.any([signal, lease.signal]);
  const create = lease.url.protocol === 'https:' ? httpsRequest : httpRequest;
  return new Promise((resolve, reject) => {
    const request = create(
      lease.url,
      {
        method,
        agent: lease.agent,
        ...{ signal: combined, hubAbortSignal: combined },
        headers: { ...headers, 'accept-encoding': 'identity' },
        maxHeaderSize: 16 * 1024,
      },
      (response) => {
        clearTimeout(timer);
        try {
          validateResponse(response, combined, policies, input);
        } catch (cause) {
          reject(
            cause instanceof Error
              ? cause
              : new HubTransportError('Resource response validation failed'),
          );
          return;
        }
        resolve(response);
      },
    );
    const timer = setTimeout(() => {
      request.destroy(new HubTransportError('Resource response headers timed out'));
    }, HEADER_TIMEOUT_MS);
    timer.unref();
    request.on('close', () => {
      clearTimeout(timer);
    });
    request.on('error', (cause: Error): void => {
      if (!combined.aborted) policies.failed?.(input.scopeId, input.routeGeneration);
      reject(cause);
    });
    request.end();
  });
}
