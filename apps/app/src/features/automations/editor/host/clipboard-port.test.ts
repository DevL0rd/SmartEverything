import { STATIC_KIND_LOOKUP } from '@smarteverything/domain';
import { EMPTY_LAYOUT, NODE_REGISTRY, type Layout, type ProgramV4 } from '@smarteverything/domain';
import type { CheckContext } from '@smarteverything/flow/check/shapes';
import { layoutGraph } from '@smarteverything/flow/graph/layout';
import { describe, expect, it } from 'vitest';
import {
  automation,
  decisionProgram,
  forkProgram,
  idOf,
  note,
  reading,
  start,
  wire,
} from '../../model/graph/graph-scene-fixtures';
import {
  buildPayload,
  parseClipboard,
  planCopy,
  planDuplicate,
  planPaste,
  REFUSED_COPY,
  REFUSED_PASTE,
} from './clipboard-port';
import {
  evaluate,
  type GraphDocument,
  type IntentRuntime,
  type IntentSuccess,
  type Planned,
} from './intent-env';

const check: CheckContext = {
  kinds: (id) => NODE_REGISTRY.get(id),
  automations: () => undefined,
  scopeOutputs: () => [],
  references: () => false,
  functions: () => undefined,
  secrets: new Set(),
};

function runtime(): IntentRuntime {
  let count = 0;
  return {
    newId: (): string => {
      count += 1;
      return `00000000-0000-4000-9000-${String(count).padStart(12, '0')}`;
    },
    density: 'touch',
    direction: 'ltr',
    check,
    kinds: NODE_REGISTRY,
    sizes: new Map(),
  };
}

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

function textOf(doc: GraphDocument, ids: readonly string[]): string {
  const result = planCopy(doc, ids, 'Copied', STATIC_KIND_LOOKUP);
  if (!result.ok) throw new Error(result.reason);
  return result.text;
}

function ok(doc: GraphDocument, planned: Planned): IntentSuccess {
  const outcome = evaluate(doc, planned, runtime());
  if (!outcome.ok) throw new Error(outcome.reason);
  return outcome;
}

describe('copy', () => {
  it('carries the wires among the selection and leaves wires to outside nodes behind', () => {
    const doc = chain();
    const result = planCopy(doc, [idOf('b'), idOf('c')], 'Copied', STATIC_KIND_LOOKUP);
    if (!result.ok) throw new Error(result.reason);
    const payload = parseClipboard(result.text);
    expect(payload?.nodes.map((node) => [node.key, node.to])).toEqual([
      ['b', { next: 'c' }],
      ['c', undefined],
    ]);
    expect(result.announcement).toBe('Copied 2 steps. 1 wire to steps outside stayed behind.');
  });

  it('drops value wires to outside nodes and keeps those among the selection', () => {
    const doc = documentOf(
      automation([
        start('a'),
        reading('sensor'),
        note('a', undefined, { ports: { message: wire('sensor', 'value') } }),
      ]),
    );
    const alone = buildPayload(doc, [idOf('a')], STATIC_KIND_LOOKUP);
    expect(alone?.payload.nodes[0]?.ports).toEqual({});
    const both = buildPayload(doc, [idOf('a'), idOf('sensor')], STATIC_KIND_LOOKUP);
    expect(both?.payload.nodes.find((node) => node.key === 'a')?.ports?.['message']).toEqual(
      wire('sensor', 'value'),
    );
  });

  it('turns a condition that read an outside node into false', () => {
    const doc = documentOf(decisionProgram());
    const built = buildPayload(doc, [idOf('check')], STATIC_KIND_LOOKUP);
    expect(built?.payload.nodes[0]?.branches?.[0]).toMatchObject({ when: { lit: false } });
    expect(built?.payload.nodes[0]?.branches?.[0]?.to).toBeUndefined();
  });

  it('refuses an empty selection and Start', () => {
    const doc = chain();
    expect(planCopy(doc, [], 'Copied', STATIC_KIND_LOOKUP)).toEqual({
      ok: false,
      reason: REFUSED_COPY,
    });
    expect(planCopy(doc, [idOf('start')], 'Copied', STATIC_KIND_LOOKUP)).toEqual({
      ok: false,
      reason: REFUSED_COPY,
    });
  });
});

describe('paste', () => {
  it('renames colliding keys, gives new ids and wires the copy to itself', () => {
    const doc = chain();
    const text = textOf(doc, [idOf('b'), idOf('c')]);
    const out = ok(doc, planPaste(doc, text, undefined, runtime()));
    const fresh = out.program.nodes.filter(
      (node) => !doc.program.nodes.some((old) => old.id === node.id),
    );
    expect(fresh).toHaveLength(2);
    const [first, second] = fresh;
    expect(first?.key).not.toBe('b');
    expect(second?.key).not.toBe('c');
    expect(first?.to).toEqual({ next: second?.key });
    expect(second?.to).toBeUndefined();
    expect(out.selection).toEqual(fresh.map((node) => node.id));
    expect(out.announcement).toBe('Pasted 2 steps.');
    expect(out.program.nodes.find((node) => node.key === 'b')?.to).toEqual({ next: 'c' });
  });

  it('offsets the copy by 32 px when there is no pointer', () => {
    const doc = chain();
    const text = textOf(doc, [idOf('b')]);
    const out = ok(doc, planPaste(doc, text, undefined, runtime()));
    const copy = out.program.nodes.find(
      (node) => !doc.program.nodes.some((old) => old.id === node.id),
    );
    const was = doc.layout.nodes[idOf('b')];
    expect(out.layout.nodes[copy?.id ?? '']).toMatchObject({
      x: (was?.x ?? 0) + 32,
      y: (was?.y ?? 0) + 32,
    });
  });

  it('places the copy at the pointer', () => {
    const doc = chain();
    const text = textOf(doc, [idOf('b'), idOf('c')]);
    const out = ok(doc, planPaste(doc, text, { x: 1000, y: 500 }, runtime()));
    const spots = out.program.nodes
      .filter((node) => !doc.program.nodes.some((old) => old.id === node.id))
      .map((node) => out.layout.nodes[node.id]);
    expect(Math.min(...spots.map((spot) => spot?.x ?? 0))).toBe(1000);
    expect(Math.min(...spots.map((spot) => spot?.y ?? 0))).toBe(500);
  });

  it('pastes into another document without renaming and copies triggers', () => {
    const doc = chain();
    const text = textOf(doc, [idOf('b')]);
    const other = documentOf(automation([start('x'), note('x')]));
    const out = ok(other, planPaste(other, text, undefined, runtime()));
    expect(out.program.nodes.map((node) => node.key)).toContain('b');
    const triggerText = textOf(doc, [idOf('tick')]);
    const pasted = ok(doc, planPaste(doc, triggerText, undefined, runtime()));
    expect(pasted.program.kind === 'automation' ? pasted.program.triggers.length : 0).toBe(2);
  });

  it('keeps a Do together and its Wait for all as a new pair', () => {
    const doc = documentOf(forkProgram('all'));
    const text = textOf(doc, [idOf('both'), idOf('l'), idOf('r')]);
    const out = ok(doc, planPaste(doc, text, undefined, runtime()));
    const forks = out.program.nodes.filter((node) => node.kind === 'flow.parallel');
    const joins = out.program.nodes.filter((node) => node.kind === 'flow.join');
    expect(forks).toHaveLength(2);
    expect(joins).toHaveLength(2);
    const copy = forks.find((fork) => fork.key !== 'both');
    const copyJoin = joins.find((join) => join.key !== 'meet');
    const ends = copy?.paths?.map(
      (path) => out.program.nodes.find((node) => node.key === path.to)?.to,
    );
    expect(ends).toEqual([{ next: copyJoin?.key }, { next: copyJoin?.key }]);
    expect(out.program.nodes.every((node) => out.layout.nodes[node.id] !== undefined)).toBe(true);
  });

  it('adds a reader after the node it reads', () => {
    const doc = documentOf(
      automation([
        start('a'),
        note('a', undefined, { ports: { message: wire('sensor', 'value') } }),
        reading('sensor'),
      ]),
    );
    const text = textOf(doc, [idOf('a'), idOf('sensor')]);
    const out = ok(doc, planPaste(doc, text, undefined, runtime()));
    const copy = out.program.nodes.find((node) => node.key !== 'a' && node.kind === 'notify.feed');
    const source = out.program.nodes.find(
      (node) => node.key !== 'sensor' && node.kind === 'device.get',
    );
    expect(copy?.ports?.['message']).toEqual(wire(source?.key ?? '', 'value'));
  });

  it('refuses text that is not automation steps', () => {
    const doc = chain();
    for (const text of ['hello', '{"format":"other"}']) {
      expect(planPaste(doc, text, undefined, runtime())).toEqual({
        ok: false,
        reason: REFUSED_PASTE,
      });
    }
  });
});

describe('duplicate', () => {
  it('copies the selection in place with an offset', () => {
    const doc = chain();
    const out = ok(doc, planDuplicate(doc, [idOf('b')], runtime()));
    expect(out.program.nodes).toHaveLength(doc.program.nodes.length + 1);
    expect(out.announcement).toBe('Duplicated 1 step.');
    expect(out.selection).toHaveLength(1);
  });
});
