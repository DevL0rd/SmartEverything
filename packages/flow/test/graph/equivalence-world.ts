import { JSON_VALUE, jsonEquals, type JsonValue } from '@smarteverything/domain';
import type { Plan } from '../../src/compile/plan';
import type { FunctionInterface } from '../../src/functions/interface-hash';
import { asRecord } from '../../src/interpret/frames';
import type { NodeResult, Outputs } from '../../src/interpret/frames';
import { VAR_CHANGE_REQUEST, changeVariable } from '../../src/nodes/state/var-change';

export interface Callee {
  readonly id: string;
  readonly plan: Plan;
  readonly shape: FunctionInterface;
}

export interface World {
  readonly devices?: Readonly<Record<string, Readonly<Record<string, JsonValue>>>>;
  readonly variables?: Readonly<Record<string, JsonValue>>;
  readonly callee?: Callee;
}

export interface TracedWrite {
  readonly store: 'variable' | 'kept';
  readonly name: string;
  readonly value: JsonValue;
}

export interface Fake {
  readonly devices: Map<string, Record<string, JsonValue>>;
  readonly variables: Map<string, JsonValue>;
  readonly kept: Map<string, JsonValue>;
  readonly writes: TracedWrite[];
}

export type Handler = (fake: Fake, inputs: Outputs) => NodeResult;

const FRESH_DEVICE: Readonly<Record<string, JsonValue>> = {
  power: true,
  brightness: 80,
  color_temperature: 2700,
};

const DEFAULT_FAMILIES: readonly string[] = ['light'];

export function fakeOf(world: World): Fake {
  return {
    devices: new Map(
      Object.entries(world.devices ?? {}).map(([name, controls]) => [name, { ...controls }]),
    ),
    variables: new Map(Object.entries(world.variables ?? {})),
    kept: new Map(),
    writes: [],
  };
}

function listOf(value: JsonValue | undefined): readonly JsonValue[] {
  const parsed = JSON_VALUE.array().safeParse(value);
  return parsed.success ? parsed.data : [];
}

function namesOf(value: JsonValue | undefined): readonly string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return listOf(value).flatMap(namesOf);
  const held = asRecord(value);
  const room = held['room'];
  if (typeof room === 'string') {
    const families = listOf(held['families']).filter((family) => typeof family === 'string');
    return (families.length === 0 ? DEFAULT_FAMILIES : families).map(
      (family) => `${room}/${family}`,
    );
  }
  if (typeof held['group'] === 'string') return [`group:${held['group']}`];
  for (const field of ['target', 'device', 'devices']) {
    if (held[field] !== undefined) return namesOf(held[field]);
  }
  throw new Error(`the fake world cannot tell which device ${JSON.stringify(value)} names`);
}

function controlsOf(fake: Fake, name: string): Record<string, JsonValue> {
  const held = fake.devices.get(name) ?? { ...FRESH_DEVICE };
  fake.devices.set(name, held);
  return held;
}

function controlOf(value: JsonValue | undefined): string {
  return typeof value === 'string' ? value : 'value';
}

function readDevice(fake: Fake, inputs: Outputs): NodeResult {
  const [name] = namesOf(inputs['device']);
  if (name === undefined) throw new Error('the fake world was given no device to read');
  const value = controlsOf(fake, name)[controlOf(inputs['control'])];
  return {
    ok: true,
    value: value === undefined ? { available: false } : { value, available: true },
  };
}

function snapshotOf(fake: Fake, inputs: Outputs): NodeResult {
  const snapshot: Record<string, JsonValue> = {};
  for (const name of namesOf(inputs['target'])) snapshot[name] = { ...controlsOf(fake, name) };
  return { ok: true, value: { snapshot } };
}

function setDevice(fake: Fake, params: Outputs): NodeResult {
  const sent = namesOf(params['target']);
  const to = params['to'] ?? null;
  for (const name of sent) controlsOf(fake, name)[controlOf(params['control'])] = to;
  return { ok: true, value: { ok: true, sent, skipped: [], value: to } };
}

function restoreDevices(fake: Fake, params: Outputs): NodeResult {
  const snapshot = asRecord(params['snapshot']);
  const sent = Object.keys(snapshot);
  if (sent.length === 0) return { ok: false, class: 'Invalid', message: 'nothing to restore' };
  for (const name of sent) Object.assign(controlsOf(fake, name), asRecord(snapshot[name]));
  return { ok: true, value: { ok: true, sent, skipped: [] } };
}

interface Reading {
  readonly name: string;
  readonly value: JsonValue;
}

function readingsOf(fake: Fake, inputs: Outputs): readonly Reading[] {
  const control = controlOf(inputs['control']);
  return namesOf(inputs['target']).flatMap((name) => {
    const value = controlsOf(fake, name)[control];
    return value === undefined ? [] : [{ name, value }];
  });
}

function refsOf(readings: readonly Reading[]): JsonValue {
  return readings.map(({ name }) => ({ device: name }));
}

function numbersOf(readings: readonly Reading[]): readonly number[] | undefined {
  const numbers = readings.flatMap(({ value }) => (typeof value === 'number' ? [value] : []));
  return numbers.length === readings.length ? numbers : undefined;
}

function numericValue(fn: string, numbers: readonly number[]): JsonValue {
  const sum = numbers.reduce((total, next) => total + next, 0);
  if (fn === 'sum') return sum;
  if (numbers.length === 0) return null;
  if (fn === 'average') return sum / numbers.length;
  return fn === 'min' ? Math.min(...numbers) : Math.max(...numbers);
}

function matchValue(fn: string, readings: readonly Reading[], matched: number): JsonValue {
  if (fn === 'any') return matched > 0;
  if (fn === 'all') return readings.length > 0 && matched === readings.length;
  return fn === 'none' ? matched === 0 : matched;
}

function aggregate(fake: Fake, inputs: Outputs): NodeResult {
  const readings = readingsOf(fake, inputs);
  const fn = typeof inputs['fn'] === 'string' ? inputs['fn'] : 'any';
  const make = (value: JsonValue, matching: readonly Reading[]): NodeResult => ({
    ok: true,
    value: { value, count: matching.length, matching: refsOf(matching), offline: [] },
  });
  if (fn === 'latest') {
    const last = readings.slice(-1);
    return make(last[0]?.value ?? null, last);
  }
  if (['sum', 'average', 'min', 'max'].includes(fn)) {
    const numbers = numbersOf(readings);
    if (numbers === undefined) {
      return { ok: false, class: 'TypeError', message: `${fn} needs numbers` };
    }
    return make(numericValue(fn, numbers), readings);
  }
  const wanted = inputs['matches'] ?? null;
  const matching = readings.filter(({ value }) => jsonEquals(value, wanted));
  return make(matchValue(fn, readings, matching.length), matching);
}

function toolCall(_fake: Fake, inputs: Outputs): NodeResult {
  const tool = inputs['tool'] ?? null;
  const args = inputs['args'] ?? {};
  return { ok: true, value: { result: { tool, args }, ok: true } };
}

function textOf(value: JsonValue | undefined): string {
  return typeof value === 'string' ? value : JSON.stringify(value ?? null);
}

function readVariable(fake: Fake, inputs: Outputs): NodeResult {
  const home = inputs['source'] === 'home';
  const key = home ? `home:${textOf(inputs['value'])}` : textOf(inputs['name']);
  const value = fake.variables.get(key);
  if (value === undefined) {
    return { ok: false, class: 'NotFound', message: `the fake world has no variable ${key}` };
  }
  const revision = fake.writes.filter(({ store, name }) => store === 'variable' && name === key);
  return { ok: true, value: { value, revision: revision.length } };
}

function variableName(params: Outputs): string {
  const target = params['target'];
  if (typeof target !== 'string') throw new Error('a variable write names no variable');
  return target;
}

function writeVariable(fake: Fake, name: string, value: JsonValue): void {
  fake.variables.set(name, value);
  fake.writes.push({ store: 'variable', name, value });
}

function setVariable(fake: Fake, params: Outputs): NodeResult {
  const name = variableName(params);
  const previous = fake.variables.get(name);
  const value = params['to'] ?? null;
  writeVariable(fake, name, value);
  return { ok: true, value: previous === undefined ? { value } : { value, previous } };
}

function changeStored(fake: Fake, params: Outputs): NodeResult {
  const name = variableName(params);
  const request = VAR_CHANGE_REQUEST.parse(params['change']);
  const changed = changeVariable(fake.variables.get(name), request);
  if (!changed.ok) return { ok: false, class: changed.errorClass, message: changed.message };
  writeVariable(fake, name, changed.value);
  return {
    ok: true,
    value: { value: changed.value, previous: changed.previous, wrapped: changed.wrapped },
  };
}

export const EFFECTS: Readonly<Record<string, Handler>> = {
  'device.set': setDevice,
  'device.restore': restoreDevices,
  'var.set': setVariable,
  'var.change': changeStored,
  'tool.call': toolCall,
  'debug.log': () => ({ ok: true, value: {} }),
  'notify.feed': () => ({ ok: true, value: {} }),
};

export const READS: Readonly<Record<string, Handler>> = {
  'var.get': readVariable,
  'device.get': readDevice,
  'device.snapshot': snapshotOf,
  'device.aggregate': aggregate,
  'weather.read': () => ({ ok: true, value: { temperature: 24, rainChance: 10, kind: 'clear' } }),
};

export function handled(table: Readonly<Record<string, Handler>>, kind: string): Handler {
  const handler = table[kind];
  if (handler === undefined) throw new Error(`the fake world has no handler for ${kind}`);
  return handler;
}
