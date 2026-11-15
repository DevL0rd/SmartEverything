import { PLANNER_ITEM_ROW, type PlannerItemRow } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { itemMenuOf } from './item-menu';
import {
  OUTDENT_CHANGE,
  canBecomeStep,
  indentChangeOf,
  movedKeyOf,
  nestTargetOf,
  stepMoveOf,
} from './steps-model';

const STAMP = '2026-11-01T08:00:00.000Z';
const PROFILE = 'a1b2c3d4-0000-4000-8000-0000000000a1';
const LIST = 'a1b2c3d4-0000-4000-8000-0000000000c1';

let next = 0;

function id(): string {
  next += 1;
  return `a1b2c3d4-0000-4000-8000-${String(next).padStart(12, '0')}`;
}

function task(title: string, extra: Partial<PlannerItemRow> = {}): PlannerItemRow {
  return PLANNER_ITEM_ROW.parse({
    id: id(),
    profile_id: PROFILE,
    collection_id: LIST,
    kind: 'task',
    parent_id: null,
    title,
    notes: '',
    location: null,
    priority: null,
    tags: [],
    estimate_minutes: null,
    start_local: null,
    end_local: null,
    time_zone: null,
    all_day: false,
    due_date: null,
    due_at: null,
    rrule: null,
    exdates: [],
    series_id: null,
    original_start: null,
    start: null,
    end: null,
    series_end: null,
    status: 'open',
    position: 0,
    completion: { kind: 'manual' },
    attachments: [],
    reminders: [],
    google: null,
    assignee_id: null,
    ical_uid: null,
    ical_sequence: 0,
    booking_page_id: null,
    created_by: 'person',
    created_at: STAMP,
    updated_at: STAMP,
    deleted_at: null,
    ...extra,
  });
}

describe('stepMoveOf', () => {
  const steps = [
    { id: 'a', position: 1 },
    { id: 'b', position: 2 },
    { id: 'c', position: 3 },
  ];

  it('finds the one step a drag moved', () => {
    expect(movedKeyOf(['a', 'b', 'c'], ['b', 'c', 'a'])).toBe('a');
    expect(movedKeyOf(['a', 'b', 'c'], ['c', 'a', 'b'])).toBe('c');
    expect(movedKeyOf(['a', 'b', 'c'], ['a', 'b', 'c'])).toBeNull();
  });

  it('places a moved step between its new neighbours', () => {
    expect(stepMoveOf(steps, ['a', 'c', 'b'])).toEqual({ itemId: 'c', position: 1.5 });
  });

  it('places a step moved to the top above the first and to the end after the last', () => {
    expect(stepMoveOf(steps, ['c', 'a', 'b'])).toEqual({ itemId: 'c', position: 0 });
    expect(stepMoveOf(steps, ['b', 'c', 'a'])).toEqual({ itemId: 'a', position: 4 });
  });

  it('moves nothing when the order is the same', () => {
    expect(stepMoveOf(steps, ['a', 'b', 'c'])).toBeNull();
  });
});

describe('indent and outdent', () => {
  const above = task('File the tax return');

  it('nests a plain task under the task above it in the same list', () => {
    const item = task('Gather receipts');
    expect(nestTargetOf(item, above, false)).toEqual({ id: above.id, title: above.title });
    expect(indentChangeOf(above.id)).toEqual({ parent_id: above.id });
  });

  it('keeps tasks with steps, repeating tasks and first rows where they are', () => {
    expect(nestTargetOf(task('Has steps'), above, true)).toBeNull();
    expect(canBecomeStep({ ...task('Weekly'), rrule: 'FREQ=WEEKLY' }, false)).toBe(false);
    expect(nestTargetOf(task('First'), null, false)).toBeNull();
    expect(
      nestTargetOf(task('Step'), task('Step above', { parent_id: above.id }), false),
    ).toBeNull();
    expect(
      nestTargetOf(task('Other list'), task('Above', { collection_id: id() }), false),
    ).toBeNull();
  });

  it('offers the nesting choices in the item menu', () => {
    const item = task('Gather receipts');
    const nest = nestTargetOf(item, above, false);
    const menu = itemMenuOf({ item, occurrenceKey: null, offline: false, nest });
    expect(menu.items.find((entry) => entry.id === 'indent')?.action).toEqual({
      kind: 'indent',
      parentId: above.id,
    });
    const step = task('Submit', { parent_id: above.id });
    const stepMenu = itemMenuOf({ item: step, occurrenceKey: null, offline: true });
    const outdent = stepMenu.items.find((entry) => entry.id === 'outdent');
    expect(outdent?.action).toEqual({ kind: 'outdent' });
    expect(outdent?.disabled).toBe(true);
    expect(OUTDENT_CHANGE).toEqual({ parent_id: null });
  });
});
