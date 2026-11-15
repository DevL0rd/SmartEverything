import { describe, expect, it } from 'vitest';
import { AUTOMATION_ROW } from '../src/automation-v3/rows';
import { liveFrameOf, mergedColumns } from '../src/api/live-diff';
import { LIVE_ROW_KEYS, liveColumnsOf } from '../src/api/live-frames';
import { LIVE_FRAME, LIVE_TABLES, LIVE_WIRE_MESSAGE, type RowChange } from '../src/api/live';

const ID = '00000000-0000-4000-8000-000000000001';
const PROFILE = '00000000-0000-4000-8000-000000000002';
const AT = '2026-10-08T07:00:00Z';
const LATER = '2026-10-08T08:00:00Z';

const automation = AUTOMATION_ROW.parse({
  id: ID,
  name: 'Porch light',
  enabled: true,
  revision: 3,
  definition: {
    version: 4,
    kind: 'automation',
    triggers: [],
    inputs: [],
    outputs: [],
    variables: [],
    nodes: [{ id: '00000000-0000-4000-8000-0000000000f1', key: 'start', kind: 'flow.start' }],
    policy: { mode: 'single' },
  },
  draft: null,
  layout: { nodes: {}, frames: [], comments: [] },
  origin: null,
  author: { via: 'person', profile_id: PROFILE },
  last_run_at: AT,
  last_error: null,
  run_count: 5,
  created_at: AT,
  updated_at: AT,
});

const ran = { ...automation, last_run_at: LATER, run_count: 6 };

const counterBump: RowChange = {
  type: 'change',
  table: 'automations',
  operation: 'UPDATE',
  record: ran,
  oldRecord: automation,
};

describe('live UPDATE frames', () => {
  it('carry only the columns that changed when an automation run bumps its counter', () => {
    const frame = liveFrameOf(counterBump);
    expect(frame).toStrictEqual({
      type: 'change',
      table: 'automations',
      operation: 'UPDATE',
      key: { id: ID },
      set: { last_run_at: LATER, run_count: 6 },
      previous: { last_run_at: AT, run_count: 5 },
    });
    expect(LIVE_FRAME.parse(JSON.parse(JSON.stringify(frame)))).toStrictEqual(frame);
  });

  it('cost a small part of the full record and old record they replace', () => {
    const full = JSON.stringify(counterBump).length;
    const framed = JSON.stringify(liveFrameOf(counterBump)).length;
    expect(framed * 4).toBeLessThan(full);
  });

  it('name a column that became absent in cleared and merge back to the new row', () => {
    const before = { id: ID, revision: 2, name: 'Home', updatedAt: '2026-11-15T00:00:00Z', isDefault: true };
    const after = { id: ID, revision: 3, name: 'Home', updatedAt: '2026-11-15T00:00:00Z' };
    const frame = liveFrameOf({
      type: 'change',
      table: 'home_maps',
      operation: 'UPDATE',
      record: { ...after, floors: 1, position: 0 },
      oldRecord: { ...before, floors: 1, position: 0 },
    });
    expect(frame).toMatchObject({
      key: { id: ID },
      set: { revision: 3 },
      previous: { revision: 2, isDefault: true },
      cleared: ['isDefault'],
    });
    if (frame.operation !== 'UPDATE') throw new Error('expected an UPDATE frame');
    expect(mergedColumns(before, frame.set, frame.cleared)).toStrictEqual(after);
  });

  it('keep the whole row for INSERT and the key and old row for DELETE', () => {
    expect(liveFrameOf({ ...counterBump, operation: 'INSERT', oldRecord: null })).toStrictEqual({
      type: 'change',
      table: 'automations',
      operation: 'INSERT',
      record: ran,
    });
    expect(liveFrameOf({ ...counterBump, operation: 'DELETE', record: null })).toStrictEqual({
      type: 'change',
      table: 'automations',
      operation: 'DELETE',
      key: { id: ID },
      oldRecord: automation,
    });
  });

  it('refuse a frame that names a column the table lacks or a wrong key', () => {
    const frame = { ...liveFrameOf(counterBump), seq: 4 };
    expect(LIVE_WIRE_MESSAGE.safeParse(frame).success).toBe(true);
    expect(LIVE_WIRE_MESSAGE.safeParse({ ...frame, set: { nonsense: 1 } }).success).toBe(false);
    expect(LIVE_WIRE_MESSAGE.safeParse({ ...frame, key: { name: 'x' } }).success).toBe(false);
  });

  it.each(LIVE_TABLES)('key %s by columns the row has', (table) => {
    const columns = liveColumnsOf(table);
    for (const key of LIVE_ROW_KEYS[table]) expect(columns).toContain(key);
  });
});
