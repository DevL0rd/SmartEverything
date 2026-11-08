import { describe, expect, it } from 'vitest';
import type { FlowNode } from '@smarteverything/domain';
import { NODE_REGISTRY } from '@smarteverything/domain';
import type { Program } from '@smarteverything/flow/program/walk';
import { Ids, automation, ifNode, scope, setLight } from '../../../model/canvas/canvas-fixtures';
import { envOf, viewByKey } from './inspector-fixtures';
import type { SectionId } from './sections-model';
import { SECTION_IDS, inspectorLayout, moreOptionsSet, sectionsFor } from './sections-model';
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
  it('lists header first and ends with More options: naming first, advanced last', () => {
    const program = automation([setLight(new Ids(), null)]);
    const view = viewByKey(program, 'n1');
    const layout = inspectorLayout(view, envOf(program));
    expect(layout.main[0]).toBe('header');
    expect(layout.more[0]).toBe('naming');
    expect(layout.more.at(-1)).toBe('advanced');
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
  it('gives a device step inputs and outputs first and its failure handling under More options', () => {
    const program = automation([setLight(new Ids(), null)]);
    const layout = inspectorLayout(viewByKey(program, 'n1'), envOf(program));
    expect(layout).toEqual({
      main: ['header', 'inputs', 'outputs', 'mode'],
      wiring: ['connections', 'onError'],
      more: ['naming', 'behaviour', 'advanced'],
    });
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
    expect(sections).toContain('collect');
    expect(sections).not.toContain('limits');
  });

  it('gives If, Switch and Try their rows and values after, and a connections section', () => {
    const ids = new Ids();
    const branch = ifNode(ids, [scope([])]);
    const program = automation([branch]);
    const layout = inspectorLayout(viewByKey(program, branch.key), envOf(program));
    expect(layout.main).toContain('rows');
    expect(layout.more).toContain('valuesAfter');
    expect(layout.wiring).toContain('connections');
    for (const id of ['flow.switch', 'flow.try']) {
      const found = sectionsOfKey(automation([lone(id)]), 'n40');
      expect(found).toContain('rows');
      expect(found).toContain('valuesAfter');
    }
  });

  it('puts On error after the wiring for steps that can fail, and keeps Try on its own rows', () => {
    const program = automation([setLight(new Ids(), null)]);
    expect(inspectorLayout(viewByKey(program, 'n1'), envOf(program)).wiring.at(-1)).toBe('onError');
    const tryLayout = sectionsOfKey(automation([lone('flow.try')]), 'n40');
    expect(tryLayout).not.toContain('onError');
    expect(tryLayout).not.toContain('mode');
    expect(tryLayout).toContain('rows');
  });

  it('gives Do together its paths', () => {
    const fork = lone('flow.parallel', {}, { scopes: { path1: scope([]), path2: scope([]) } });
    expect(sectionsOfKey(automation([fork]), fork.key)).toContain('paths');
  });

  it('gives Break and Continue the loop picker and Return the exit picker', () => {
    expect(sectionsOfKey(automation([lone('flow.break')]), 'n40')).toContain('target');
    expect(sectionsOfKey(automation([lone('flow.continue')]), 'n40')).toContain('target');
    expect(sectionsOfKey(automation([lone('flow.return')]), 'n40')).toContain('return');
  });

  it('gives Run an automation the called automation inputs right after its own inputs', () => {
    const run = lone('automation.run', { automation: { lit: 'a1' } });
    const { main } = inspectorLayout(viewByKey(automation([run]), 'n40'), envOf(automation([run])));
    expect(main).toContain('calledInputs');
    expect(main.indexOf('calledInputs')).toBe(main.indexOf('inputs') + 1);
    expect(sectionsOfKey(automation([setLight(new Ids(), null)]), 'n1')).not.toContain(
      'calledInputs',
    );
  });

  it('gives a Custom Node its header', () => {
    const sections = sectionsOfKey(automation([lone('fn.call', { fn: { lit: 'x' } })]), 'n40');
    expect(sections).toContain('instance');
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
    const layout = inspectorLayout(viewByKey(program, 'n1'), envOf(program, { run: runValues() }));
    expect(layout.main.at(-1)).toBe('run');
  });
});

describe('every shipped step and value kind', () => {
  it('gets a header, naming and advanced, each section once', () => {
    for (const kind of NODE_REGISTRY.shipped().filter((entry) => entry.class !== 'trigger')) {
      const sections = sectionsOfKey(automation([lone(kind.id)]), 'n40');
      expect(sections[0]).toBe('header');
      expect(sections).toContain('naming');
      expect(sections.at(-1)).toBe('advanced');
      expect(new Set(sections).size).toBe(sections.length);
    }
  });
});

describe('More options summary', () => {
  it('names what is set inside, and nothing when all is default', () => {
    const plain = automation([setLight(new Ids(), null)]);
    expect(moreOptionsSet(viewByKey(plain, 'n1'), false)).toEqual([]);
    const busy = automation([
      setLight(new Ids(), null, {
        note: 'Hi',
        enabled: false,
        policy: { timeout: 1000 },
      }),
    ]);
    expect(moreOptionsSet(viewByKey(busy, 'n1'), true)).toEqual([
      'Note',
      'Time limit 1 s',
      'Off',
      'Kept where dropped',
    ]);
  });

  it('leaves out the run mode and a wait time limit, which the main area shows', () => {
    const waiting = automation([
      setLight(new Ids(), null, { policy: { mode: 'wait_for_result', timeout: 1000 } }),
    ]);
    expect(moreOptionsSet(viewByKey(waiting, 'n1'), false)).toEqual([]);
  });
});
