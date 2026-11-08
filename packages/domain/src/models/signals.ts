import { z } from 'zod';
import { AIR_BANDS } from '../presentation/air';
import { HEX } from './spec-base';
import type { ModelSpecChannel, ModelSpecCondition } from './spec-motion';

export type ModelSignalDefinition =
  | { readonly kind: 'unit'; readonly nullable?: boolean }
  | { readonly kind: 'number'; readonly unit: string; readonly nullable?: boolean }
  | { readonly kind: 'boolean' }
  | { readonly kind: 'enum'; readonly values?: readonly string[] }
  | { readonly kind: 'colour' };

const UNIT = { kind: 'unit' } as const;
const BOOLEAN = { kind: 'boolean' } as const;
const COLOUR = { kind: 'colour' } as const;
const OPEN_ENUM = { kind: 'enum' } as const;

export const MODEL_SIGNAL_NAMES = [
  'power',
  'online',
  'level',
  'brightness',
  'colour',
  'colourTemperature',
  'speed',
  'oscillating',
  'swingAngle',
  'target',
  'current',
  'thermal',
  'mode',
  'open',
  'position',
  'tilt',
  'locked',
  'progress',
  'battery',
  'charging',
  'presence',
  'motion',
  'objects',
  'waterLevel',
  'waterLow',
  'fill',
  'lamp',
  'door',
  'phase',
  'playing',
  'volume',
  'ringing',
  'screenOn',
  'fold',
  'incline',
  'inkLevels',
  'pressed',
  'alarm',
  'fault',
  'uv',
  'cameraPan',
  'cameraTilt',
  'drumSpeed',
  'lidarRaised',
  'lifted',
  'batteryLow',
  'cleanMode',
  'airQuality',
] as const;

export type ModelSignalName = (typeof MODEL_SIGNAL_NAMES)[number];

export const MODEL_SIGNALS: Readonly<Record<ModelSignalName, ModelSignalDefinition>> = {
  power: BOOLEAN,
  online: BOOLEAN,
  level: UNIT,
  brightness: UNIT,
  colour: COLOUR,
  colourTemperature: { kind: 'number', unit: 'K' },
  speed: UNIT,
  oscillating: BOOLEAN,
  swingAngle: { kind: 'number', unit: 'deg' },
  target: { kind: 'number', unit: 'C' },
  current: { kind: 'number', unit: 'C' },
  thermal: { kind: 'enum', values: ['idle', 'heating', 'cooling'] },
  mode: OPEN_ENUM,
  open: UNIT,
  position: UNIT,
  tilt: { kind: 'number', unit: 'deg' },
  locked: BOOLEAN,
  progress: UNIT,
  battery: UNIT,
  charging: BOOLEAN,
  presence: BOOLEAN,
  motion: BOOLEAN,
  objects: { kind: 'number', unit: 'count' },
  waterLevel: UNIT,
  waterLow: BOOLEAN,
  fill: UNIT,
  lamp: BOOLEAN,
  door: { kind: 'enum', values: ['closed', 'open', 'locked'] },
  phase: OPEN_ENUM,
  playing: BOOLEAN,
  volume: UNIT,
  ringing: BOOLEAN,
  screenOn: BOOLEAN,
  fold: UNIT,
  incline: { kind: 'number', unit: 'deg' },
  inkLevels: UNIT,
  pressed: { kind: 'enum', values: ['none', 'single', 'double', 'long'] },
  alarm: BOOLEAN,
  fault: BOOLEAN,
  uv: BOOLEAN,
  cameraPan: { kind: 'number', unit: 'deg', nullable: true },
  cameraTilt: { kind: 'number', unit: 'deg', nullable: true },
  drumSpeed: { kind: 'number', unit: 'rpm', nullable: true },
  lidarRaised: BOOLEAN,
  lifted: BOOLEAN,
  batteryLow: BOOLEAN,
  cleanMode: { kind: 'enum', values: ['sweep', 'mop', 'sweep_mop'] },
  airQuality: { kind: 'enum', values: AIR_BANDS },
};

export type ModelSignalValue = number | string | boolean | null;

export function isModelSignal(name: string): name is ModelSignalName {
  return Object.hasOwn(MODEL_SIGNALS, name);
}

function enumSchema(values: readonly string[] | undefined): z.ZodType<string> {
  return values === undefined
    ? z.string().min(1)
    : z.string().refine((value) => values.includes(value));
}

function baseSchema(definition: ModelSignalDefinition): z.ZodType<number | string | boolean> {
  switch (definition.kind) {
    case 'unit':
      return z.number().min(0).max(1);
    case 'number':
      return z.number();
    case 'boolean':
      return z.boolean();
    case 'enum':
      return enumSchema(definition.values);
    case 'colour':
      return HEX;
  }
}

export function modelSignalSchema(name: ModelSignalName): z.ZodType<ModelSignalValue> {
  const definition = MODEL_SIGNALS[name];
  const base = baseSchema(definition);
  const nullable =
    (definition.kind === 'unit' || definition.kind === 'number') && definition.nullable === true;
  return nullable ? base.nullable() : base;
}

export const MODEL_SIGNAL_SET = z
  .partialRecord(z.enum(MODEL_SIGNAL_NAMES), z.unknown())
  .superRefine((set, ctx) => {
    for (const name of MODEL_SIGNAL_NAMES) {
      if (!(name in set)) continue;
      const parsed = modelSignalSchema(name).safeParse(set[name]);
      if (!parsed.success) {
        ctx.addIssue({ code: 'custom', path: [name], message: `invalid ${name} value` });
      }
    }
  });

export interface ModelSignalProblem {
  readonly path: (string | number)[];
  readonly message: string;
}

function numeric(definition: ModelSignalDefinition): boolean {
  return definition.kind === 'unit' || definition.kind === 'number';
}

function problem(path: (string | number)[], message: string): ModelSignalProblem[] {
  return [{ path, message }];
}

function rangeProblems(
  path: (string | number)[],
  definition: ModelSignalDefinition,
  range: readonly [number, number],
): ModelSignalProblem[] {
  if (range[0] > range[1]) return problem(path, 'range runs from low to high');
  if (definition.kind === 'unit' && (range[0] < 0 || range[1] > 1)) {
    return problem(path, 'range lies within 0 to 1 for a unit signal');
  }
  return [];
}

function enumMapProblems(
  path: (string | number)[],
  name: string,
  definition: ModelSignalDefinition,
  table: Readonly<Record<string, unknown>>,
): ModelSignalProblem[] {
  if (definition.kind === 'boolean') {
    return Object.keys(table)
      .filter((key) => key !== 'true' && key !== 'false')
      .map((key) => ({ path, message: `${name} is boolean, table key ${key}` }));
  }
  if (definition.kind !== 'enum') return problem(path, `${name} is not an enum or boolean signal`);
  const values = definition.values;
  if (values === undefined) return [];
  return Object.keys(table)
    .filter((key) => !values.includes(key))
    .map((key) => ({ path, message: `${name} has no value ${key}` }));
}

function colourMapProblems(
  path: (string | number)[],
  name: string,
  definition: ModelSignalDefinition,
  from: 'signal' | 'temperature',
): ModelSignalProblem[] {
  if (from === 'signal') {
    return definition.kind === 'colour' ? [] : problem(path, `${name} is not a colour signal`);
  }
  return name === 'colourTemperature' ? [] : problem(path, `${name} is not a temperature signal`);
}

function mapProblems(
  channel: ModelSpecChannel,
  name: string,
  definition: ModelSignalDefinition,
): ModelSignalProblem[] {
  const path: (string | number)[] = ['map'];
  const map = channel.map;
  switch (map.type) {
    case 'linear':
    case 'speed':
      return numeric(definition)
        ? rangeProblems(path, definition, map.in)
        : problem(path, `${map.type} map needs a number signal, ${name} is ${definition.kind}`);
    case 'enum':
      return enumMapProblems(path, name, definition, map.table);
    case 'colour':
      return colourMapProblems(path, name, definition, map.from);
  }
}

export function channelSignalProblems(channel: ModelSpecChannel): ModelSignalProblem[] {
  if (typeof channel.source !== 'string') return [];
  if (!isModelSignal(channel.source)) {
    return problem(['source'], `unknown signal ${channel.source}`);
  }
  const definition = MODEL_SIGNALS[channel.source];
  return mapProblems(channel, channel.source, definition);
}

function valueFits(definition: ModelSignalDefinition, value: unknown): boolean {
  return baseSchema(definition).safeParse(value).success;
}

const ORDERED = new Set(['gt', 'gte', 'lt', 'lte']);

function leafProblems(
  path: (string | number)[],
  leaf: ModelSpecCondition['anyOf'][number]['allOf'][number],
): ModelSignalProblem[] {
  if (typeof leaf.signal !== 'string') return [];
  if (!isModelSignal(leaf.signal))
    return problem([...path, 'signal'], `unknown signal ${leaf.signal}`);
  const definition = MODEL_SIGNALS[leaf.signal];
  if (ORDERED.has(leaf.op) && !numeric(definition)) {
    return problem(
      [...path, 'op'],
      `${leaf.signal} is ${definition.kind}, ${leaf.op} needs a number`,
    );
  }
  if (!valueFits(definition, leaf.value)) {
    return problem([...path, 'value'], `value does not fit ${leaf.signal}`);
  }
  return [];
}

export function conditionSignalProblems(condition: ModelSpecCondition): ModelSignalProblem[] {
  return condition.anyOf.flatMap((group, groupIndex) =>
    group.allOf.flatMap((leaf, leafIndex) =>
      leafProblems(['anyOf', groupIndex, 'allOf', leafIndex], leaf),
    ),
  );
}

export function stateSignalProblems(
  state: Readonly<Record<string, number | string | boolean>>,
): ModelSignalProblem[] {
  return Object.entries(state).flatMap(([key, value]) => {
    if (!isModelSignal(key)) return [];
    const definition = MODEL_SIGNALS[key];
    return valueFits(definition, value) ? [] : problem([key], `value does not fit ${key}`);
  });
}

export interface ModelSignalSubject {
  readonly channels?: readonly ModelSpecChannel[] | undefined;
  readonly shots?: readonly { readonly when: ModelSpecCondition }[] | undefined;
  readonly states?:
    Readonly<Record<string, Readonly<Record<string, number | string | boolean>>>> | undefined;
}

export function specSignalProblems(spec: ModelSignalSubject): ModelSignalProblem[] {
  return [
    ...(spec.channels ?? []).flatMap((channel, index) =>
      channelSignalProblems(channel).map((p) => ({ ...p, path: ['channels', index, ...p.path] })),
    ),
    ...(spec.shots ?? []).flatMap((shot, index) =>
      conditionSignalProblems(shot.when).map((p) => ({
        ...p,
        path: ['shots', index, 'when', ...p.path],
      })),
    ),
    ...Object.entries(spec.states ?? {}).flatMap(([name, state]) =>
      stateSignalProblems(state).map((p) => ({ ...p, path: ['states', name, ...p.path] })),
    ),
  ];
}
