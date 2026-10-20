import { describe, expect, it } from 'vitest';
import {
  ALL_NODE_KINDS,
  CONVERT_UNITS,
  NODE_REGISTRY,
  SHIPPED_TIERS,
  kindProblems,
  nodeCatalogue,
  type NodeKind,
} from '../../src/automation-nodes';
import { FLOW_SCOPE_OUTPUTS } from '../../src/automation-nodes/flow';
import { FLOW_MORE_KINDS } from '../../src/automation-nodes/flow-more';
import { LIST_MORE_KINDS } from '../../src/automation-nodes/lists-more';
import { LOGIC_MORE_KINDS } from '../../src/automation-nodes/logic-more';
import { MATH_MORE_KINDS } from '../../src/automation-nodes/math-more';
import { OBJECT_MORE_KINDS } from '../../src/automation-nodes/objects-more';
import { RANDOM_MORE_KINDS } from '../../src/automation-nodes/random-more';
import { TEXT_MORE_KINDS } from '../../src/automation-nodes/text-more';
import { DATE_MORE_KINDS } from '../../src/automation-nodes/dates-more';
import type { FlowNode } from '../../src/automation-v3/node';
import type { AutomationV3 } from '../../src/automation-v3/program';
import { structuralIssues } from '../../src/automation-v3/structure-rules';

const V11_IDS: readonly string[] = [
  'date.next',
  'date.start_of',
  'date.sun_times',
  'flow.forever',
  'flow.sequence',
  'list.combine',
  'list.range',
  'list.reshape',
  'list.slice',
  'list.sort',
  'list.unique',
  'logic.changed',
  'logic.count_true',
  'logic.day_type',
  'logic.in_schedule',
  'logic.xor',
  'math.convert_unit',
  'math.percent',
  'object.fields',
  'object.merge',
  'object.pick',
  'object.remove',
  'random.chance',
  'random.duration',
  'text.case',
  'text.slice',
  'text.speakable',
];

const PROGRAM: AutomationV3 = {
  version: 3,
  kind: 'automation',
  triggers: [],
  inputs: [],
  outputs: [],
  variables: [],
  body: { nodes: [] },
  policy: { mode: 'single' },
};

const MORE: readonly NodeKind[] = [
  ...FLOW_MORE_KINDS,
  ...LOGIC_MORE_KINDS,
  ...MATH_MORE_KINDS,
  ...TEXT_MORE_KINDS,
  ...LIST_MORE_KINDS,
  ...OBJECT_MORE_KINDS,
  ...DATE_MORE_KINDS,
  ...RANDOM_MORE_KINDS,
];

describe('v1.1 flow, logic, math, text, list, object, date and random kinds', () => {
  it('registers exactly the planned ids, once each', () => {
    expect(MORE.map((kind) => kind.id).sort()).toEqual([...V11_IDS].sort());
    for (const id of V11_IDS) expect(NODE_REGISTRY.has(id), id).toBe(true);
  });

  it('passes every define rule and sits in the tier v1.1', () => {
    for (const kind of MORE) {
      expect(kindProblems(kind), kind.id).toEqual([]);
      expect(kind.tier, kind.id).toBe('v1.1');
      expect(kind.access).toBe('member');
    }
  });

  it('is in the shipped catalogue', () => {
    expect(SHIPPED_TIERS).toContain('v1.1');
    const shipped = new Set(NODE_REGISTRY.shipped().map((kind) => kind.id));
    for (const id of V11_IDS) expect(shipped.has(id), id).toBe(true);
    const listed = new Set(nodeCatalogue(NODE_REGISTRY, {}).map((e) => e.id));
    for (const id of V11_IDS) expect(listed.has(id), id).toBe(true);
    expect(ALL_NODE_KINDS.filter((kind) => kind.tier === 'v1.1').length).toBeGreaterThanOrEqual(
      V11_IDS.length,
    );
  });

  it('keeps pure kinds pure and puts the remembering and random kinds on the exec chain', () => {
    const classes = new Map(MORE.map((kind) => [kind.id, kind.class]));
    for (const id of ['logic.changed', 'random.chance', 'random.duration', 'date.sun_times']) {
      expect(classes.get(id), id).toBe('read');
    }
    expect(classes.get('flow.forever')).toBe('control');
    expect(classes.get('flow.sequence')).toBe('control');
    expect(classes.get('list.sort')).toBe('pure');
  });

  it('gives the endless loop the while loop options and an optional limit with no default', () => {
    const forever = NODE_REGISTRY.get('flow.forever');
    expect(forever?.inputs.map((port) => port.name)).toEqual(['gap', 'limit']);
    expect(forever?.scopes).toEqual({ required: ['body'], optional: [] });
    expect(forever?.inputs.find((port) => port.name === 'limit')?.default).toBeUndefined();
    expect(FLOW_SCOPE_OUTPUTS['flow.forever']?.map((port) => port.name)).toEqual([
      'index',
      'position',
    ]);
    expect(NODE_REGISTRY.get('flow.sequence')?.scopes).toEqual({
      required: ['body'],
      optional: [],
    });
  });

  it('declares every convertible unit once with a known dimension', () => {
    const ids = CONVERT_UNITS.map((unit) => unit.id);
    expect(new Set(ids).size).toBe(ids.length);
    const port = NODE_REGISTRY.get('math.convert_unit')?.inputs.find((p) => p.name === 'from');
    const offered = port?.type.t === 'choice' ? port.type.options.map((o) => o.id) : [];
    expect(offered).toEqual(ids);
  });

  it('requires a body scope on the endless loop and on the steps group', () => {
    const idOf = '00000000-0000-4000-8000-00000000000a';
    const messagesFor = (kind: string, scopes: FlowNode['scopes']): readonly string[] =>
      structuralIssues({ ...PROGRAM, body: { nodes: [{ id: idOf, key: 'n', kind, scopes }] } }).map(
        (issue) => issue.message,
      );
    for (const kind of ['flow.forever', 'flow.sequence']) {
      expect(messagesFor(kind, undefined).join(' ')).toContain('"body" is required');
      expect(messagesFor(kind, { body: { nodes: [] } })).toEqual([]);
    }
  });
});
