import { describe, expect, it } from 'vitest';
import {
  EMPTY_DRAFT,
  changeDraft,
  definitionOf,
  moved,
  readDraft,
  uniqueName,
  type Draft,
} from './editor-state';
import { LAMP } from './test-devices';

const ON = { type: 'command', deviceId: LAMP, capability: 'power', value: true } as const;
const WAIT = { type: 'delay', seconds: 5 } as const;
const NOTE = { type: 'notify', message: 'Hi' } as const;

function apply(...changes: Parameters<typeof changeDraft>[1][]): Draft {
  return changes.reduce(changeDraft, EMPTY_DRAFT);
}

describe('the automation draft', () => {
  it('renames, pauses and switches between all and any', () => {
    const draft = apply(
      { type: 'rename', name: 'Bedtime' },
      { type: 'enable', enabled: false },
      { type: 'mode', mode: 'any' },
    );
    expect(draft).toMatchObject({ name: 'Bedtime', enabled: false, mode: 'any' });
  });

  it('adds, replaces and removes triggers', () => {
    const draft = apply(
      { type: 'triggers', change: { kind: 'add', item: { type: 'interval', everyMinutes: 5 } } },
      {
        type: 'triggers',
        change: { kind: 'add', item: { type: 'sun', event: 'sunset', offsetMinutes: 0 } },
      },
      {
        type: 'triggers',
        change: { kind: 'set', index: 0, item: { type: 'interval', everyMinutes: 10 } },
      },
      { type: 'triggers', change: { kind: 'remove', index: 1 } },
    );
    expect(draft.triggers).toEqual([{ type: 'interval', everyMinutes: 10 }]);
  });

  it('adds, replaces and removes conditions', () => {
    const draft = apply(
      { type: 'conditions', change: { kind: 'add', item: { type: 'weekday', weekdays: [1] } } },
      { type: 'conditions', change: { kind: 'add', item: { type: 'weekday', weekdays: [2] } } },
      {
        type: 'conditions',
        change: { kind: 'set', index: 1, item: { type: 'weekday', weekdays: [3] } },
      },
      { type: 'conditions', change: { kind: 'remove', index: 0 } },
    );
    expect(draft.conditions).toEqual([{ type: 'weekday', weekdays: [3] }]);
  });

  it('adds, replaces, reorders and removes actions', () => {
    const draft = apply(
      { type: 'actions', change: { kind: 'add', item: ON } },
      { type: 'actions', change: { kind: 'add', item: WAIT } },
      { type: 'actions', change: { kind: 'add', item: NOTE } },
      { type: 'actions', change: { kind: 'move', index: 2, by: -1 } },
      { type: 'actions', change: { kind: 'set', index: 0, item: { ...ON, value: false } } },
      { type: 'actions', change: { kind: 'remove', index: 2 } },
    );
    expect(draft.actions).toEqual([{ ...ON, value: false }, NOTE]);
  });

  it('leaves the list alone when an item would move past either end', () => {
    expect(moved(['a', 'b'], 0, -1)).toEqual(['a', 'b']);
    expect(moved(['a', 'b'], 1, 1)).toEqual(['a', 'b']);
    expect(moved(['a', 'b', 'c'], 0, 1)).toEqual(['b', 'a', 'c']);
  });

  it('reads a stored definition back into a draft and writes it out again', () => {
    const definition = {
      triggers: [{ type: 'time', at: '07:00', weekdays: [1, 2] }],
      conditions: { mode: 'any', items: [{ type: 'weekday', weekdays: [1] }] },
      actions: [ON],
    };
    const read = readDraft({ name: 'Morning', enabled: true, definition });
    expect(read.readable).toBe(true);
    if (read.readable) {
      expect(read.draft).toMatchObject({ name: 'Morning', mode: 'any' });
      expect(definitionOf(read.draft)).toEqual(definition);
    }
  });

  it('explains why a stored definition cannot be read', () => {
    const read = readDraft({ name: 'Broken', enabled: true, definition: { triggers: 'x' } });
    expect(read.readable).toBe(false);
    if (!read.readable) {
      expect(read.problem).toMatch(/^The saved definition of Broken cannot be read: triggers /);
    }
  });

  it('finds a copy name nobody uses yet', () => {
    expect(uniqueName('Bedtime', ['Bedtime'])).toBe('Bedtime copy');
    expect(uniqueName('Bedtime', ['bedtime copy', 'Bedtime copy 2'])).toBe('Bedtime copy 3');
    expect(uniqueName('x'.repeat(90), []).length).toBe(71);
  });
});
