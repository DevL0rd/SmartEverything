import { describe, expect, it } from 'vitest';
import type { JsonValue, PluginStreamRow } from '@smarteverything/domain';
import {
  flagReading,
  formatNumber,
  listReading,
  numberReading,
  pickStreamValue,
  textReading,
} from './stream-value';

const AT = '2026-10-18T10:00:00.000Z';

function row(value: JsonValue): PluginStreamRow {
  return { plugin_id: 'garden', stream: 'soil', value, at: AT };
}

const WHOLE = { stream: 'soil', field: null } as const;
const FIELD = { stream: 'soil', field: 'wetness' } as const;

describe('pickStreamValue', () => {
  it('says explicitly that there is no reading when the stream has no row', () => {
    expect(pickStreamValue(undefined, WHOLE)).toStrictEqual({
      state: 'missing',
      reason: 'No reading yet.',
    });
  });

  it('takes the whole value when no field is declared', () => {
    expect(pickStreamValue(row(42), WHOLE)).toStrictEqual({ state: 'ready', value: 42, at: AT });
  });

  it('takes the declared field of an object value', () => {
    expect(pickStreamValue(row({ wetness: 61, other: 1 }), FIELD)).toStrictEqual({
      state: 'ready',
      value: 61,
      at: AT,
    });
  });

  it('follows a dotted path through nested objects', () => {
    const nested = { summary: { peersOnline: 3 } };
    expect(
      pickStreamValue(row(nested), { stream: 'soil', field: 'summary.peersOnline' }),
    ).toStrictEqual({
      state: 'ready',
      value: 3,
      at: AT,
    });
    expect(pickStreamValue(row(nested), { stream: 'soil', field: 'summary.gone' })).toStrictEqual({
      state: 'missing',
      reason: 'The reading has no summary.gone.',
    });
    expect(pickStreamValue(row({ summary: 4 }), { stream: 'soil', field: 'summary.x' }).state).toBe(
      'missing',
    );
  });

  it('names the field when the reading lacks it or is not an object', () => {
    const missing = { state: 'missing', reason: 'The reading has no wetness.' };
    expect(pickStreamValue(row({ other: 1 }), FIELD)).toStrictEqual(missing);
    expect(pickStreamValue(row(5), FIELD)).toStrictEqual(missing);
    expect(pickStreamValue(row([1]), FIELD)).toStrictEqual(missing);
    expect(pickStreamValue(row(null), FIELD)).toStrictEqual(missing);
  });

  it('keeps a null field value as ready so a plugin can say it has nothing', () => {
    expect(pickStreamValue(row({ wetness: null }), FIELD)).toStrictEqual({
      state: 'ready',
      value: null,
      at: AT,
    });
  });
});

describe('the typed readings', () => {
  it('reads a finite number and refuses anything else with a reason', () => {
    expect(numberReading(pickStreamValue(row(3.5), WHOLE))).toStrictEqual({
      state: 'ready',
      value: 3.5,
      at: AT,
    });
    expect(numberReading(pickStreamValue(row('3'), WHOLE))).toStrictEqual({
      state: 'missing',
      reason: 'The reading is not a number.',
    });
    expect(numberReading(pickStreamValue(undefined, WHOLE)).state).toBe('missing');
  });

  it('shows text, numbers and flags as plain text and refuses structures', () => {
    expect(textReading(pickStreamValue(row('<b>Dry</b>'), WHOLE))).toStrictEqual({
      state: 'ready',
      text: '<b>Dry</b>',
      at: AT,
    });
    expect(textReading(pickStreamValue(row(12.3456), WHOLE))).toMatchObject({ text: '12.35' });
    expect(textReading(pickStreamValue(row(true), WHOLE))).toMatchObject({ text: 'Yes' });
    expect(textReading(pickStreamValue(row({ a: 1 }), WHOLE)).state).toBe('missing');
  });

  it('reads an on or off flag only from a boolean', () => {
    expect(flagReading(pickStreamValue(row(false), WHOLE))).toStrictEqual({
      state: 'ready',
      on: false,
      at: AT,
    });
    expect(flagReading(pickStreamValue(row(1), WHOLE))).toStrictEqual({
      state: 'missing',
      reason: 'The reading is not on or off.',
    });
  });

  it('rounds numbers to two places', () => {
    expect(formatNumber(1.005)).toBe('1');
    expect(formatNumber(61)).toBe('61');
    expect(formatNumber(0.126)).toBe('0.13');
  });
});

describe('listReading', () => {
  it('lists plain values and titled objects up to the limit and counts the rest', () => {
    const reading = listReading(
      pickStreamValue(row(['a', 2, { title: 'C', detail: 'late' }, { title: 'D' }]), WHOLE),
      3,
    );
    expect(reading).toStrictEqual({
      state: 'ready',
      total: 4,
      items: [
        { key: '0', title: 'a', detail: null },
        { key: '1', title: '2', detail: null },
        { key: '2', title: 'C', detail: 'late' },
      ],
    });
  });

  it('refuses a value that is not a list and a list with an untitled item', () => {
    expect(listReading(pickStreamValue(row('x'), WHOLE), 3)).toStrictEqual({
      state: 'missing',
      reason: 'The reading is not a list.',
    });
    expect(listReading(pickStreamValue(row([{ name: 'x' }]), WHOLE), 3)).toStrictEqual({
      state: 'missing',
      reason: 'The list has items without a title.',
    });
  });

  it('passes a missing stream on', () => {
    expect(listReading(pickStreamValue(undefined, WHOLE), 3).state).toBe('missing');
  });
});
