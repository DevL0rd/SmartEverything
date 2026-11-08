import { STATIC_KIND_LOOKUP } from '@smarteverything/domain';
import { EMPTY_LAYOUT, NODE_REGISTRY, type Layout, type ProgramV4 } from '@smarteverything/domain';
import type { CheckContext } from '@smarteverything/flow/check/shapes';
import { layoutGraph } from '@smarteverything/flow/graph/layout';
import { describe, expect, it } from 'vitest';
import {
  automation,
  brokenProgram,
  idOf,
  note,
  start,
} from '../../model/graph/graph-scene-fixtures';
import { checkCustomNode, planCustomNode } from './custom-node-intent';
import {
  evaluate,
  shownDocument,
  type GraphDocument,
  type IntentRuntime,
  type IntentSuccess,
} from './intent-env';
import { planMove, planTidy } from './move-intent';

const check: CheckContext = {
  kinds: (id) => NODE_REGISTRY.get(id),
  automations: () => undefined,
  scopeOutputs: () => [],
  references: () => false,
  functions: () => undefined,
  secrets: new Set(),
};

const rt: IntentRuntime = {
  newId: (() => {
    let count = 0;
    return () => {
      count += 1;
      return `00000000-0000-4000-9000-${String(count).padStart(12, '0')}`;
    };
  })(),
  density: 'touch',
  direction: 'ltr',
  check,
  kinds: NODE_REGISTRY,
  sizes: new Map(),
};

function documentOf(program: ProgramV4): GraphDocument {
  const laid = layoutGraph(program, {
    kinds: STATIC_KIND_LOOKUP,
    direction: 'ltr',
    density: 'touch',
  });
  const layout: Layout = { ...EMPTY_LAYOUT, nodes: { ...laid.nodes } };
  return { program, layout };
}

function chain(): GraphDocument {
  return documentOf(
    automation([start('a'), note('a', 'b'), note('b', 'c'), note('c', 'd'), note('d')]),
  );
}

function ok(doc: GraphDocument, planned: ReturnType<typeof planMove>): IntentSuccess {
  const outcome = evaluate(doc, planned, rt);
  if (!outcome.ok) throw new Error(outcome.reason);
  return outcome;
}

describe('planMove', () => {
  it('moves dragged nodes and nudges a selection with Alt+arrows', () => {
    const doc = chain();
    const from = doc.layout.nodes[idOf('b')];
    const dragged = ok(
      doc,
      planMove(doc, { kind: 'drag', moves: [{ id: idOf('b'), x: 500, y: 40 }] }),
    );
    expect(dragged.layout.nodes[idOf('b')]).toMatchObject({ x: 500, y: 40 });
    expect(dragged.layout.nodes[idOf('c')]).toEqual(doc.layout.nodes[idOf('c')]);
    expect(dragged.program).toBe(doc.program);
    expect(dragged.announcement).toBe('Moved 1 step.');
    const nudged = ok(
      doc,
      planMove(doc, { kind: 'nudge', ids: [idOf('b'), idOf('c')], dx: 8, dy: -8 }),
    );
    expect(nudged.layout.nodes[idOf('b')]).toMatchObject({
      x: (from?.x ?? 0) + 8,
      y: (from?.y ?? 0) - 8,
    });
    expect(nudged.announcement).toBe('Moved 2 steps.');
  });

  it('reports a move that changes nothing', () => {
    const doc = chain();
    const same = doc.layout.nodes[idOf('b')];
    const out = ok(
      doc,
      planMove(doc, { kind: 'drag', moves: [{ id: idOf('b'), x: same?.x ?? 0, y: same?.y ?? 0 }] }),
    );
    expect(out.changed).toBe(false);
    expect(out.announcement).toBe('Nothing moved.');
    const unknown = ok(
      doc,
      planMove(doc, { kind: 'drag', moves: [{ id: idOf('ghost'), x: 1, y: 1 }] }),
    );
    expect(unknown.changed).toBe(false);
  });
});

describe('a stored layout that no longer fits the cards', () => {
  const tidy = chain();
  const stacked: GraphDocument = {
    ...tidy,
    layout: {
      ...tidy.layout,
      nodes: Object.fromEntries(Object.keys(tidy.layout.nodes).map((id) => [id, { x: 0, y: 0 }])),
    },
  };

  it('is planned on the structured layout and stays stored until an edit', () => {
    expect(shownDocument(stacked, rt).layout.nodes).toEqual(tidy.layout.nodes);
    const again = ok(stacked, planTidy(shownDocument(stacked, rt), rt));
    expect(again.changed).toBe(false);
    expect(again.layout).toBe(stacked.layout);
  });

  it('saves the structured layout with the first edit', () => {
    const shown = shownDocument(stacked, rt);
    const moved = ok(
      stacked,
      planMove(shown, { kind: 'drag', moves: [{ id: idOf('b'), x: 500, y: 400 }] }),
    );
    expect(moved.changed).toBe(true);
    expect(moved.layout.nodes[idOf('b')]).toMatchObject({ x: 500, y: 400 });
    expect(moved.layout.nodes[idOf('c')]).toEqual(tidy.layout.nodes[idOf('c')]);
  });
});

describe('planTidy', () => {
  it('lays everything out again as one change and is a no-op when already tidy', () => {
    const doc = chain();
    const scattered: GraphDocument = {
      ...doc,
      layout: { ...doc.layout, nodes: { ...doc.layout.nodes, [idOf('b')]: { x: 9000, y: 9000 } } },
    };
    const out = ok(scattered, planTidy(scattered, rt));
    expect(out.layout.nodes).toEqual(doc.layout.nodes);
    expect(out.announcement).toBe('Tidied up the layout.');
    const again = ok(doc, planTidy(doc, rt));
    expect(again.changed).toBe(false);
    expect(again.announcement).toBe('Already tidy.');
  });

  it('refuses with the problem count when the program has structure problems', () => {
    const doc = documentOf(brokenProgram());
    const count = layoutGraph(doc.program, {
      kinds: STATIC_KIND_LOOKUP,
      direction: 'ltr',
      density: 'touch',
    }).problemCount;
    const out = evaluate(doc, planTidy(doc, rt), rt);
    expect(count).toBeGreaterThan(0);
    expect(out.ok).toBe(false);
    expect(out.ok ? '' : out.reason).toBe(
      `Fix ${String(count)} ${count === 1 ? 'problem' : 'problems'} to tidy everything.`,
    );
  });
});

describe('Custom Node', () => {
  it('is allowed for one connected chain with one way in and one way out', () => {
    expect(checkCustomNode(chain(), [idOf('b'), idOf('c')], rt)).toEqual({ enabled: true });
  });

  it('is refused with the wire that is the problem', () => {
    const doc = chain();
    const apart = checkCustomNode(doc, [idOf('a'), idOf('c')], rt);
    expect(apart.enabled).toBe(false);
    const crossed = documentOf(
      automation([start('a'), note('a', 'b'), note('b', 'c'), note('c'), note('x', 'c')]),
    );
    const middle = checkCustomNode(crossed, [idOf('b'), idOf('c')], rt);
    expect(middle.enabled).toBe(false);
    expect(middle.enabled ? '' : middle.reason).toContain('into the middle');
    expect(checkCustomNode(doc, [], rt)).toEqual({
      enabled: false,
      reason: 'Select the steps to turn into a Custom Node.',
    });
  });

  it('makes the call node in place and keeps Start and the other ids', () => {
    const doc = chain();
    const plan = planCustomNode(
      doc,
      {
        ids: [idOf('b'), idOf('c')],
        name: 'Make tea',
        functionId: '33333333-3333-4333-8333-333333333333',
      },
      rt,
    );
    if (!plan.ok) throw new Error(plan.reason);
    const keys = plan.program.nodes.map((node) => node.key);
    expect(keys).toEqual(expect.arrayContaining(['start', 'a', plan.instanceKey, 'd']));
    expect(keys).not.toContain('b');
    expect(plan.program.nodes.find((node) => node.key === 'start')?.id).toBe(idOf('start'));
    expect(plan.program.nodes.find((node) => node.key === 'a')?.to).toEqual({
      next: plan.instanceKey,
    });
    const call = plan.program.nodes.find((node) => node.key === plan.instanceKey);
    expect(plan.layout.nodes[call?.id ?? '']).toEqual(doc.layout.nodes[idOf('b')]);
    expect(plan.program.nodes.every((node) => plan.layout.nodes[node.id] !== undefined)).toBe(true);
    expect(plan.callee.body.nodes.map((node) => node.key)).toEqual(['b', 'c']);
    expect(plan.announcement).toBe('Made the Custom Node Make tea from 2 steps.');
  });
});
