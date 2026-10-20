import { describe, expect, it } from 'vitest';
import type { FlowNode } from '@smarteverything/domain';
import { NODE_REGISTRY } from '@smarteverything/domain';
import type { Program } from '@smarteverything/flow/program/walk';
import { Ids, automation, ifNode, scope, setLight } from '../../../model/canvas/canvas-fixtures';
import { envOf, viewByKey } from './inspector-fixtures';
import type { SectionId } from './sections-model';
import { SECTION_IDS, sectionsFor } from './sections-model';
import { failAgainOps } from './catch-model';
import { applied } from './inspector-fixtures';
import type { InspectorFinding } from './section-types';

function sectionsOfKey(program: Program, key: string, extra = {}): readonly SectionId[] {
  return sectionsFor(viewByKey(program, key), envOf(program, extra));
}

function lone(
  kind: string,
  ports: FlowNode['ports'] = {},
  extra: Partial<FlowNode> = {},
): FlowNode {
  return { ...new Ids(40).next(), kind, ports, ...extra };
}

describe('section order', () => {
  it('lists header first, then notes and advanced for any step', () => {
    const program = automation([setLight(new Ids(), null)]);
    const sections = sectionsOfKey(program, 'n1');
    expect(sections[0]).toBe('header');
    expect(sections.slice(-2)).toEqual(['notes', 'advanced']);
  });

  it('keeps every section in the order of SECTION_IDS', () => {
    const program = automation([
      lone('flow.for_each', { items: { lit: [1] } }, { scopes: { body: scope([]) } }),
    ]);
    const sections = sectionsOfKey(program, 'n40', { run: runValues() });
    const order = sections.map((id) => SECTION_IDS.indexOf(id));
    expect(order).toEqual(order.toSorted((left, right) => left - right));
  });
});

function runValues(): {
  readonly iterations: number;
  readonly iteration: number;
  readonly inputs: null;
  readonly outputs: null;
  readonly memory: undefined;
} {
  return { iterations: 1, iteration: 0, inputs: null, outputs: null, memory: undefined };
}

describe('sections by kind', () => {
  it('gives a device step inputs, behaviour and no block sections', () => {
    const program = automation([setLight(new Ids(), null)]);
    expect(sectionsOfKey(program, 'n1')).toEqual([
      'header',
      'inputs',
      'outputs',
      'behaviour',
      'notes',
      'advanced',
    ]);
  });

  it('gives a trigger its inputs and no behaviour', () => {
    const program = automation([]);
    const sections = sectionsOfKey(program, 't0');
    expect(sections).toContain('inputs');
    expect(sections).not.toContain('behaviour');
  });

  it('gives a value node outputs and no behaviour', () => {
    const program = automation([lone('math.add', { a: { lit: 1 }, b: { lit: 2 } })]);
    const sections = sectionsOfKey(program, 'n40');
    expect(sections).toContain('outputs');
    expect(sections).not.toContain('behaviour');
  });

  it('gives Repeat, While, Do until and Loop until break limits and For each the same-time options', () => {
    for (const id of ['flow.repeat', 'flow.while', 'flow.do_until', 'flow.forever']) {
      const program = automation([lone(id, {}, { scopes: { body: scope([]) } })]);
      expect(sectionsOfKey(program, 'n40')).toContain('limits');
    }
    const each = automation([lone('flow.for_each', {}, { scopes: { body: scope([]) } })]);
    const sections = sectionsOfKey(each, 'n40');
    expect(sections).toContain('together');
    expect(sections).not.toContain('limits');
  });

  it('gives If, Switch, Do together and Try their rows, and structured outputs', () => {
    const ids = new Ids();
    const branch = ifNode(ids, [scope([])]);
    const program = automation([branch]);
    const sections = sectionsOfKey(program, branch.key);
    expect(sections).toContain('rows');
    expect(sections).toContain('structured');
    for (const id of ['flow.switch', 'flow.parallel', 'flow.try']) {
      const other = automation([lone(id)]);
      const found = sectionsOfKey(other, 'n40');
      expect(found).toContain('rows');
      expect(found).toContain('structured');
    }
  });

  it('gives Break and Continue the loop picker and Return the exit picker', () => {
    expect(sectionsOfKey(automation([lone('flow.break')]), 'n40')).toContain('target');
    expect(sectionsOfKey(automation([lone('flow.continue')]), 'n40')).toContain('target');
    expect(sectionsOfKey(automation([lone('flow.return')]), 'n40')).toContain('return');
  });

  it('gives a Custom Node its header', () => {
    const sections = sectionsOfKey(automation([lone('fn.call', { fn: { lit: 'x' } })]), 'n40');
    expect(sections).toContain('instance');
  });

  it('offers Fail again only on a failure that rethrows a caught error', () => {
    const ids = new Ids();
    const caught = ids.next().id;
    const attempt: FlowNode = {
      ...ids.next(),
      kind: 'flow.try',
      scopes: { try: scope([]) },
      catches: [{ id: caught, scope: scope([]) }],
    };
    const program = applied(automation([attempt]), failAgainOps(attempt.key, caught, 'same'));
    const again = program.body.nodes[0]?.catches?.[0]?.scope.nodes[0];
    expect(again?.kind).toBe('flow.fail');
    expect(sectionsOfKey(program, again?.key ?? '')).toContain('failAgain');
    const plain = automation([lone('flow.fail', { message: { lit: 'x' } })]);
    expect(sectionsOfKey(plain, 'n40')).not.toContain('failAgain');
  });
});

describe('problems and run values', () => {
  const finding: InspectorFinding = {
    id: 'f1',
    severity: 'error',
    message: 'Needs a value',
    port: undefined,
    fix: undefined,
  };

  it('shows the Problems section only when the node has findings', () => {
    const program = automation([setLight(new Ids(), null)]);
    expect(sectionsOfKey(program, 'n1')).not.toContain('problems');
    expect(sectionsOfKey(program, 'n1', { findings: [finding] })[1]).toBe('problems');
  });

  it('shows Run values last, only while a run is being viewed', () => {
    const program = automation([setLight(new Ids(), null)]);
    expect(sectionsOfKey(program, 'n1')).not.toContain('run');
    expect(sectionsOfKey(program, 'n1', { run: runValues() }).at(-1)).toBe('run');
  });
});

describe('every shipped step and value kind', () => {
  it('gets a header, notes and advanced, each section once', () => {
    for (const kind of NODE_REGISTRY.shipped().filter((entry) => entry.class !== 'trigger')) {
      const sections = sectionsOfKey(automation([lone(kind.id)]), 'n40');
      expect(sections[0]).toBe('header');
      expect(sections.slice(-2)).toEqual(['notes', 'advanced']);
      expect(new Set(sections).size).toBe(sections.length);
    }
  });
});
