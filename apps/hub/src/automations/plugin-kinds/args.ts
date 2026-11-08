import type { ArgSource, JsonValue, PluginNode } from '@smarteverything/domain';
import type { Outputs } from '@smarteverything/flow/interpret/frames';

export type BoundArgs = Readonly<Record<string, JsonValue>>;

function boundValue(source: ArgSource, params: Outputs): JsonValue | undefined {
  if ('port' in source) return params[source.port];
  if ('lit' in source) return source.lit;
  return bindArgs(source.record, params);
}

export function bindArgs(args: Readonly<Record<string, ArgSource>>, params: Outputs): BoundArgs {
  return Object.fromEntries(
    Object.entries(args).flatMap(([name, source]) => {
      const value = boundValue(source, params);
      return value === undefined ? [] : [[name, value]];
    }),
  );
}

const INDEX = /^(0|[1-9][0-9]*)$/;

function isList(value: JsonValue | undefined): value is readonly JsonValue[] {
  return Array.isArray(value);
}

function childOf(value: JsonValue | undefined, token: string): JsonValue | undefined {
  if (isList(value)) return INDEX.test(token) ? value[Number(token)] : undefined;
  if (value === null || typeof value !== 'object') return undefined;
  return Object.hasOwn(value, token) ? value[token] : undefined;
}

export function atPointer(value: JsonValue, pointer: string): JsonValue | undefined {
  if (pointer === '') return value;
  return pointer
    .slice(1)
    .split('/')
    .map((token) => token.replaceAll('~1', '/').replaceAll('~0', '~'))
    .reduce<JsonValue | undefined>(childOf, value);
}

export type MappedOutputs =
  | { readonly ok: true; readonly outputs: Outputs }
  | { readonly ok: false; readonly missing: readonly string[] };

type OutputPorts = PluginNode['outputs'];

const EVENT_ROOT = '/event';

function fromEvent(port: OutputPorts[number]): boolean {
  return port.from === EVENT_ROOT || port.from.startsWith(`${EVENT_ROOT}/`);
}

function mapped(
  ports: OutputPorts,
  source: JsonValue,
  pointerOf: (port: OutputPorts[number]) => string,
): MappedOutputs {
  const entries = ports.map((port) => [port, atPointer(source, pointerOf(port))] as const);
  const missing = entries
    .filter(([port, value]) => value === undefined && port.optional !== true)
    .map(([port]) => port.name);
  if (missing.length > 0) return { ok: false, missing };
  return {
    ok: true,
    outputs: Object.fromEntries(
      entries.flatMap(([port, value]) => (value === undefined ? [] : [[port.name, value]])),
    ),
  };
}

export function mapOutputs(ports: OutputPorts, answer: JsonValue): MappedOutputs {
  return mapped(
    ports.filter((port) => !fromEvent(port)),
    answer,
    (port) => port.from,
  );
}

export function mapEventOutputs(ports: OutputPorts, data: JsonValue): MappedOutputs {
  return mapped(ports.filter(fromEvent), data, (port) => port.from.slice(EVENT_ROOT.length));
}
