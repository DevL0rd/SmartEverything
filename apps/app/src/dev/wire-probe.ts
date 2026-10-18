import { hubNetwork } from '../api/connection/route-platform';
import { patchAll, patchMember, type AnyFunction } from './patch-global';
import { addContributor } from './window-bus';
import { TallyTable, kilobytes, round1, sizeOf, type WindowFields } from './window-math';
import { background } from '@smarteverything/logging';

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const NUMBER_SEGMENT = /\/\d+(?=\/|$)/g;
const TOP = 6;
const PATH_MAX = 40;

const socketsIn = new TallyTable();
const socketsOut = new TallyTable();
const liveTypes = new TallyTable();
const requests = new TallyTable();
let liveJsonMs = 0;
let requestFailures = 0;
let active = false;
let jsonDone = 0;

export function pathLabel(url: string): string {
  const path = url.replace(/^[a-z]+:\/\/[^/]+/i, '').split(/[?#]/)[0] ?? '';
  return path.replace(UUID, ':id').replace(NUMBER_SEGMENT, '/:n').slice(0, PATH_MAX);
}

export function wireFrame(socket: string, direction: 'in' | 'out', data: unknown): void {
  if (active) {
    (direction === 'in' ? socketsIn : socketsOut).add(pathLabel(socket), 0, sizeOf(data));
  }
}

export function markJsonParsed(): void {
  if (active) {
    jsonDone = performance.now();
  }
}

export function timedRead<T>(
  data: unknown,
  read: (data: unknown) => T,
  label: (result: T) => string,
): T {
  if (!active) {
    return read(data);
  }
  const start = performance.now();
  jsonDone = start;
  const result = read(data);
  const end = performance.now();
  liveJsonMs += jsonDone - start;
  liveTypes.add(label(result), end - start, sizeOf(data));
  return result;
}

function urlOf(input: unknown): string {
  if (typeof input === 'string') {
    return input;
  }
  return input instanceof URL ? input.href : String(Reflect.get(Object(input), 'url'));
}

function recordResponse(path: string, start: number, response: unknown): void {
  const headers: unknown = response instanceof Response ? response.headers : null;
  const length = headers instanceof Headers ? Number(headers.get('content-length') ?? 0) : 0;
  requests.add(path, performance.now() - start, Number.isFinite(length) ? length : 0);
  if (response instanceof Response && !response.ok) {
    requestFailures += 1;
  }
}

function timedFetch(original: AnyFunction): AnyFunction {
  return function (this: unknown, ...args: unknown[]): unknown {
    const result: unknown = Reflect.apply(original, this, args);
    if (!(result instanceof Promise)) {
      return result;
    }
    const path = pathLabel(urlOf(args[0]));
    const start = performance.now();
    background(
      result.then(
        (response: unknown) => {
          recordResponse(path, start, response);
        },
        () => {
          requestFailures += 1;
        },
      ),
      'wire_probe.background_failed',
    );
    return result;
  };
}

function recordNative(path: string, start: number, response: unknown): void {
  const body: unknown = Reflect.get(Object(response), 'body');
  const status: unknown = Reflect.get(Object(response), 'status');
  requests.add(path, performance.now() - start, typeof body === 'string' ? body.length : 0);
  if (typeof status === 'number' && status >= 400) {
    requestFailures += 1;
  }
}

function timedNative(original: AnyFunction): AnyFunction {
  return function (this: unknown, ...args: unknown[]): unknown {
    const result: unknown = Reflect.apply(original, this, args);
    if (!(result instanceof Promise)) {
      return result;
    }
    const path = pathLabel(urlOf(args[0]));
    const start = performance.now();
    background(
      result.then(
        (response: unknown) => {
          recordNative(path, start, response);
        },
        () => {
          requestFailures += 1;
        },
      ),
      'wire_probe.background_failed',
    );
    return result;
  };
}

function wireFields(): WindowFields {
  const inbound = socketsIn.total();
  const outbound = socketsOut.total();
  const live = liveTypes.total();
  const fetched = requests.total();
  return {
    wsIn: inbound.count,
    wsInKb: kilobytes(inbound.bytes),
    wsOut: outbound.count,
    wsOutKb: kilobytes(outbound.bytes),
    live: live.count,
    liveMs: round1(live.ms),
    liveJsonMs: round1(liveJsonMs),
    liveZodMs: round1(live.ms - liveJsonMs),
    liveMaxMs: round1(live.worstMs),
    req: fetched.count,
    reqMs: Math.round(fetched.ms),
    reqKb: kilobytes(fetched.bytes),
    reqMaxMs: Math.round(fetched.worstMs),
    reqFail: requestFailures,
  };
}

function wireDetails(): { kind: string; top: string }[] {
  const details = [
    { kind: 'live', top: liveTypes.encode(TOP, (row) => row.ms) },
    { kind: 'sockets', top: socketsIn.encode(TOP, (row) => row.bytes) },
    { kind: 'requests', top: requests.encode(TOP, (row) => row.ms) },
  ];
  [socketsIn, socketsOut, liveTypes, requests].forEach((table) => {
    table.clear();
  });
  liveJsonMs = 0;
  requestFailures = 0;
  return details;
}

export function startWireProbe(): () => void {
  active = true;
  const patches = patchAll([
    patchMember(globalThis, 'fetch', timedFetch),
    patchMember(hubNetwork(), 'request', timedNative),
  ]);
  const remove = addContributor('wire', {
    fields: wireFields,
    details: wireDetails,
  });
  return (): void => {
    active = false;
    remove();
    patches.stop();
  };
}
