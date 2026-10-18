import { describe, expect, it } from 'vitest';
import {
  EMPTY_DRAFT,
  changeDraft,
  moved,
  readDraft,
  sameDraft,
  uniqueName,
  type Draft,
} from './editor-state';
import { LAMP } from './test-devices';

const TRIGGER_ID = '00000000-0000-4000-8000-000000000101';
const STEP_ID = '00000000-0000-4000-8000-000000000102';

const ON = { do: 'set', target: { device: LAMP }, control: 'power', to: true } as const;
const WAIT = { do: 'wait', ms: 5000 } as const;
const NOTE = { do: 'notify', message: 'Hi' } as const;

function apply(...changes: Parameters<typeof changeDraft>[1][]): Draft {
  return changes.reduce(changeDraft, EMPTY_DRAFT);
}

describe('the automation draft', () => {
  it('renames and pauses without touching the program', () => {
    const draft = apply({ type: 'rename', name: 'Bedtime' }, { type: 'enable', enabled: false });
    expect(draft).toMatchObject({ name: 'Bedtime', enabled: false });
    expect(draft.automation).toEqual(EMPTY_DRAFT.automation);
  });

  it('adds, replaces and removes triggers', () => {
    const draft = apply(
      { type: 'when', change: { kind: 'add', item: { on: 'every', minutes: 5 } } },
      { type: 'when', change: { kind: 'add', item: { on: 'sun', event: 'sunset' } } },
      { type: 'when', change: { kind: 'set', index: 0, item: { on: 'every', minutes: 10 } } },
      { type: 'when', change: { kind: 'remove', index: 1 } },
    );
    expect(draft.automation.when).toEqual([{ on: 'every', minutes: 10 }]);
  });

  it('sets and clears the one condition group', () => {
    const condition = { all: [{ time: { days: [1] } }] };
    const set = apply({ type: 'only-if', condition });
    expect(set.automation.onlyIf).toEqual(condition);
    const cleared = changeDraft(set, { type: 'only-if', condition: undefined });
    expect('onlyIf' in cleared.automation).toBe(false);
  });

  it('replaces the steps and reorders a list', () => {
    const draft = apply({ type: 'steps', steps: [ON, WAIT, NOTE] });
    expect(draft.automation.steps).toEqual([ON, WAIT, NOTE]);
    expect(moved(draft.automation.steps, 2, -1)).toEqual([ON, NOTE, WAIT]);
  });

  it('stores the run behaviour only when it differs from the default', () => {
    const queued = apply({ type: 'run', run: { mode: 'queue', max: 3, key: 'lights' } });
    expect(queued.automation).toMatchObject({ mode: 'queue', max: 3, key: 'lights' });
    const plain = changeDraft(queued, {
      type: 'run',
      run: { mode: undefined, max: undefined, key: undefined },
    });
    expect(
      'mode' in plain.automation || 'max' in plain.automation || 'key' in plain.automation,
    ).toBe(false);
  });

  it('declares inputs for reusable steps', () => {
    const draft = apply({ type: 'inputs', inputs: [{ name: 'level', type: 'number' }] });
    expect(draft.automation.inputs).toEqual([{ name: 'level', type: 'number' }]);
  });

  it('leaves the list alone when an item would move past either end', () => {
    expect(moved(['a', 'b'], 0, -1)).toEqual(['a', 'b']);
    expect(moved(['a', 'b'], 1, 1)).toEqual(['a', 'b']);
    expect(moved(['a', 'b', 'c'], 0, 1)).toEqual(['b', 'a', 'c']);
  });

  it('reads a stored definition straight into a draft with nothing lost', () => {
    const definition = {
      when: [{ on: 'time', id: TRIGGER_ID, at: '07:00', days: [1, 2] }],
      onlyIf: { any: [{ time: { days: [1] } }, { daylight: 'night' }] },
      steps: [{ do: 'set', id: STEP_ID, target: { device: LAMP }, control: 'power', to: true }],
      mode: 'single',
    };
    const read = readDraft({ name: 'Morning', enabled: true, definition });
    expect(read.readable).toBe(true);
    if (read.readable) expect(read.draft.automation).toEqual(definition);
  });

  it('explains why a stored definition cannot be read', () => {
    const read = readDraft({ name: 'Broken', enabled: true, definition: { when: 'x' } });
    expect(read.readable).toBe(false);
    if (!read.readable)
      expect(read.problem).toMatch(/^The saved definition of Broken cannot be read: when /);
  });

  it('compares drafts by what they would save', () => {
    const draft = apply({ type: 'rename', name: 'A' });
    expect(sameDraft(draft, { ...draft })).toBe(true);
    expect(sameDraft(draft, apply({ type: 'rename', name: 'B' }))).toBe(false);
  });

  it('finds a copy name nobody uses yet', () => {
    expect(uniqueName('Bedtime', ['Bedtime'])).toBe('Bedtime copy');
    expect(uniqueName('Bedtime', ['bedtime copy', 'Bedtime copy 2'])).toBe('Bedtime copy 3');
    expect(uniqueName('x'.repeat(90), []).length).toBe(71);
  });
});
