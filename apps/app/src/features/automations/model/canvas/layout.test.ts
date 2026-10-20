import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { AutomationV3, FlowNode, Layout } from '@smarteverything/domain';
import { EMPTY_LAYOUT, NODE_REGISTRY } from '@smarteverything/domain';
import {
  Ids,
  add,
  automation,
  functionPrograms,
  ifNode,
  note,
  programs,
  scope,
  setLight,
  uuid,
} from './canvas-fixtures';
import { layoutCompact, layoutWide } from './layout';
import type { Layouted } from './layout-types';
import { COMPACT, OUTPUT_PIN_H, TRIGGER_SIZE } from './metrics';
import { buildTree } from './tree';

const OPTIONS = { registry: NODE_REGISTRY, layout: EMPTY_LAYOUT };

function wide(program: AutomationV3, layout: Layout = EMPTY_LAYOUT): Layouted {
  return layoutWide(buildTree(program, { ...OPTIONS, layout }), layout);
}

function compact(program: AutomationV3, width = 375): Layouted {
  return layoutCompact(buildTree(program, OPTIONS), width);
}

function rect(layouted: Layouted, id: string): NonNullable<ReturnType<Layouted['rects']['get']>> {
  const found = layouted.rects.get(id);
  if (found === undefined) throw new Error(`no rect for ${id}`);
  return found;
}

function withValue(): {
  program: AutomationV3;
  consumer: FlowNode;
  value: FlowNode;
  dep: FlowNode;
} {
  const ids = new Ids(1);
  const dep = add(ids, null);
  const value = add(ids, `${dep.key}.result`);
  const consumer = setLight(ids, `${value.key}.result`);
  return { program: automation([dep, value, consumer]), consumer, value, dep };
}

describe('layoutWide', () => {
  it('left-aligns triggers and the admit chip with the body column', () => {
    const ids = new Ids(1);
    const { value, consumer } = withValue();
    const program = automation([value, consumer, note(ids, 'x')], {
      admit: { wire: { from: 'home', port: 'anyone' } },
      triggers: [
        { id: uuid(901), key: 't1', kind: 'trigger.time', ports: { at: { lit: '07:00' } } },
        { id: uuid(902), key: 't2', kind: 'trigger.time', ports: { at: { lit: '08:00' } } },
      ],
    });
    const layouted = wide(program);
    const column = rect(layouted, consumer.id).x;
    expect(rect(layouted, uuid(901)).x).toBe(column);
    expect(rect(layouted, 'admit').x).toBe(column);
    expect(rect(layouted, uuid(902)).x).toBeGreaterThan(column);
    expect(rect(layouted, 'admit').y).toBeGreaterThan(rect(layouted, uuid(901)).y);
  });

  it('puts value cards left of the consumer, deepest dependency furthest left', () => {
    const { program, consumer, value, dep } = withValue();
    const layouted = wide(program);
    const at = rect(layouted, consumer.id);
    const valueRect = rect(layouted, value.id);
    const depRect = rect(layouted, dep.id);
    expect(valueRect.x + valueRect.w).toBeLessThan(at.x);
    expect(depRect.x + depRect.w).toBeLessThan(valueRect.x);
    expect(valueRect.y).toBe(at.y);
    expect(Math.min(depRect.x, valueRect.x, at.x)).toBeGreaterThanOrEqual(0);
  });

  it('lays lanes side by side under the container header', () => {
    const ids = new Ids(1);
    const branch = ifNode(ids, [scope([note(ids, 'a')])], scope([note(ids, 'b')]));
    const layouted = wide(automation([branch]));
    const lanes = [...layouted.parents]
      .filter(([, parent]) => parent === branch.id)
      .map(([id]) => rect(layouted, id));
    expect(lanes).toHaveLength(2);
    expect(lanes[0]?.y).toBe(lanes[1]?.y);
    expect((lanes[0]?.x ?? 0) + (lanes[0]?.w ?? 0)).toBeLessThan(lanes[1]?.x ?? 0);
    const frame = rect(layouted, branch.id);
    expect(lanes[0]?.y).toBeGreaterThan(frame.y);
  });

  it('applies stored offsets on top of the structured layout', () => {
    const { program, consumer } = withValue();
    const base = rect(wide(program), consumer.id);
    const layout: Layout = {
      nodes: { [consumer.id]: { x: 40, y: -10 } },
      frames: [],
      comments: [],
    };
    const moved = rect(wide(program, layout), consumer.id);
    expect(moved.x).toBe(base.x + 40);
    expect(moved.y).toBe(base.y - 10);
  });

  it('moves the lanes and steps of a container with it and keeps its insert points on it', () => {
    const ids = new Ids(1);
    const inner = note(ids, 'a');
    const branch = ifNode(ids, [scope([inner])]);
    const program = automation([branch]);
    const before = wide(program);
    const layout: Layout = { nodes: { [branch.id]: { x: 100, y: 0 } }, frames: [], comments: [] };
    const after = wide(program, layout);
    expect(rect(after, inner.id).x).toBe(rect(before, inner.id).x + 100);
    const tail = (layouted: Layouted): number | undefined =>
      layouted.inserts.find((spot) => spot.before === inner.id)?.x;
    expect(tail(after)).toBe((tail(before) ?? 0) + 100);
  });

  it('puts the failure handler to the right of the body, collapsed by default', () => {
    const ids = new Ids(1);
    const program = automation([note(ids, 'x')], { onFailure: scope([note(ids, 'y')]) });
    const layouted = wide(program);
    const failure = rect(layouted, 'onFailure');
    const body = rect(layouted, program.body.nodes[0]?.id ?? '');
    expect(failure.x).toBeGreaterThan(body.x + body.w);
    expect(failure.h).toBe(40);
  });
});

describe('layoutCompact', () => {
  it('uses the canvas width minus 32 and the 22 px exec rail', () => {
    const ids = new Ids(1);
    const first = note(ids, 'a');
    const second = note(ids, 'b');
    const layouted = compact(automation([first, second]), 375);
    expect(rect(layouted, first.id).w).toBe(343);
    expect(rect(layouted, first.id).x).toBe(0);
    const between = layouted.inserts.find((spot) => spot.before === second.id);
    expect(between?.x).toBe(COMPACT.rail);
  });

  it('stacks value cards above the step, indented 44 px, deepest first', () => {
    const { program, consumer, value, dep } = withValue();
    const layouted = compact(program);
    const at = rect(layouted, consumer.id);
    const valueRect = rect(layouted, value.id);
    const depRect = rect(layouted, dep.id);
    expect(depRect.y).toBeLessThan(valueRect.y);
    expect(valueRect.y + valueRect.h).toBeLessThanOrEqual(at.y);
    expect(valueRect.x).toBe(COMPACT.valueIndent);
    expect(valueRect.h).toBe(COMPACT.valueH);
  });

  it('stacks lanes vertically with a 42 px title bar and 10 px frame padding', () => {
    const ids = new Ids(1);
    const branch = ifNode(ids, [scope([note(ids, 'a')])], scope([note(ids, 'b')]));
    const layouted = compact(automation([branch]));
    const frame = rect(layouted, branch.id);
    const lanes = [...layouted.parents]
      .filter(([, parent]) => parent === branch.id)
      .map(([id]) => rect(layouted, id));
    expect(lanes[0]?.x).toBe(frame.x + COMPACT.pad);
    expect(lanes[0]?.w).toBe(frame.w - COMPACT.pad * 2);
    expect(lanes[1]?.y).toBeGreaterThan((lanes[0]?.y ?? 0) + (lanes[0]?.h ?? 0) - 1);
    expect(lanes[1]?.x).toBe(lanes[0]?.x);
  });

  it('ignores stored offsets', () => {
    const { program, consumer } = withValue();
    const layout: Layout = { nodes: { [consumer.id]: { x: 90, y: 90 } }, frames: [], comments: [] };
    const plain = rect(compact(program), consumer.id);
    const tree = buildTree(program, { ...OPTIONS, layout });
    expect(rect(layoutCompact(tree, 375), consumer.id)).toEqual(plain);
  });

  it('groups several triggers in one frame sized to hold them', () => {
    const ids = new Ids(1);
    const program = automation([note(ids, 'a')], {
      triggers: [
        { id: uuid(901), key: 't1', kind: 'trigger.time', ports: { at: { lit: '07:00' } } },
        { id: uuid(902), key: 't2', kind: 'trigger.time', ports: { at: { lit: '08:00' } } },
      ],
    });
    const layouted = compact(program);
    const group = rect(layouted, 'triggers');
    const second = rect(layouted, uuid(902));
    expect(second.y + second.h).toBeLessThanOrEqual(group.y + group.h);
    expect(second.x).toBe(COMPACT.pad);
  });
});

describe('trigger cards with many outputs', () => {
  const signal = automation([], {
    triggers: [
      {
        id: uuid(903),
        key: 'signal1',
        kind: 'trigger.signal',
        ports: { source: { lit: 'device' }, kind: { lit: 'state' } },
      },
    ],
  });
  const outputs = NODE_REGISTRY.get('trigger.signal')?.outputs.length ?? 0;

  it('has a trigger kind with more outputs than the base card holds', () => {
    expect(outputs * OUTPUT_PIN_H).toBeGreaterThan(TRIGGER_SIZE.h);
  });

  it('grows the card so every output label gets its own row, in both layouts', () => {
    for (const layouted of [wide(signal), compact(signal)]) {
      expect(rect(layouted, uuid(903)).h).toBeGreaterThanOrEqual(outputs * OUTPUT_PIN_H);
    }
  });

  it('keeps the base height for a trigger with few outputs', () => {
    const ids = new Ids(1);
    expect(rect(wide(automation([note(ids, 'a')])), uuid(900)).h).toBe(TRIGGER_SIZE.h);
  });
});

describe('both layouts on the same fixtures', () => {
  it('place the same nodes', () => {
    fc.assert(
      fc.property(fc.oneof(programs, functionPrograms), (program) => {
        const tree = buildTree(program, OPTIONS);
        const wideIds = [...layoutWide(tree, EMPTY_LAYOUT).rects.keys()].sort();
        const compactIds = [...layoutCompact(tree, 375).rects.keys()].sort();
        expect(compactIds.filter((id) => id !== 'triggers')).toEqual(wideIds);
      }),
      { numRuns: 40 },
    );
  });

  it('keep every rect finite with a positive size', () => {
    fc.assert(
      fc.property(
        fc.oneof(programs, functionPrograms),
        fc.integer({ min: 240, max: 900 }),
        (program, width) => {
          const tree = buildTree(program, OPTIONS);
          for (const layouted of [layoutWide(tree, EMPTY_LAYOUT), layoutCompact(tree, width)]) {
            for (const r of layouted.rects.values()) {
              expect(Number.isFinite(r.x + r.y + r.w + r.h)).toBe(true);
              expect(r.w).toBeGreaterThan(0);
              expect(r.h).toBeGreaterThan(0);
            }
          }
        },
      ),
      { numRuns: 40 },
    );
  });
});
