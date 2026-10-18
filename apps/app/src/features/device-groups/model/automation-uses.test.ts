import { describe, expect, it } from 'vitest';
import { AUTOMATION_V2, type AutomationRow } from '@smarteverything/domain';
import { automationsUsing, referenceIdOf } from './automation-uses';

const GROUP = '7e000000-0000-4000-8000-000000000001';
const OTHER_GROUP = '7e000000-0000-4000-8000-000000000002';
const MISSING = '7e000000-0000-4000-8000-000000000003';
const STAMP = '2026-01-01T00:00:00.000Z';

function row(id: string, name: string, enabled: boolean): AutomationRow {
  return {
    id,
    name,
    enabled,
    revision: 1,
    definition: {},
    origin: null,
    author: null,
    last_run_at: null,
    last_error: null,
    run_count: 0,
    created_at: STAMP,
    updated_at: STAMP,
  };
}

const ON_GROUP = AUTOMATION_V2.parse({
  when: [],
  steps: [{ do: 'set', target: { group: GROUP }, control: 'power', to: true }],
});
const ON_OTHER = AUTOMATION_V2.parse({
  when: [],
  steps: [{ do: 'set', target: { group: OTHER_GROUP }, control: 'power', to: true }],
});

describe('automationsUsing', () => {
  const rows = [row('a1', 'Evening', true), row('a2', 'Other', false), row('a3', 'Broken', true)];
  const parse = (candidate: AutomationRow): typeof ON_GROUP | null =>
    candidate.id === 'a1' ? ON_GROUP : candidate.id === 'a2' ? ON_OTHER : null;

  it('lists the automations that reference the group or room', () => {
    expect(automationsUsing(rows, GROUP, parse)).toStrictEqual([
      { id: 'a1', name: 'Evening', enabled: true },
    ]);
  });

  it('skips automations that cannot be read', () => {
    expect(automationsUsing(rows, MISSING, parse)).toStrictEqual([]);
  });
});

describe('referenceIdOf', () => {
  it('names the group or room a target points at and nothing for a device list', () => {
    expect(referenceIdOf({ kind: 'group', groupId: GROUP })).toBe(GROUP);
    expect(referenceIdOf({ kind: 'room', roomId: 'r1', families: ['light'] })).toBe('r1');
    expect(referenceIdOf({ kind: 'devices', deviceIds: ['a'] })).toBeNull();
  });
});
