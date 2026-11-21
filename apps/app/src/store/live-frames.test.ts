import {
  AUTOMATION_ROW,
  LIVE_WIRE_CHANGE,
  type LiveChange,
  type LiveWireChange,
} from '@smarteverything/domain';
import { describe, expect, it, vi } from 'vitest';
import { EntityStore } from './entity-store';
import { applyLiveChange } from './live-frames';
import { UnreadableChangeError } from './live-reducers';
import { emptyState, type StoreState } from './state';

const ID = '00000000-0000-4000-8000-000000000001';
const PROFILE = '00000000-0000-4000-8000-000000000002';
const DEVICE = '00000000-0000-4000-8000-000000000003';
const AT = '2026-11-14T07:00:00.000Z';
const LATER = '2026-11-14T08:00:00.000Z';

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

function frame(value: unknown): LiveWireChange {
  return LIVE_WIRE_CHANGE.parse(value);
}

const inserted = frame({
  type: 'change',
  table: 'automations',
  operation: 'INSERT',
  record: automation,
  seq: 1,
});

const ran = frame({
  type: 'change',
  table: 'automations',
  operation: 'UPDATE',
  key: { id: ID },
  set: { last_run_at: LATER, run_count: 6 },
  seq: 2,
});

function applied(
  frames: readonly LiveWireChange[],
  from: StoreState = emptyState(),
): {
  readonly state: StoreState;
  readonly resolved: readonly LiveChange[];
} {
  const resolved: LiveChange[] = [];
  const state = frames.reduce((current, next) => applyLiveChange(current, next, resolved), from);
  return { state, resolved };
}

describe('column-scoped live UPDATE frames in the store', () => {
  it('merge the changed columns into the held automation and keep every other column', () => {
    const { state, resolved } = applied([inserted, ran]);
    expect(state.tables.automations.byId[ID]).toStrictEqual({
      ...automation,
      last_run_at: LATER,
      run_count: 6,
    });
    expect(resolved[1]).toMatchObject({
      operation: 'UPDATE',
      record: { run_count: 6, definition: automation.definition },
      oldRecord: { run_count: 5 },
      seq: 2,
    });
  });

  it('leave the store untouched for a row it does not hold', () => {
    const before = emptyState();
    const { state, resolved } = applied([ran], before);
    expect(state).toBe(before);
    expect(resolved).toStrictEqual([]);
  });

  it('keep the tables and their rows for an UPDATE that changed nothing', () => {
    vi.stubGlobal('requestAnimationFrame', (): number => 0);
    const store = new EntityStore();
    store.apply([inserted]);
    let woken = 0;
    store.subscribe(() => {
      woken += 1;
    });
    const tables = store.get().tables;
    store.apply([
      frame({
        type: 'change',
        table: 'automations',
        operation: 'UPDATE',
        key: { id: ID },
        set: {},
        seq: 3,
      }),
    ]);
    expect(store.get().tables).toBe(tables);
    expect(woken).toBe(1);
  });

  it('merge a device value whose only change is the observed time', () => {
    const value = frame({
      type: 'change',
      table: 'device_state',
      operation: 'INSERT',
      record: { device_id: DEVICE, capability: 'power', value: true, observed_at: AT },
      seq: 1,
    });
    const observed = frame({
      type: 'change',
      table: 'device_state',
      operation: 'UPDATE',
      key: { device_id: DEVICE, capability: 'power' },
      set: { observed_at: LATER },
      seq: 2,
    });
    const { state } = applied([value, observed]);
    expect(state.deviceValues.get(DEVICE)?.['power']).toStrictEqual({
      value: true,
      observedAt: LATER,
    });
  });

  it('move a row whose key column changed', () => {
    const moved = frame({
      type: 'change',
      table: 'automations',
      operation: 'UPDATE',
      key: { id: ID },
      set: { id: PROFILE },
      seq: 2,
    });
    const { state } = applied([inserted, moved]);
    expect(state.tables.automations.ids).toStrictEqual([PROFILE]);
  });

  it('refuse a merge that does not read back as a valid row', () => {
    const broken = frame({
      type: 'change',
      table: 'automations',
      operation: 'UPDATE',
      key: { id: ID },
      set: { run_count: 'many' },
      seq: 2,
    });
    expect(() => applied([inserted, broken])).toThrow(UnreadableChangeError);
  });
});
