import { describe, expect, it } from 'vitest';
import {
  CAPABILITY_DEFINITION,
  definitionKey,
  definitionPath,
  type CapabilityDefinition,
} from '../src/definition-schema';
import { rawFromDefinition, rawFromStatus, type RawContext } from '../src/raw-bindings';
import { statusOf } from './helpers';

function washer(): CapabilityDefinition {
  return CAPABILITY_DEFINITION.parse({
    id: 'custom.washer',
    version: 1,
    status: 'live',
    name: 'Washer',
    attributes: {
      washerMode: {
        schema: {
          type: 'object',
          properties: { value: { type: 'string', enum: ['quick', 'cotton'] } },
        },
        setter: 'setWasherMode',
      },
      remainingTime: {
        schema: {
          type: 'object',
          properties: { value: { type: 'integer', minimum: 0 }, unit: { enum: ['min'] } },
        },
      },
      rinseCycles: {
        schema: { properties: { value: { type: 'integer' } } },
        setter: 'missingCommand',
      },
      spin: { schema: { properties: { value: { type: 'string' } } }, setter: 'setSpin' },
    },
    commands: {
      setWasherMode: {
        name: 'setWasherMode',
        arguments: [{ name: 'mode', schema: { type: 'string' } }],
      },
      setSpin: { name: 'setSpin', arguments: [{ name: 'spin', schema: { type: 'string' } }] },
      start: { name: 'start', arguments: [] },
      schedule: {
        name: 'schedule',
        arguments: [
          { name: 'at', schema: { type: 'string' } },
          { name: 'repeat', optional: true, schema: { type: 'boolean' } },
          { name: 'label', optional: true, schema: { type: 'string' } },
        ],
      },
      reset: { name: 'reset' },
    },
  });
}

function contextOf(overrides: Partial<RawContext> = {}): RawContext {
  return {
    component: 'main',
    capability: 'custom.washer',
    status: statusOf({ 'custom.washer': { remainingTime: { value: 30, unit: 'min' } } }),
    coveredAttributes: new Set(),
    coveredCommands: new Set(['setSpin']),
    ...overrides,
  };
}

function bindingNamed(
  key: string,
  bindings: ReturnType<typeof rawFromDefinition>,
): ReturnType<typeof rawFromDefinition>[number] {
  const binding = bindings.find((entry) => entry.capability.key === key);
  if (binding === undefined) {
    throw new Error(`no binding ${key}`);
  }
  return binding;
}

describe('capability definitions', () => {
  it('are fetched by id and version and cached under both', () => {
    expect(definitionPath('samsungce.dryerMode', 2)).toBe('/v1/capabilities/samsungce.dryerMode/2');
    expect(definitionPath('a/b', 1)).toBe('/v1/capabilities/a%2Fb/1');
    expect(definitionKey('switch', 1)).toBe('switch@1');
  });
});

describe('raw capabilities from a definition', () => {
  const bindings = (): ReturnType<typeof rawFromDefinition> =>
    rawFromDefinition(contextOf(), washer());

  it('exposes every attribute and command no standard capability covers', () => {
    expect(bindings().map((binding) => binding.capability)).toEqual([
      {
        key: 'raw:custom.washer.washer_mode',
        label: 'Custom washer washer mode',
        access: 'read_write',
        value: { kind: 'enum', options: ['quick', 'cotton'] },
      },
      {
        key: 'raw:custom.washer.remaining_time',
        label: 'Custom washer remaining time',
        access: 'read',
        value: { kind: 'number', min: 0, max: 100_000, step: 1, unit: 'min' },
      },
      {
        key: 'raw:custom.washer.rinse_cycles',
        label: 'Custom washer rinse cycles',
        access: 'read',
        value: { kind: 'number', min: -100_000, max: 100_000, step: 1 },
      },
      {
        key: 'raw:custom.washer.spin',
        label: 'Custom washer spin',
        access: 'read',
        value: { kind: 'text', maxLength: 4096 },
      },
      {
        key: 'raw:custom.washer:start',
        label: 'Custom washer: start',
        access: 'write',
        value: { kind: 'action' },
      },
      {
        key: 'raw:custom.washer:schedule',
        label: 'Custom washer: schedule',
        access: 'write',
        value: { kind: 'action', arguments: ['at', 'repeat', 'label'] },
      },
      {
        key: 'raw:custom.washer:reset',
        label: 'Custom washer: reset',
        access: 'write',
        value: { kind: 'action' },
      },
    ]);
  });

  it('leaves out what a standard capability already covers', () => {
    const covered = rawFromDefinition(
      contextOf({
        coveredAttributes: new Set(['washerMode', 'remainingTime', 'rinseCycles', 'spin']),
        coveredCommands: new Set(['setWasherMode', 'setSpin', 'start', 'schedule']),
      }),
      washer(),
    );
    expect(covered.map((binding) => binding.capability.key)).toEqual(['raw:custom.washer:reset']);
  });

  it('writes an attribute through its setter and reads it from the status', () => {
    const mode = bindingNamed('raw:custom.washer.washer_mode', bindings());
    expect(mode.write?.('quick')).toEqual([
      {
        component: 'main',
        capability: 'custom.washer',
        command: 'setWasherMode',
        arguments: ['quick'],
      },
    ]);
    expect(mode.sources).toEqual([{ capability: 'custom.washer', attribute: 'washerMode' }]);
    expect(mode.read(statusOf({ 'custom.washer': { washerMode: 'cotton' } }))).toBe('cotton');
    expect(mode.read(statusOf({}))).toBeUndefined();
    expect(mode.read(statusOf({ 'custom.washer': { washerMode: null } }))).toBeUndefined();
    expect(bindingNamed('raw:custom.washer.remaining_time', bindings()).write).toBeNull();
  });

  it('sends commands with their arguments in order, leaving trailing optional ones out', () => {
    const schedule = bindingNamed('raw:custom.washer:schedule', bindings());
    expect(schedule.read(statusOf({}))).toBeUndefined();
    expect(schedule.sources).toEqual([]);
    expect(schedule.write?.({ at: '10:00', repeat: true, label: 'x' })).toEqual([
      {
        component: 'main',
        capability: 'custom.washer',
        command: 'schedule',
        arguments: ['10:00', true, 'x'],
      },
    ]);
    expect(schedule.write?.({ at: '10:00' })).toEqual([
      { component: 'main', capability: 'custom.washer', command: 'schedule', arguments: ['10:00'] },
    ]);
    expect(bindingNamed('raw:custom.washer:start', bindings()).write?.(null)).toEqual([
      { component: 'main', capability: 'custom.washer', command: 'start' },
    ]);
  });

  it('refuses a missing required argument and a gap before a later argument', () => {
    const schedule = bindingNamed('raw:custom.washer:schedule', bindings());
    expect(() => schedule.write?.({ repeat: true })).toThrow(
      'The custom.washer command cannot be built: the argument at is missing. Received {"repeat":true}.',
    );
    expect(() => schedule.write?.(null)).toThrow('the argument at is missing');
    expect(() => schedule.write?.({ at: '1', label: 'x' })).toThrow(
      'The custom.washer command cannot be built: the argument repeat is missing. Received {"at":"1","label":"x"}.',
    );
  });

  it('prefixes keys and keeps the component on commands for other components', () => {
    const other = rawFromDefinition(contextOf({ component: 'sub' }), washer());
    expect(other[0]?.capability.key).toBe('raw:sub-custom.washer.washer_mode');
    expect(other[0]?.component).toBe('sub');
    expect(other[0]?.write?.('quick')).toEqual([
      {
        component: 'sub',
        capability: 'custom.washer',
        command: 'setWasherMode',
        arguments: ['quick'],
      },
    ]);
  });
});

describe('raw capabilities from a definition without commands', () => {
  it('exposes only the attributes', () => {
    const definition = CAPABILITY_DEFINITION.parse({
      id: 'custom.reading',
      version: 1,
      attributes: { level: { schema: { properties: { value: { type: 'integer' } } } } },
    });
    expect(
      rawFromDefinition(contextOf({ capability: 'custom.reading' }), definition).map(
        (binding) => binding.capability.key,
      ),
    ).toEqual(['raw:custom.reading.level']);
  });
});

describe('raw capabilities from a status alone', () => {
  it('exposes every reported attribute read-only, described by its value', () => {
    const bindings = rawFromStatus(
      contextOf({
        capability: 'samsungce.mystery',
        status: statusOf({
          'samsungce.mystery': { level: { value: 3, unit: 'W' }, label: 'x', hidden: true },
        }),
        coveredAttributes: new Set(['hidden']),
      }),
    );
    expect(bindings.map((binding) => binding.capability)).toEqual([
      {
        key: 'raw:samsungce.mystery.level',
        label: 'Samsungce mystery level',
        access: 'read',
        value: { kind: 'number', min: -100_000, max: 100_000, step: 1, unit: 'W' },
      },
      {
        key: 'raw:samsungce.mystery.label',
        label: 'Samsungce mystery label',
        access: 'read',
        value: { kind: 'text', maxLength: 4096 },
      },
    ]);
    expect(bindings[0]?.write).toBeNull();
  });

  it('exposes nothing for a capability with no reported status', () => {
    expect(rawFromStatus(contextOf({ capability: 'refresh', status: statusOf({}) }))).toEqual([]);
  });

  it('describes an attribute reported without a value as text', () => {
    const [binding] = rawFromStatus(contextOf({ capability: 'x', status: { x: { y: {} } } }));
    expect(binding?.capability.value).toEqual({ kind: 'text', maxLength: 4096 });
  });
});
