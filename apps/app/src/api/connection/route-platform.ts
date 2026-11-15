import { z } from 'zod';
import {
  HUB_REQUEST_TIMEOUT_MS,
  HUB_WRITE_TIMEOUT_MS_PER_KIB,
  type HubEndpoint,
  type NativeHubCredentialBinding,
  type NativeHubNetwork,
  type NativeHubTrust,
} from '@smarteverything/domain';
import { nativeHubNetwork } from '../../../modules/health-connect/src/hub-network';
import { desktopBridge } from '../../design/platform';
import { Logger, background } from '@smarteverything/logging';
import { abortFacts, countEvent, failureFacts, nowMs, pathShape } from './request-log';

const log = new Logger('app.hub-route');

const METHOD = z.enum(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE']);

let nativeActivation: Promise<void> = Promise.resolve();

export function trackNativeActivation(task: Promise<void>): void {
  nativeActivation = task;
}

export function nativeServerActivated(): Promise<void> {
  return nativeActivation;
}

type RequestBridge = NativeHubNetwork & Required<Pick<NativeHubNetwork, 'request'>>;
export type SocketBridge = NativeHubNetwork &
  Required<
    Pick<NativeHubNetwork, 'openSocket' | 'sendSocket' | 'closeSocket' | 'subscribeSockets'>
  >;

export function hubNetwork(): NativeHubNetwork {
  return desktopBridge()?.hubNetwork ?? nativeHubNetwork;
}

function requestBridge(network: NativeHubNetwork): network is RequestBridge {
  return network.request !== undefined;
}

function sockets(network: NativeHubNetwork): network is SocketBridge {
  return (
    network.openSocket !== undefined &&
    network.sendSocket !== undefined &&
    network.closeSocket !== undefined &&
    network.subscribeSockets !== undefined
  );
}

export function socketBridge(network: NativeHubNetwork): SocketBridge | undefined {
  return sockets(network) ? network : undefined;
}

function cancelled(signal: AbortSignal): Error {
  if (signal.reason instanceof Error) return signal.reason;
  const error = new Error('The request was cancelled.');
  error.name = 'AbortError';
  return error;
}

function abortable<T>(work: Promise<T>, signal: AbortSignal | null | undefined): Promise<T> {
  if (signal === null || signal === undefined) return work;
  return new Promise<T>((resolve, reject) => {
    const abort = (): void => {
      reject(cancelled(signal));
    };
    signal.addEventListener('abort', abort, { once: true });
    background(
      work.then(resolve, reject).finally(() => {
        signal.removeEventListener('abort', abort);
      }),
      'route_platform.background_failed',
    );
  });
}

function isAborted(signal: AbortSignal | null | undefined): boolean {
  return signal?.aborted === true;
}

interface BridgedRequest {
  readonly scopeId: string;
  readonly url: string;
  readonly init: RequestInit;
  readonly route: PinnedRoute | undefined;
}

async function sendBridged(
  bridge: RequestBridge,
  { scopeId, url, init, route }: BridgedRequest,
): Promise<Response> {
  if (init.body !== undefined && init.body !== null && typeof init.body !== 'string')
    throw new TypeError('Pinned hub requests carry text bodies only.');
  const response = await bridge.request({
    scopeId,
    ...(route ?? {}),
    url,
    method: METHOD.parse(init.method),
    headers: Object.fromEntries(new Headers(init.headers).entries()),
    body: init.body ?? null,
  });
  return new Response(response.body === '' ? null : response.body, {
    status: response.status,
    headers: response.headers,
  });
}

function bodyBytes(body: NonNullable<RequestInit['body']>): number {
  if (typeof body === 'string') return body.length;
  if (body instanceof Blob) return body.size;
  if (body instanceof ArrayBuffer || ArrayBuffer.isView(body)) return body.byteLength;
  if (body instanceof URLSearchParams) return body.toString().length;
  throw new TypeError('Hub requests carry text, binary or form bodies only.');
}

export function requestTimeoutMs(init: RequestInit): number {
  const method = init.method ?? 'GET';
  if (method === 'GET' || method === 'HEAD' || init.body === undefined || init.body === null) {
    return HUB_REQUEST_TIMEOUT_MS;
  }
  return (
    HUB_REQUEST_TIMEOUT_MS + Math.ceil(bodyBytes(init.body) / 1024) * HUB_WRITE_TIMEOUT_MS_PER_KIB
  );
}

async function directFetch(url: string, init: RequestInit): Promise<Response> {
  const timeoutMs = requestTimeoutMs(init);
  const limit = deadline(timeoutMs, init.signal);
  const startedAt = nowMs();
  try {
    return await fetch(url, { ...init, redirect: 'error', signal: limit.signal });
  } catch (error) {
    const outerAborted = init.signal?.aborted === true;
    log.debug(outerAborted ? 'route.request_cancelled' : 'route.request_failed_direct', {
      transport: 'direct',
      method: init.method ?? 'GET',
      path: pathShape(url),
      elapsedMs: nowMs() - startedAt,
      timedOut: !outerAborted && limit.signal.aborted,
      timeoutMs,
      ...abortFacts(init.signal),
      ...failureFacts(error),
    });
    throw error;
  } finally {
    limit.clear();
  }
}

interface PinnedRoute {
  readonly binding: NativeHubCredentialBinding;
  readonly routeGeneration: number;
}

export async function pinnedFetch(
  scopeId: string,
  url: string,
  init: RequestInit,
  route?: PinnedRoute,
): Promise<Response> {
  const bridge = hubNetwork();
  if (!requestBridge(bridge)) return directFetch(url, init);
  const signal = init.signal;
  if (signal?.aborted === true) {
    log.debug('route.request_cancelled', () => ({
      transport: 'bridge',
      stage: 'before_send',
      path: pathShape(url),
      ...abortFacts(signal),
    }));
    throw cancelled(signal);
  }
  countEvent('route.bridge_request');
  const startedAt = nowMs();
  try {
    return await abortable(sendBridged(bridge, { scopeId, url, init, route }), signal);
  } catch (error) {
    log.debug(isAborted(signal) ? 'route.request_cancelled' : 'route.bridge_failed', {
      transport: 'bridge',
      method: init.method ?? 'GET',
      path: pathShape(url),
      pinned: route !== undefined,
      routeGeneration: route?.routeGeneration ?? null,
      elapsedMs: nowMs() - startedAt,
      ...abortFacts(signal),
      ...failureFacts(error),
    });
    throw error;
  }
}

export interface Deadline {
  readonly signal: AbortSignal;
  readonly clear: () => void;
}

export function deadline(ms: number, outer?: AbortSignal | null): Deadline {
  const controller = new AbortController();
  const relay = (): void => {
    controller.abort(outer?.reason);
  };
  if (outer?.aborted === true) relay();
  else outer?.addEventListener('abort', relay, { once: true });
  const timer = setTimeout(() => {
    controller.abort();
  }, ms);
  return {
    signal: controller.signal,
    clear: (): void => {
      clearTimeout(timer);
    },
  };
}

export function hubFetch(
  scopeId: string,
  endpoint: HubEndpoint,
  url: string,
  init: RequestInit,
): Promise<Response> {
  return endpoint.kind === 'lan' ? pinnedFetch(scopeId, url, init) : directFetch(url, init);
}

export async function configureRouteTrust(trust: NativeHubTrust): Promise<void> {
  const startedAt = nowMs();
  try {
    await hubNetwork().configureTrust(trust);
    log.debug('route.trust_configured', () => ({
      scopeId: trust.scopeId.slice(0, 8),
      elapsedMs: nowMs() - startedAt,
    }));
  } catch (error) {
    log.warn('route.trust_configure_failed', {
      scopeId: trust.scopeId.slice(0, 8),
      elapsedMs: nowMs() - startedAt,
      ...failureFacts(error),
    });
    throw error;
  }
}

export async function clearRouteTrust(scopeId: string): Promise<void> {
  try {
    await hubNetwork().clearTrust(scopeId);
  } catch (error) {
    log.warn('route.trust_clear_failed', { scopeId: scopeId.slice(0, 8), ...failureFacts(error) });
  }
}
