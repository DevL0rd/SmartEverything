import { describe, expect, it } from 'vitest';
import { NODE_REGISTRY, type NodeKindLookup, type TriggerNode } from '@smarteverything/domain';
import { ARRIVED_KIND_ID, arrivedKind } from '../../../test-support/plugin-kinds';
import { nodeId, rowId, storedAutomationRow } from '../../../test-support/automation-rows';
import { automationsUsing } from './automation-uses';

const GROUP = '7e000000-0000-4000-8000-000000000001';

const TRIGGER: TriggerNode = {
  id: nodeId(1),
  key: 't1',
  kind: ARRIVED_KIND_ID,
  ports: { where: { lit: { group: GROUP } } },
};

const ROWS = [storedAutomationRow({ index: 1, name: 'Welcome', triggers: [TRIGGER], nodes: [] })];

const LOOKUP: NodeKindLookup = {
  get: (id) => (id === ARRIVED_KIND_ID ? arrivedKind() : NODE_REGISTRY.get(id)),
  has: (id) => id === ARRIVED_KIND_ID || NODE_REGISTRY.has(id),
};

describe('automationsUsing with plugin kinds', () => {
  it('finds a group used by a plugin trigger through the plugin kind declaration', () => {
    expect(automationsUsing(ROWS, GROUP, LOOKUP)).toStrictEqual([
      { id: rowId(1), name: 'Welcome', enabled: true },
    ]);
  });

  it('cannot read a plugin input the lookup does not know', () => {
    expect(automationsUsing(ROWS, GROUP, NODE_REGISTRY)).toStrictEqual([]);
  });
});
