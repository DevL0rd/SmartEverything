import { isBag } from './fiber-diff';

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const DIGITS = /\/\d+(?=\/|$)/g;
const MEGABYTE = 1048576;

export interface Memory {
  readonly heapMb: number | null;
  readonly gcCount: number | null;
  readonly gcMs: number | null;
}

function numberAt(source: unknown, key: string): number | null {
  const value = isBag(source) ? source[key] : undefined;
  return typeof value === 'number' ? value : null;
}

function hermesStats(): unknown {
  const hermes: unknown = Reflect.get(globalThis, 'HermesInternal');
  const read = isBag(hermes) ? hermes['getInstrumentedStats'] : undefined;
  return typeof read === 'function' ? Reflect.apply(read, hermes, []) : null;
}

function megabytes(bytes: number | null): number | null {
  return bytes === null ? null : Math.round((bytes / MEGABYTE) * 10) / 10;
}

function millis(seconds: number | null): number | null {
  return seconds === null ? null : seconds * 1000;
}

export function readMemory(): Memory {
  const stats = hermesStats();
  if (stats !== null) {
    return {
      heapMb: megabytes(numberAt(stats, 'js_heapSize')),
      gcCount: numberAt(stats, 'js_numGCs'),
      gcMs: millis(numberAt(stats, 'js_gcTime')),
    };
  }
  const memory: unknown = Reflect.get(performance, 'memory');
  return { heapMb: megabytes(numberAt(memory, 'usedJSHeapSize')), gcCount: null, gcMs: null };
}

export function pathOf(input: unknown): string {
  const raw =
    typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.href
        : String(Reflect.get(Object(input), 'url'));
  const path = raw.replace(/^[a-z]+:\/\/[^/]+/i, '').split(/[?#]/)[0] ?? '';
  return path.replace(UUID, ':id').replace(DIGITS, '/:n').slice(0, 40);
}

export interface Hot {
  readonly json: (ms: number, size: number) => void;
  readonly net: (path: string, ms: number) => void;
}

export function patchGlobals(hot: Hot): () => void {
  const parse = JSON.parse.bind(JSON);
  const original = globalThis.fetch.bind(globalThis);
  JSON.parse = (
    text: string,
    reviver?: (this: unknown, key: string, value: unknown) => unknown,
  ): unknown => {
    const start = performance.now();
    const value: unknown = parse(text, reviver);
    hot.json(performance.now() - start, text.length);
    return value;
  };
  globalThis.fetch = async (
    input: Parameters<typeof fetch>[0],
    init?: RequestInit,
  ): Promise<Response> => {
    const start = performance.now();
    const response = await original(input, init);
    hot.net(pathOf(input), performance.now() - start);
    return response;
  };
  return (): void => {
    JSON.parse = parse;
    globalThis.fetch = original;
  };
}
