import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { AutomationV3, FlowNode, FunctionV3, TriggerNode } from '@smarteverything/domain';
import { AUTOMATION_V3, FUNCTION_V3, NODE_REGISTRY } from '@smarteverything/domain';
import {
  COMPACT_INPUT,
  Ids,
  WIDE,
  add,
  allNodeIds,
  automation,
  fn,
  functionPrograms,
  ifNode,
  note,
  programs,
  scope,
  setLight,
  uuid,
} from './canvas-fixtures';
import { SCENE } from './contract';
import type { Scene } from './contract';
import { projectScene } from './project-scene';
import { brokenEdges, brokenInserts, duplicateIds, overlaps } from './scene-checks';

const RUNS = { numRuns: 60 } as const;

function outline(scene: Scene): string {
  const titles = new Map(scene.nodes.map((node) => [node.id, node.title]));
  return scene.nodes
    .map((node) => {
      const parent = node.parentId === null ? '' : ` in ${titles.get(node.parentId) ?? '?'}`;
      return `${node.role} ${node.title}${parent}`;
    })
    .join('\n');
}

function edgeLines(scene: Scene): string {
  const titles = new Map(scene.nodes.map((node) => [node.id, node.title]));
  return scene.edges
    .map(
      (edge) =>
        `${edge.kind} ${titles.get(edge.from.nodeId) ?? '?'}.${edge.from.port} > ${titles.get(edge.to.nodeId) ?? '?'}.${edge.to.port}`,
    )
    .join('\n');
}

function motionLight(): AutomationV3 {
  const ids = new Ids(1);
  const level = add(ids, null, { label: 'Brightness' });
  const dim = setLight(ids, `${level.key}.result`);
  const note1 = note(ids, 'Night mode');
  const branch = ifNode(ids, [scope([level, dim])], scope([note1]));
  return automation([branch], {
    admit: { wire: { from: 'home', port: 'anyone' } },
    onFailure: scope([note(ids, 'It failed')]),
  });
}

function loopWithValues(): AutomationV3 {
  const ids = new Ids(1);
  const base = add(ids, null, { label: 'Level' });
  const plus = add(ids, `${base.key}.result`, { label: 'Level plus five' });
  const each: FlowNode = {
    ...ids.next(),
    kind: 'flow.for_each',
    label: 'Each light',
    ports: { items: { lit: ['a', 'b'] } },
    scopes: { body: scope([base, plus, setLight(ids, `${plus.key}.result`)]) },
  };
  return automation([each]);
}

function tryCatch(): AutomationV3 {
  const ids = new Ids(1);
  const tryNode: FlowNode = {
    ...ids.next(),
    kind: 'flow.try',
    scopes: { try: scope([setLight(ids, null)]), finally: scope([note(ids, 'Done')]) },
    catches: [{ id: ids.next().id, classes: ['Unreachable'], scope: scope([note(ids, 'Retry')]) }],
  };
  return automation([tryNode, note(ids, 'After')]);
}

function parallelAndSwitch(): AutomationV3 {
  const ids = new Ids(1);
  const parallel: FlowNode = {
    ...ids.next(),
    kind: 'flow.parallel',
    scopes: { b0: scope([setLight(ids, null)]), b1: scope([note(ids, 'Two')]) },
  };
  const choose: FlowNode = {
    ...ids.next(),
    kind: 'flow.switch',
    ports: { subject: { wire: { from: 'trigger', port: 'key' } } },
    cases: [
      { id: ids.next().id, match: { eq: 'a' }, scope: scope([note(ids, 'A')]) },
      { id: ids.next().id, match: { range: { min: 1, max: 3 } }, scope: scope([]) },
    ],
    scopes: { default: scope([note(ids, 'Other')]) },
  };
  return automation([parallel, choose]);
}

function reusableBody(): FunctionV3 {
  const ids = new Ids(1);
  const level = add(ids, 'inputs.level', { label: 'Scaled' });
  const call: FlowNode = {
    ...ids.next(),
    kind: 'fn.call',
    ports: { fn: { lit: uuid(77) }, level: { wire: { from: level.key, port: 'result' } } },
    pin: { revision: 2 },
  };
  const out: FlowNode = { ...ids.next(), kind: 'flow.return', ports: { exit: { lit: 'next' } } };
  return fn([level, call, out]);
}

describe('fixtures are valid programs', () => {
  it('parses every fixture with the domain schema', () => {
    for (const program of [motionLight(), loopWithValues(), tryCatch(), parallelAndSwitch()]) {
      expect(AUTOMATION_V3.safeParse(program).success).toBe(true);
    }
    expect(FUNCTION_V3.safeParse(reusableBody()).success).toBe(true);
  });
});

describe('projection of the live families (wide)', () => {
  it('draws the motion light with a value card left of its consumer and a collapsed failure lane', () => {
    const scene = projectScene(motionLight(), WIDE);
    expect(outline(scene)).toMatchInlineSnapshot(`
      "trigger Time of day
      admit Only run if
      container If
      lane If yes in If
      value Brightness in If yes
      step Change device in If yes
      lane Otherwise in If
      step Activity feed note in Otherwise
      failure If the run fails"
    `);
    expect(edgeLines(scene)).toMatchInlineSnapshot(`
      "exec Time of day.next > Only run if.in
      exec Only run if.next > If.in
      exec If yes.start > Change device.in
      exec Otherwise.start > Activity feed note.in
      value Brightness.result > Change device.to"
    `);
  });

  it('draws a loop with a dependency chain of value cards and the return arrow', () => {
    const scene = projectScene(loopWithValues(), WIDE);
    expect(outline(scene)).toMatchInlineSnapshot(`
      "trigger Time of day
      container Each light
      lane For each item in Each light
      value Level in For each item
      value Level plus five in For each item
      step Change device in For each item"
    `);
    expect(edgeLines(scene)).toMatchInlineSnapshot(`
      "exec Time of day.next > Each light.in
      exec For each item.start > Change device.in
      value Level plus five.result > Change device.to
      value Level.result > Level plus five.a"
    `);
    expect(scene.loopReturns.map((entry) => entry.label)).toEqual(['next item']);
  });

  it('draws try, catch and finally lanes in order', () => {
    const scene = projectScene(tryCatch(), WIDE);
    expect(scene.nodes.filter((node) => node.role === 'lane').map((node) => node.title)).toEqual([
      'Try',
      'Catch Unreachable',
      'Finally',
    ]);
  });

  it('draws parallel branches and switch cases with their match titles', () => {
    const scene = projectScene(parallelAndSwitch(), WIDE);
    expect(scene.nodes.filter((node) => node.role === 'lane').map((node) => node.title)).toEqual([
      'Branch 1',
      'Branch 2',
      'Case Equals "a"',
      'Case Between 1 and 3',
      'Default',
    ]);
    const empty = scene.nodes.filter((node) => node.role === 'slot');
    expect(empty).toHaveLength(1);
  });

  it('draws a reusable body with an inputs bar, the reusable overline and exits', () => {
    const scene = projectScene(reusableBody(), WIDE);
    expect(outline(scene)).toMatchInlineSnapshot(`
      "inputs Inputs
      value Scaled
      step Use Custom Node
      step Return
      exits Exits"
    `);
    const call = scene.nodes.find((node) => node.kind === 'fn.call');
    expect(call?.overline).toBe('Custom Node');
    expect(call?.revision).toBe(2);
    const inputsEdge = scene.edges.find(
      (edge) => edge.kind === 'value' && edge.from.nodeId === 'inputs',
    );
    expect(inputsEdge?.to.port).toBe('a');
  });

  it('shows structured output pills and per-lane pins', () => {
    const ids = new Ids(1);
    const branch = ifNode(ids, [scope([note(ids, 'a')])], scope([note(ids, 'b')]), {
      outputs: [{ name: 'level', values: { else: { lit: 1 } } }],
    });
    const scene = projectScene(automation([branch]), WIDE);
    expect(scene.nodes.find((node) => node.id === branch.id)?.pills).toEqual(['level']);
    const lane = scene.nodes.find((node) => node.title === 'Otherwise');
    expect(lane?.outputs.map((pin) => pin.name)).toEqual(['level']);
  });

  it('opens a collapsed container as one card without its lanes', () => {
    const ids = new Ids(1);
    const branch = ifNode(ids, [scope([note(ids, 'a')])]);
    const layout = {
      nodes: { [branch.id]: { x: 0, y: 0, collapsed: true } },
      frames: [],
      comments: [],
    };
    const scene = projectScene(automation([branch]), { ...WIDE, layout });
    expect(scene.nodes.filter((node) => node.role === 'lane')).toHaveLength(0);
    expect(scene.nodes.find((node) => node.id === branch.id)).toMatchObject({
      collapsed: true,
      hiddenCount: 1,
    });
  });

  it('opens the failure lane when asked', () => {
    const scene = projectScene(motionLight(), { ...WIDE, failureOpen: true });
    expect(scene.nodes.find((node) => node.role === 'failure')?.collapsed).toBe(false);
    expect(scene.nodes.some((node) => node.title === 'Activity feed note')).toBe(true);
  });

  it('adds the run state to the node and its accessible name', () => {
    const program = motionLight();
    const target = program.body.nodes[0]?.id ?? '';
    const scene = projectScene(program, {
      ...WIDE,
      run: { [target]: { state: 'failed', text: 'Unreachable' } },
    });
    const node = scene.nodes.find((entry) => entry.id === target);
    expect(node?.run?.state).toBe('failed');
    expect(node?.ariaLabel.endsWith('. Failed: Unreachable')).toBe(true);
  });

  it('carries problems on nodes and ports', () => {
    const program = loopWithValues();
    const set = program.body.nodes[0]?.scopes?.['body']?.nodes[2];
    const scene = projectScene(program, {
      ...WIDE,
      problems: [
        { nodeId: set?.id ?? '', severity: 'critical', message: 'Too bright', port: 'to' },
      ],
    });
    const node = scene.nodes.find((entry) => entry.id === set?.id);
    expect(node?.problems).toEqual([{ severity: 'critical', message: 'Too bright', port: 'to' }]);
    expect(node?.ports.find((port) => port.name === 'to')?.problem).toBe(true);
    expect(node?.ariaLabel).toContain('Problem: Too bright');
  });

  it('flags a kind the registry does not know', () => {
    const ids = new Ids(1);
    const scene = projectScene(automation([{ ...ids.next(), kind: 'made.up' }]), WIDE);
    const node = scene.nodes.find((entry) => entry.kind === 'made.up');
    expect(node?.problems[0]?.severity).toBe('critical');
  });
});

describe('projection (compact)', () => {
  it('stacks value cards above the step with the port tag and draws no value wires', () => {
    const scene = projectScene(loopWithValues(), COMPACT_INPUT);
    expect(scene.edges.some((edge) => edge.kind === 'value')).toBe(false);
    const feeds = scene.nodes.filter((node) => node.role === 'value').map((node) => node.feeds);
    expect(feeds).toEqual(['a', 'to']);
    expect(outline(scene)).toMatchInlineSnapshot(`
      "trigger Time of day
      container Each light
      lane For each item in Each light
      value Level in For each item
      value Level plus five in For each item
      step Change device in For each item"
    `);
  });

  it('groups several triggers in one frame and leaves a single one plain', () => {
    const two = automation([note(new Ids(1), 'x')], { triggers: [uuidTrigger(0), uuidTrigger(1)] });
    const grouped = projectScene(two, COMPACT_INPUT);
    expect(grouped.nodes.find((node) => node.role === 'triggerGroup')?.ariaLabel).toBe(
      'Triggers. Any of these 2 starts the automation',
    );
    const plain = projectScene(automation([note(new Ids(1), 'x')]), COMPACT_INPUT);
    expect(plain.nodes.some((node) => node.role === 'triggerGroup')).toBe(false);
    const wide = projectScene(two, WIDE);
    expect(wide.nodes.some((node) => node.role === 'triggerGroup')).toBe(false);
  });

  it('collapses blocks deeper than four levels into one card that opens', () => {
    const ids = new Ids(1);
    let inner = scope([note(ids, 'deep')]);
    for (let level = 0; level < 6; level += 1) inner = scope([ifNode(ids, [inner])]);
    const scene = projectScene(automation(inner.nodes), COMPACT_INPUT);
    const opens = scene.nodes.filter((node) => node.opensBody);
    expect(opens).toHaveLength(1);
    expect(opens[0]?.depth).toBe(4);
    expect(scene.nodes.some((node) => node.title === 'Activity feed note')).toBe(false);
  });
});

function uuidTrigger(index: number): TriggerNode {
  return {
    id: uuid(900 + index),
    key: `t${String(index)}`,
    kind: 'trigger.time',
    ports: { at: { lit: '07:00' } },
  };
}

describe('scene properties', () => {
  it('places every node and trigger exactly once and never overlaps (wide)', () => {
    fc.assert(
      fc.property(fc.oneof(programs, functionPrograms), (program) => {
        const scene = projectScene(program, { ...WIDE, failureOpen: true });
        expect(duplicateIds(scene)).toEqual([]);
        expect(overlaps(scene)).toEqual([]);
        const present = new Set(scene.nodes.map((node) => node.id));
        expect(allNodeIds(program).every((id) => present.has(id))).toBe(true);
        expect(SCENE.safeParse(scene).success).toBe(true);
      }),
      RUNS,
    );
  });

  it('never overlaps and fits the width (compact)', () => {
    fc.assert(
      fc.property(
        fc.oneof(programs, functionPrograms),
        fc.integer({ min: 320, max: 600 }),
        (program, width) => {
          const scene = projectScene(program, { ...COMPACT_INPUT, canvasWidth: width });
          expect(duplicateIds(scene)).toEqual([]);
          expect(overlaps(scene)).toEqual([]);
          const inner = width - 32;
          for (const node of scene.nodes) {
            expect(node.x).toBeGreaterThanOrEqual(0);
            expect(node.x + node.w).toBeLessThanOrEqual(inner + 1e-9);
          }
          expect(scene.edges.some((edge) => edge.kind === 'value')).toBe(false);
        },
      ),
      RUNS,
    );
  });

  it('resolves every insert point to a place in the stored tree', () => {
    fc.assert(
      fc.property(
        fc.oneof(programs, functionPrograms),
        fc.constantFrom(WIDE, COMPACT_INPUT),
        (program, input) => {
          const scene = projectScene(program, { ...input, failureOpen: true });
          expect(brokenInserts(program, scene)).toEqual([]);
          expect(brokenEdges(scene)).toEqual([]);
        },
      ),
      RUNS,
    );
  });

  it('has one insert point before every step and one at the end of every scope', () => {
    fc.assert(
      fc.property(programs, (program) => {
        const scene = projectScene(program, { ...WIDE, failureOpen: true });
        const steps = scene.nodes.filter(
          (node) => node.role === 'step' || node.role === 'container',
        );
        const befores = new Set(
          scene.insertPoints.flatMap((point) => (point.before === null ? [] : [point.before])),
        );
        expect(steps.every((node) => befores.has(node.id))).toBe(true);
      }),
      RUNS,
    );
  });

  it('projects the same nodes in both layouts, minus the compact trigger group', () => {
    fc.assert(
      fc.property(fc.oneof(programs, functionPrograms), (program) => {
        const wide = projectScene(program, WIDE);
        const compact = projectScene(program, COMPACT_INPUT);
        const ids = (scene: Scene): string[] =>
          scene.nodes
            .filter((node) => node.role !== 'triggerGroup')
            .map((node) => node.id)
            .sort();
        expect(ids(compact)).toEqual(ids(wide));
      }),
      RUNS,
    );
  });

  it('names every node from a11yLabel and numbers the steps in program order', () => {
    fc.assert(
      fc.property(programs, (program) => {
        const scene = projectScene(program, { ...WIDE, failureOpen: true });
        const steps = scene.nodes.filter(
          (node) => node.ordinal !== null && node.role !== 'trigger',
        );
        const total = steps.length;
        for (const node of scene.nodes) expect(node.ariaLabel.length).toBeGreaterThan(0);
        for (const node of steps) {
          expect(
            node.ariaLabel.startsWith(`Step ${String(node.ordinal)} of ${String(total)}`),
          ).toBe(true);
        }
        expect(steps.map((node) => node.ordinal).sort((a, b) => (a ?? 0) - (b ?? 0))).toEqual(
          steps.map((_, index) => index + 1),
        );
      }),
      RUNS,
    );
  });
});

describe('registry coverage', () => {
  it('knows the kinds the fixtures use', () => {
    for (const id of [
      'device.set',
      'math.add',
      'notify.feed',
      'flow.if',
      'fn.call',
      'flow.return',
    ]) {
      expect(NODE_REGISTRY.has(id)).toBe(true);
    }
  });
});
