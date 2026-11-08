import { STATIC_KIND_LOOKUP } from '@smarteverything/domain';
import {
  AUTOMATION_ROW,
  EMPTY_LAYOUT,
  type AutomationV4,
  type GraphNode,
} from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { listOf, parseAutomationRows } from './automation-rows';
import {
  UnstructuredProgramError,
  adaptFunction,
  adaptRevision,
  structureAutomation,
} from './graph-adapter';

const ROW_ID = '00000000-0000-4000-8000-000000000001';
const MOMENT = '2026-10-18T10:00:00+07:00';

function id(index: number): string {
  return `00000000-0000-4000-8000-${String(index + 100).padStart(12, '0')}`;
}

const START: GraphNode = { id: id(1), key: 'start', kind: 'flow.start', to: { next: 'notice' } };
const NOTICE: GraphNode = {
  id: id(2),
  key: 'notice',
  kind: 'notify.feed',
  ports: { message: { lit: 'hello' } },
};

function automation(nodes: readonly GraphNode[]): AutomationV4 {
  return {
    version: 4,
    kind: 'automation',
    triggers: [],
    inputs: [],
    outputs: [],
    variables: [],
    nodes: [...nodes],
    policy: { mode: 'single' },
  };
}

function row(rowId: string, definition: AutomationV4): unknown {
  return {
    id: rowId,
    name: 'Notice',
    enabled: true,
    revision: 1,
    definition,
    draft: null,
    layout: EMPTY_LAYOUT,
    origin: null,
    author: null,
    last_run_at: null,
    last_error: null,
    run_count: 0,
    created_at: MOMENT,
    updated_at: MOMENT,
  };
}

const LOOPING: readonly GraphNode[] = [
  { ...START, to: { next: 'first' } },
  {
    id: id(3),
    key: 'first',
    kind: 'notify.feed',
    ports: { message: { lit: 'a' } },
    to: { next: 'second' },
  },
  {
    id: id(4),
    key: 'second',
    kind: 'notify.feed',
    ports: { message: { lit: 'b' } },
    to: { next: 'first' },
  },
];

describe('the app read adapter', () => {
  it('gives each automation row its steps and keeps the graph beside them', () => {
    const parsed = parseAutomationRows(
      [row(ROW_ID, automation([START, NOTICE]))],
      STATIC_KIND_LOOKUP,
    );
    expect(parsed.rejected).toBe(0);
    const [only] = parsed.rows;
    expect(only?.definition.version).toBe(3);
    expect(only?.definition.body.nodes.map((node) => node.key)).toEqual(['notice']);
    expect(only?.graph.nodes.map((node) => node.key)).toEqual(['start', 'notice']);
    expect(only?.map.size).toBeGreaterThan(0);
    expect(listOf(parsed).byId.get(ROW_ID)?.definition.kind).toBe('automation');
  });

  it('structures a row once however often the table is read', () => {
    const raw = row(ROW_ID, automation([START, NOTICE]));
    const first = parseAutomationRows([raw], STATIC_KIND_LOOKUP).rows[0];
    const again = parseAutomationRows(
      [raw, row(id(9), automation([START, NOTICE]))],
      STATIC_KIND_LOOKUP,
    ).rows[0];
    expect(again).toBe(first);
  });

  it('reports a row that does not turn into steps, with its problems, instead of hiding it', () => {
    const parsed = parseAutomationRows([row(ROW_ID, automation(LOOPING))], STATIC_KIND_LOOKUP);
    expect(parsed.rows).toEqual([]);
    expect(parsed.rejected).toBe(1);
    expect(parsed.unstructured).toHaveLength(1);
    expect(parsed.unstructured[0]?.id).toBe(ROW_ID);
    expect(parsed.unstructured[0]?.problems.map((problem) => problem.code)).toContain('wire_cycle');
  });

  it('refuses a row the contract does not accept', () => {
    const parsed = parseAutomationRows([{ id: 'x' }], STATIC_KIND_LOOKUP);
    expect(parsed.rejected).toBe(1);
    expect(parsed.unstructured).toEqual([]);
  });

  it('keeps the wire row schema on programs of version 4 only', () => {
    const old = {
      ...AUTOMATION_ROW.parse(row(ROW_ID, automation([START, NOTICE]))),
      definition: { version: 3 },
    };
    expect(AUTOMATION_ROW.safeParse(old).success).toBe(false);
  });

  it('structures a revision and refuses one that does not turn into steps', () => {
    const base = {
      automation_id: ROW_ID,
      revision: 2,
      layout: EMPTY_LAYOUT,
      plan_hash: 'a'.repeat(64),
      saved_at: MOMENT,
      author: null,
    };
    const good = adaptRevision(
      { ...base, definition: automation([START, NOTICE]) },
      STATIC_KIND_LOOKUP,
    );
    expect(good.definition.body.nodes).toHaveLength(1);
    expect(good.graph.nodes).toHaveLength(2);
    expect(() =>
      adaptRevision({ ...base, definition: automation(LOOPING) }, STATIC_KIND_LOOKUP),
    ).toThrow(UnstructuredProgramError);
  });

  it('structures a Custom Node detail', () => {
    const detail = {
      id: ROW_ID,
      name: 'Flash',
      description: null,
      category: null,
      icon: null,
      editable: true,
      revision: 1,
      interface: { flavour: 'action' as const, inputs: [], outputs: [], exits: ['done'] },
      interfaceHash: 'a'.repeat(64),
      users: 0,
      createdBy: null,
      updatedAt: null,
      layout: EMPTY_LAYOUT,
      usedBy: [],
      program: {
        version: 4 as const,
        kind: 'function' as const,
        flavour: 'action' as const,
        inputs: [],
        outputs: [],
        exits: ['done'],
        variables: [],
        nodes: [START, NOTICE],
      },
    };
    const adapted = adaptFunction(detail, STATIC_KIND_LOOKUP);
    expect(adapted.program.kind).toBe('function');
    expect(adapted.program.body.nodes.map((node) => node.key)).toEqual(['notice']);
    expect(adapted.graph.nodes).toHaveLength(2);
  });

  it('tells a draft that does not structure apart from a broken contract', () => {
    const found = structureAutomation(automation(LOOPING), STATIC_KIND_LOOKUP);
    expect(found.kind).toBe('unstructured');
  });
});
