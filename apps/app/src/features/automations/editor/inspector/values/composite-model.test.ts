import { describe, expect, it } from 'vitest';
import type { JsonValue, SignalTest } from '@smarteverything/domain';
import { AI_SHAPE, SIGNAL_TEST } from '@smarteverything/domain';
import {
  ANY_STATE,
  NAME_MISSING,
  NAME_NOT_IDENT,
  NAME_TAKEN,
  addedEntry,
  addedTransition,
  cellKindOf,
  conditionOf,
  isCompositeEditor,
  lookupRowsOf,
  nameProblem,
  operatorsFor,
  renamedEntry,
  renamedState,
  specStart,
  stateChoices,
  stateProblem,
  tableOf,
  transitionsOf,
  transitionsValue,
  valueKindOfSpec,
  withAdded,
  withBound,
  withCell,
  withColumnKind,
  withListed,
  withOperator,
  withSingle,
  withTransition,
  withoutEntry,
} from './composite-model';

function stored(test: JsonValue): JsonValue {
  const parsed = conditionOf(test);
  if (parsed === null) throw new Error('not a stored test');
  return parsed;
}

describe('condition builder', () => {
  it('reads every stored test shape back unchanged', () => {
    const shapes: readonly JsonValue[] = [
      { is: 'changed' },
      { is: 'eq', to: 'on' },
      { is: 'ne', to: true },
      { is: 'gt', to: 20 },
      { is: 'lte', to: 5 },
      { is: 'between', min: 18, max: 24 },
      { is: 'in', to: ['heat', 'cool'] },
    ];
    for (const shape of shapes) expect(stored(shape)).toEqual(shape);
  });

  it('treats a missing or broken test as not picked yet', () => {
    expect(conditionOf(undefined)).toBeNull();
    expect(conditionOf({})).toBeNull();
    expect(conditionOf({ is: 'gt', to: 'warm' })).toBeNull();
  });

  it('keeps the value when the operator changes and every result is accepted by the hub', () => {
    const steps = [
      withOperator(null, 'eq', 21),
      withOperator({ is: 'eq', to: 21 }, 'gt', 0),
      withOperator({ is: 'gt', to: 21 }, 'between', 0),
      withOperator({ is: 'between', min: 21, max: 21 }, 'in', 0),
      withOperator({ is: 'in', to: [21] }, 'changed', 0),
    ];
    expect(steps).toEqual([
      { is: 'eq', to: 21 },
      { is: 'gt', to: 21 },
      { is: 'between', min: 21, max: 21 },
      { is: 'in', to: [21] },
      { is: 'changed' },
    ]);
    for (const step of steps) expect(SIGNAL_TEST.safeParse(step).success).toBe(true);
  });

  it('falls back to the typed start when a comparison needs a number', () => {
    expect(withOperator({ is: 'eq', to: 'on' }, 'gte', 10)).toEqual({ is: 'gte', to: 10 });
  });

  it('keeps between bounds in order', () => {
    const range = { is: 'between', min: 10, max: 20 } as const;
    expect(withBound(range, 'min', 30)).toEqual({ is: 'between', min: 30, max: 30 });
    expect(withBound(range, 'max', 5)).toEqual({ is: 'between', min: 5, max: 5 });
  });

  it('edits the one-of list and never empties it', () => {
    const listed: Extract<SignalTest, { is: 'in' }> = { is: 'in', to: ['heat'] };
    const two = withAdded(listed, 'cool');
    expect(two).toEqual({ is: 'in', to: ['heat', 'cool'] });
    if (two.is !== 'in') throw new Error('expected a list');
    expect(withListed(two, 0, null)).toEqual({ is: 'in', to: ['cool'] });
    expect(withListed(two, 1, 'dry')).toEqual({ is: 'in', to: ['heat', 'dry'] });
    expect(withListed(listed, 0, null)).toBe(listed);
  });

  it('refuses a text value for a number comparison', () => {
    expect(withSingle({ is: 'gt', to: 1 }, 'warm')).toBeNull();
    expect(withSingle({ is: 'eq', to: 1 }, 'warm')).toEqual({ is: 'eq', to: 'warm' });
  });

  it('offers operators that fit the picked control', () => {
    const ids = (kind: Parameters<typeof operatorsFor>[0]): readonly string[] =>
      operatorsFor(kind).map((operator) => operator.value);
    expect(ids('choice')).toEqual(['changed', 'eq', 'ne', 'in']);
    expect(ids('fixed')).toEqual(['changed', 'eq', 'ne']);
    expect(ids('number')).toContain('between');
    expect(valueKindOfSpec({ t: 'switch', on: 'On', off: 'Off' })).toBe('fixed');
    expect(valueKindOfSpec(null)).toBe('plain');
    expect(specStart({ t: 'number', min: 16, max: 30, step: 1, unit: 'C', kelvin: false })).toBe(
      16,
    );
    expect(specStart({ t: 'choice', options: [{ id: 'heat', label: 'Heat' }] })).toBe('heat');
  });
});

describe('key and value rows', () => {
  it('adds, renames in place and removes rows of the stored record', () => {
    const added = addedEntry({ accept: 'json' }, 'name', '');
    expect(added).toEqual({ accept: 'json', name1: '' });
    const renamed = renamedEntry(added, 'name1', 'lang');
    expect(Object.keys(renamed)).toEqual(['accept', 'lang']);
    expect(withoutEntry(renamed, 'accept')).toEqual({ lang: '' });
    expect(renamedEntry(renamed, 'lang', 'accept')).toBe(renamed);
  });

  it('checks names, with identifier rules for AI answer fields', () => {
    expect(nameProblem(['a'], 'a', '', 'any')).toBe(NAME_MISSING);
    expect(nameProblem(['a', 'b'], 'a', 'b', 'any')).toBe(NAME_TAKEN);
    expect(nameProblem(['a'], 'a', 'Content-Type', 'any')).toBeUndefined();
    expect(nameProblem([], '', 'Room name', 'ident')).toBe(NAME_NOT_IDENT);
    expect(nameProblem([], '', 'roomName', 'ident')).toBeUndefined();
  });

  it('builds an AI answer shape the hub accepts', () => {
    const shape = addedEntry(addedEntry({}, 'field', 'text'), 'field', 'number');
    expect(shape).toEqual({ field1: 'text', field2: 'number' });
    expect(AI_SHAPE.safeParse(shape).success).toBe(true);
  });

  it('recognises the structured editors it renders', () => {
    expect(isCompositeEditor('condition')).toBe(true);
    expect(isCompositeEditor('lookup-table')).toBe(true);
    expect(isCompositeEditor('week-grid')).toBe(false);
  });
});

describe('lookup table', () => {
  const table: JsonValue = [
    { key: 'home', value: 21 },
    { key: 'away', value: 16 },
  ];

  it('round-trips the stored rows exactly', () => {
    expect(tableOf(lookupRowsOf(table))).toEqual(table);
  });

  it('edits one cell and converts a whole column to another type', () => {
    const rows = withCell(lookupRowsOf(table), 1, 'value', 15);
    expect(tableOf(rows)).toEqual([
      { key: 'home', value: 21 },
      { key: 'away', value: 15 },
    ]);
    expect(tableOf(withColumnKind(rows, 'value', 'text'))).toEqual([
      { key: 'home', value: '21' },
      { key: 'away', value: '15' },
    ]);
  });

  it('names the column type, or mixed when rows differ', () => {
    expect(cellKindOf(['a', 'b'])).toBe('text');
    expect(cellKindOf([1, 'b'])).toBe('mixed');
    expect(cellKindOf([])).toBe('text');
    expect(cellKindOf([true])).toBe('flag');
  });
});

describe('state machine lists', () => {
  it('renames and checks states', () => {
    expect(renamedState(['home', 'away'], 1, 'night')).toEqual(['home', 'night']);
    expect(renamedState(['home', 'away'], 1, 'home')).toEqual(['home', 'away']);
    expect(stateProblem(['home', 'away'], 1, 'home')).toBe(NAME_TAKEN);
    expect(stateProblem(['home'], 0, ANY_STATE)).toBeDefined();
  });

  it('offers the states as choices, any state only for from, and flags a missing one', () => {
    expect(stateChoices(['home', 'away'], 'home', false).map((row) => row.value)).toEqual([
      'home',
      'away',
    ]);
    const from = stateChoices(['home'], 'gone', true);
    expect(from.map((row) => row.value)).toEqual([ANY_STATE, 'home', 'gone']);
  });

  it('round-trips transitions and keeps the guard', () => {
    const stored: JsonValue = [
      { from: '*', event: 'leave', to: 'away', guard: true },
      { from: 'away', event: 'arrive', to: 'home' },
    ];
    const rows = transitionsOf(stored);
    expect(transitionsValue(rows)).toEqual(stored);
    const changed = withTransition(rows, 1, { to: 'night' });
    expect(transitionsValue(changed)).toEqual([
      { from: '*', event: 'leave', to: 'away', guard: true },
      { from: 'away', event: 'arrive', to: 'night' },
    ]);
    expect(withTransition(rows, 0, null)).toHaveLength(1);
    expect(addedTransition([], ['home'])).toEqual([
      { from: ANY_STATE, event: '', to: 'home', rest: {} },
    ]);
  });
});
