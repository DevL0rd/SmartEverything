import { describe, expect, it } from 'vitest';
import {
  ALL_NODE_KINDS,
  EMPTY_LAYOUT,
  type AutomationFunctionSummary,
  type AutomationV3,
} from '@smarteverything/domain';
import { catalogOf, searchCatalog } from './catalog-view';
import { fixedAutomationRows, listOf, parseAutomationRows } from './automation-rows';
import { automationKeys } from './keys';

const ID_A = '00000000-0000-4000-8000-00000000000a';
const ID_B = '00000000-0000-4000-8000-00000000000b';
const MOMENT = '2026-10-18T10:00:00+07:00';

const program: AutomationV3 = {
  version: 3,
  kind: 'automation',
  triggers: [],
  inputs: [],
  outputs: [],
  variables: [],
  body: { nodes: [] },
  policy: { mode: 'single' },
};

function row(id: string, name: string): unknown {
  return {
    id,
    name,
    enabled: true,
    revision: 1,
    definition: program,
    draft: null,
    layout: EMPTY_LAYOUT,
    origin: null,
    author: { via: 'person', profile_id: ID_A },
    last_run_at: null,
    last_error: null,
    run_count: 0,
    created_at: MOMENT,
    updated_at: MOMENT,
  };
}

const fn: AutomationFunctionSummary = {
  id: ID_A,
  name: 'Bedtime lights',
  description: 'Dims every light in a room',
  category: 'lighting',
  icon: null,
  builtin: false,
  editable: true,
  revision: 1,
  interface: { flavour: 'action', inputs: [], outputs: [], exits: ['done'] },
  interfaceHash: 'a'.repeat(64),
  users: 2,
  createdBy: null,
  updatedAt: null,
};

describe('automation rows', () => {
  it('keeps valid rows, counts the ones the contract refuses and sorts by name', () => {
    const parsed = parseAutomationRows([row(ID_B, 'Zebra'), { id: 'x' }, row(ID_A, 'alpha')]);
    expect(parsed.rejected).toBe(1);
    const list = listOf(parsed);
    expect(list.rows.map((entry) => entry.name)).toEqual(['alpha', 'Zebra']);
    expect(list.byId.get(ID_B)?.name).toBe('Zebra');
  });

  it('gives a fixed source the same snapshot every time', () => {
    const source = fixedAutomationRows(parseAutomationRows([row(ID_A, 'One')]).rows);
    expect(source.snapshot()).toBe(source.snapshot());
  });
});

describe('catalog view', () => {
  it('groups shipped kinds by category in order and adds Custom Nodes', () => {
    const groups = catalogOf(ALL_NODE_KINDS, [fn]);
    const reusable = groups.find((group) => group.id === 'reusable');
    expect(reusable?.entries.map((entry) => entry.key)).toContain(`function:${ID_A}`);
    expect(groups[0]?.id).toBe('triggers');
    expect(new Set(groups.flatMap((group) => group.entries.map((entry) => entry.key))).size).toBe(
      groups.reduce((total, group) => total + group.entries.length, 0),
    );
  });

  it('offers every v1.1 kind', () => {
    const offered = new Set(
      catalogOf(ALL_NODE_KINDS, []).flatMap((group) => group.entries.map((entry) => entry.key)),
    );
    const later = ALL_NODE_KINDS.filter((kind) => kind.tier === 'v1.1');
    expect(later.length).toBeGreaterThan(0);
    for (const kind of later) expect(offered.has(`node:${kind.id}`)).toBe(true);
  });

  it('finds entries by every word across name, description and keywords', () => {
    const groups = catalogOf(ALL_NODE_KINDS, [fn]);
    expect(searchCatalog(groups, 'dims room').map((entry) => entry.id)).toEqual([ID_A]);
    expect(searchCatalog(groups, 'zzzz-nothing')).toEqual([]);
    expect(searchCatalog(groups, '  ').length).toBeGreaterThan(50);
  });
});

describe('query keys', () => {
  it('keep one prefix so everything can be cleared together', () => {
    expect(automationKeys.draft(ID_A).slice(0, 2)).toEqual(automationKeys.all);
    expect(automationKeys.runs(null)).toEqual([...automationKeys.all, 'runs', 'all']);
    expect(automationKeys.nodes(ID_A, -1, null, null)).not.toEqual(
      automationKeys.nodes(ID_A, 0, null, null),
    );
  });
});
