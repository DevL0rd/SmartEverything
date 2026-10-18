import { describe, expect, it } from 'vitest';
import type { DeviceCapability } from '@smarteverything/domain';
import {
  defaultLiteral,
  fieldInputs,
  fits,
  inputsFitting,
  kindOfShape,
  kindOfValue,
  operandInfo,
  readingsFitting,
  shapeOfOperand,
  singleInput,
  valuesFitting,
} from './inputs';
import { VALUE_ID, catalogFixture, valueRow } from './catalog-fixture';
import { LAMP, PURIFIER, lamp } from './test-devices';

describe('what can feed what', () => {
  it('names the kind of a control and of a Value', () => {
    const kind = (capability: DeviceCapability): ReturnType<typeof kindOfShape> =>
      kindOfShape({ type: 'reading', device: lamp, capability });
    const base = { key: 'power', label: 'x', access: 'read_write' } as const;
    expect(kind({ ...base, value: { kind: 'boolean' } })).toBe('flag');
    expect(kind({ ...base, value: { kind: 'number', min: 0, max: 1, step: 1, unit: 'ms' } })).toBe(
      'duration',
    );
    expect(kind({ ...base, value: { kind: 'enum', options: ['a'] } })).toBe('text');
    expect(kind({ ...base, value: { kind: 'color' } })).toBeNull();
    expect(kindOfValue(valueRow().content)).toBe('number');
  });

  it('lets a choice feed a text control and nothing else cross over', () => {
    expect(fits('text', 'choice')).toBe(true);
    expect(fits('number', 'duration')).toBe(false);
    expect(fits('flag', 'flag')).toBe(true);
  });

  it('offers only the Values, inputs and readings of the right kind', () => {
    const catalog = catalogFixture({ inputs: [{ name: 'level', type: 'number' }] });
    expect(valuesFitting(catalog, 'number')).toHaveLength(1);
    expect(valuesFitting(catalog, 'flag')).toHaveLength(0);
    expect(inputsFitting(catalog, 'number')).toHaveLength(1);
    expect(inputsFitting(catalog, 'text')).toHaveLength(0);
    const purifier = catalog.devices.find((device) => device.id === PURIFIER);
    if (purifier === undefined) throw new Error('Fixture device exists');
    expect(readingsFitting(purifier, 'number').map((entry) => entry.key)).toContain('pm25');
    expect(readingsFitting(purifier, 'duration')).toHaveLength(0);
  });

  it('reads an operand into what the editor needs to show it', () => {
    const catalog = catalogFixture({ inputs: [{ name: 'level', type: 'number' }] });
    expect(operandInfo(catalog, { value: VALUE_ID }).source).toBe('value');
    expect(operandInfo(catalog, { input: 'level' }).source).toBe('input');
    expect(operandInfo(catalog, { input: 'nope' }).source).toBe('missing');
    expect(operandInfo(catalog, { device: LAMP, control: 'power' }).source).toBe('device');
    expect(operandInfo(catalog, { device: LAMP, control: 'raw:nope' }).source).toBe('missing');
    expect(shapeOfOperand(operandInfo(catalog, { weather: 'kind' }))).toBeNull();
    expect(shapeOfOperand(operandInfo(catalog, { weather: 'humidity' }))).toEqual({
      type: 'weather',
      metric: 'humidity',
    });
  });

  it('gives each kind a sensible blank', () => {
    expect(defaultLiteral('flag')).toBe(false);
    expect(defaultLiteral('duration')).toBe(0);
    expect(defaultLiteral('text')).toBe('');
  });
});

describe('a Set step value', () => {
  it('shows a plain value or a reading as one input and falls back for argument maps', () => {
    expect(singleInput(5, 0)).toBe(5);
    const from = { from: { value: VALUE_ID }, add: 1 };
    expect(singleInput(from, 0)).toBe(from);
    expect(singleInput({ code: { from: { input: 'x' } } }, 0)).toBe(0);
    expect(singleInput(undefined, 'x')).toBe('x');
    expect(singleInput(null, 7)).toBeNull();
  });

  it('reads the arguments of an action only from a field map', () => {
    expect(fieldInputs({ a: 1 })).toEqual({ a: 1 });
    expect(fieldInputs(5)).toEqual({});
    expect(fieldInputs({ from: { value: VALUE_ID } })).toEqual({});
    expect(fieldInputs(undefined)).toEqual({});
  });
});
