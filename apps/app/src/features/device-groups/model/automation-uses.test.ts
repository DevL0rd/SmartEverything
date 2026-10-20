import { describe, expect, it } from 'vitest';
import { rowId, setGroupPower, storedAutomationRow } from '../../../test-support/automation-rows';
import { automationsUsing, referenceIdOf } from './automation-uses';

const GROUP = '7e000000-0000-4000-8000-000000000001';
const OTHER_GROUP = '7e000000-0000-4000-8000-000000000002';
const MISSING = '7e000000-0000-4000-8000-000000000003';

describe('automationsUsing', () => {
  const rows = [
    storedAutomationRow({
      index: 1,
      name: 'Evening',
      triggers: [],
      nodes: [setGroupPower(GROUP, true)],
    }),
    storedAutomationRow({
      index: 2,
      name: 'Other',
      triggers: [],
      nodes: [setGroupPower(OTHER_GROUP, true)],
      enabled: false,
    }),
    { id: rowId(3), name: 'Broken', enabled: true, definition: {} },
  ];

  it('lists the automations that reference the group or room', () => {
    expect(automationsUsing(rows, GROUP)).toStrictEqual([
      { id: rowId(1), name: 'Evening', enabled: true },
    ]);
  });

  it('keeps disabled ones and skips rows that cannot be read', () => {
    expect(automationsUsing(rows, OTHER_GROUP)).toStrictEqual([
      { id: rowId(2), name: 'Other', enabled: false },
    ]);
    expect(automationsUsing(rows, MISSING)).toStrictEqual([]);
  });
});

describe('referenceIdOf', () => {
  it('names the group or room a target points at and nothing for a device list', () => {
    expect(referenceIdOf({ kind: 'group', groupId: GROUP })).toBe(GROUP);
    expect(referenceIdOf({ kind: 'room', roomId: 'r1', families: ['light'] })).toBe('r1');
    expect(referenceIdOf({ kind: 'devices', deviceIds: ['a'] })).toBeNull();
  });
});
