import type { ServerResponse } from 'node:http';
import type { Caller } from './auth';

export interface RequestTrace {
  readonly id: string;
  readonly startedAt: number;
  route: string | null;
  access: string | null;
  clientId: string | null;
  errorCode: string | null;
  reason: string | null;
}

const traces = new WeakMap<ServerResponse, RequestTrace>();

let sequence = 0;

export function beginTrace(response: ServerResponse): RequestTrace {
  sequence += 1;
  const trace: RequestTrace = {
    id: sequence.toString(36),
    startedAt: performance.now(),
    route: null,
    access: null,
    clientId: null,
    errorCode: null,
    reason: null,
  };
  traces.set(response, trace);
  return trace;
}

export function noteRoute(response: ServerResponse, route: string, access?: string): void {
  const trace = traces.get(response);
  if (trace === undefined) return;
  trace.route = route;
  if (access !== undefined) trace.access = access;
}

export function noteCaller(response: ServerResponse, caller: Caller): void {
  const trace = traces.get(response);
  if (trace === undefined) return;
  if (caller.kind === 'client') trace.clientId = caller.client.id;
  else if (caller.kind === 'service') trace.clientId = `service:${caller.profileId}`;
}

const IDENTIFIER_SEGMENT = /^(?:[0-9a-f-]{16,}|\d+)$/i;

export function shapeOf(pathname: string): string {
  return pathname
    .split('/')
    .slice(0, 8)
    .map((segment) => (IDENTIFIER_SEGMENT.test(segment) ? ':id' : segment.slice(0, 40)))
    .join('/');
}

const PRIVATE_V4 = /^(?:10\.|192\.168\.|169\.254\.|172\.(?:1[6-9]|2\d|3[01])\.)/;
const PRIVATE_V6 = /^(?:f[cd][0-9a-f]{2}:|fe80:)/i;

export function remoteKind(address: string | undefined): string {
  if (address === undefined) return 'unknown';
  const plain = address.replace(/^::ffff:/, '');
  if (plain === '::1' || plain.startsWith('127.')) return 'loopback';
  return PRIVATE_V4.test(plain) || PRIVATE_V6.test(plain) ? 'private' : 'public';
}
