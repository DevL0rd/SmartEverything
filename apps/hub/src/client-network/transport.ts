import type { IncomingHttpHeaders } from 'node:http';
import type { Readable } from 'node:stream';
import { request, type Dispatcher } from 'undici';
import {
  HUB_REQUEST_TIMEOUT_MS,
  HUB_STREAM_IDLE_TIMEOUT_MS,
  type NativeHubResourceOpen,
} from '@smarteverything/domain';
import type { HubLease, HubLeasePort } from './lease';
import { HubTransportError } from './policy';

interface HubCall {
  readonly method: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly body?: Readable | string;
  readonly idleTimeoutMs?: number;
}
export async function hubCall(lease: HubLease, call: HubCall): Promise<Dispatcher.ResponseData> {
  const response = await request(lease.url, {
    method: call.method,
    headers: call.headers,
    headersTimeout: HUB_REQUEST_TIMEOUT_MS,
    bodyTimeout: call.idleTimeoutMs ?? 0,
    ...(call.body === undefined ? {} : { body: call.body }),
    ...(lease.dispatcher === undefined ? {} : { dispatcher: lease.dispatcher }),
    ...(lease.signal === undefined ? {} : { signal: lease.signal }),
  });
  const status = response.statusCode;
  if (status >= 300 && status < 400 && status !== 304) {
    response.body.destroy();
    throw new HubTransportError('Hub redirects are forbidden');
  }
  return response;
}
export async function openHubResource(
  policies: HubLeasePort,
  input: NativeHubResourceOpen,
  options: { readonly headers: Readonly<Record<string, string>>; readonly signal: AbortSignal },
): Promise<Dispatcher.ResponseData> {
  const lease = policies.lease(input.scopeId, input.url, input.binding, input.routeGeneration);
  const signal =
    lease.signal === undefined ? options.signal : AbortSignal.any([options.signal, lease.signal]);
  const failed = (): void => {
    if (!signal.aborted) policies.failed?.(input.scopeId, input.routeGeneration);
  };
  try {
    const response = await hubCall(
      { ...lease, signal },
      {
        method: 'GET',
        headers: { ...options.headers, 'accept-encoding': 'identity' },
        idleTimeoutMs: HUB_STREAM_IDLE_TIMEOUT_MS,
      },
    );
    response.body.once('error', failed);
    return response;
  } catch (cause) {
    failed();
    throw cause;
  }
}
export function headerEntries(incoming: IncomingHttpHeaders): [string, string][] {
  return Object.entries(incoming).flatMap(([name, value]): [string, string][] =>
    value === undefined ? [] : [[name, Array.isArray(value) ? value.join(', ') : value]],
  );
}
