import { jsonEquals, type JsonValue, type PluginValue } from '@smarteverything/domain';
import type { Store } from '../../store/store';
import { ReadFailure, type ReadInputs, type ReadResult, type ReadScope } from './read-port';

export interface PluginValueBinding {
  readonly pluginId: string;
  readonly stream: string;
  readonly select: {
    readonly list: string;
    readonly key: string;
    readonly port: string;
  } | null;
  readonly outputs: readonly { readonly name: string; readonly from: string }[];
}

export type PluginValueHandler = (inputs: ReadInputs, scope: ReadScope) => ReadResult;

export function valueBindingOf(pluginId: string, value: PluginValue): PluginValueBinding {
  return {
    pluginId,
    stream: value.from.stream,
    select: value.from.select ?? null,
    outputs: value.outputs.map((port) => ({ name: port.name, from: port.from })),
  };
}

const ARRAY_INDEX = /^(0|[1-9]\d*)$/;

function isList(value: JsonValue): value is readonly JsonValue[] {
  return Array.isArray(value);
}

function child(current: JsonValue, token: string): JsonValue | undefined {
  if (isList(current)) return ARRAY_INDEX.test(token) ? current[Number(token)] : undefined;
  if (current !== null && typeof current === 'object') {
    return Object.hasOwn(current, token) ? current[token] : undefined;
  }
  return undefined;
}

export function readPointer(root: JsonValue, pointer: string): JsonValue | undefined {
  if (pointer === '') return root;
  let current: JsonValue | undefined = root;
  for (const raw of pointer.slice(1).split('/')) {
    if (current === undefined) return undefined;
    current = child(current, raw.replaceAll('~1', '/').replaceAll('~0', '~'));
  }
  return current;
}

function itemOf(
  binding: PluginValueBinding,
  select: NonNullable<PluginValueBinding['select']>,
  reading: JsonValue,
  inputs: ReadInputs,
): JsonValue {
  const wanted = inputs[select.port];
  if (wanted === undefined) {
    throw new ReadFailure('Invalid', `${binding.stream} needs ${select.port} to be chosen`);
  }
  const list = readPointer(reading, select.list);
  const found =
    list !== undefined && isList(list)
      ? list.find((item) => {
          const key = readPointer(item, select.key);
          return key !== undefined && jsonEquals(key, wanted);
        })
      : undefined;
  if (found === undefined) {
    throw new ReadFailure(
      'NotFound',
      `${binding.stream} has no entry for the chosen ${select.port}`,
    );
  }
  return found;
}

function outputsFrom(binding: PluginValueBinding, source: JsonValue): ReadResult {
  const outputs: Record<string, JsonValue> = {};
  for (const output of binding.outputs) {
    const value = readPointer(source, output.from);
    if (value === undefined) {
      throw new ReadFailure('NotFound', `${binding.stream} has no ${output.from} to read`);
    }
    outputs[output.name] = value;
  }
  return { outputs };
}

function latestReading(store: Pick<Store, 'pluginData'>, binding: PluginValueBinding): JsonValue {
  const row = store.pluginData
    .streams()
    .find((entry) => entry.plugin_id === binding.pluginId && entry.stream === binding.stream);
  if (row === undefined) {
    throw new ReadFailure(
      'NotFound',
      `${binding.pluginId} has no ${binding.stream} reading, or it is switched off`,
    );
  }
  return row.value;
}

export function pluginValueHandler(
  store: Pick<Store, 'pluginData'>,
  binding: PluginValueBinding | undefined,
): PluginValueHandler | undefined {
  if (binding === undefined) return undefined;
  return (inputs): ReadResult => {
    const reading = latestReading(store, binding);
    const source =
      binding.select === null ? reading : itemOf(binding, binding.select, reading, inputs);
    return outputsFrom(binding, source);
  };
}
