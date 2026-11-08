import { describe, expect, it } from 'vitest';
import { STATIC_KIND_LOOKUP } from '@smarteverything/domain';
import {
  automation,
  decisionProgram,
  gnode,
  note,
  start,
  wire,
} from '../../../model/graph/graph-scene-fixtures';
import { projectGraphScene } from '../../../model/graph/project-graph-scene';
import type { EdgeEnd } from '../../../model/graph/scene-contract';
import { buildGraphNodes } from '../scene-to-flow';
import type { Card } from './connect-controller';
import {
  EXEC_HINT,
  VALUE_HINT,
  armedHint,
  hintFor,
  reduceTap,
  tapConsumed,
  tapTargetOf,
  type ElementLike,
} from './tap-to-connect';
import { cardsOf } from './use-graph-connect';

function cardsOfProgram(program = decisionProgram()): readonly Card[] {
  return cardsOf(
    buildGraphNodes(projectGraphScene(program, { direction: 'ltr', kinds: STATIC_KIND_LOOKUP })),
  );
}

function find(cards: readonly Card[], key: string): Card {
  const found = cards.find((candidate) => candidate.scene.key === key);
  if (found === undefined) throw new Error(`no card ${key}`);
  return found;
}

function exitOf(cards: readonly Card[], key: string): EdgeEnd {
  const owner = find(cards, key);
  return { nodeId: owner.id, handle: owner.scene.rows[0]?.handle ?? '' };
}

function fake(
  attributes: Readonly<Record<string, string>>,
  chain: Readonly<Record<string, ElementLike | null>>,
): ElementLike {
  return {
    getAttribute: (name) => attributes[name] ?? null,
    closest: (selector) => chain[selector] ?? null,
  };
}

describe('tap to connect', () => {
  const cards = cardsOfProgram();
  const context = { zoom: 1, cards };

  it('arms an output on tap and shows the exec hint', () => {
    const armed = exitOf(cards, 'lamp');
    const result = reduceTap(null, { kind: 'handle', end: armed, side: 'source' }, context);
    expect(result).toEqual({ armed, action: { kind: 'none' } });
    expect(hintFor(armed)).toBe(EXEC_HINT);
    expect(EXEC_HINT).toBe('Tap the step that runs next');
  });

  it('names the armed output in the hint', () => {
    const nodes = [
      {
        id: 'n1',
        title: 'Start',
        rows: [{ handle: 'x:next', label: 'Then' }],
        outputs: [{ handle: 'o:level', label: 'Level' }],
      },
    ];
    expect(armedHint(nodes, { nodeId: 'n1', handle: 'x:next' })).toBe(
      'Then of Start: tap the step that runs next',
    );
    expect(armedHint(nodes, { nodeId: 'n1', handle: 'o:level' })).toBe(
      'Level of Start: tap the input that takes this value',
    );
    expect(armedHint(nodes, { nodeId: 'gone', handle: 'x:next' })).toBe(EXEC_HINT);
  });

  it('disarms when the same output is tapped again', () => {
    const armed = exitOf(cards, 'lamp');
    const result = reduceTap(armed, { kind: 'handle', end: armed, side: 'source' }, context);
    expect(result.armed).toBeNull();
  });

  it('moves the ring to another output', () => {
    const first = exitOf(cards, 'lamp');
    const second = exitOf(cards, 'dim');
    const result = reduceTap(first, { kind: 'handle', end: second, side: 'source' }, context);
    expect(result.armed).toEqual(second);
  });

  it('connects to any card tapped next and disarms', () => {
    const armed = exitOf(cards, 'lamp');
    const target = find(cards, 'dim');
    const result = reduceTap(armed, { kind: 'card', nodeId: target.id }, context);
    expect(result.armed).toBeNull();
    expect(result.action).toEqual({
      kind: 'connect',
      from: armed,
      to: { nodeId: target.id, handle: 'x:in' },
    });
  });

  it('treats a tap on a pin inside a card as a tap on the card', () => {
    const armed = exitOf(cards, 'lamp');
    const target = find(cards, 'dim');
    const end = { nodeId: target.id, handle: 'x:in' };
    const result = reduceTap(armed, { kind: 'handle', end, side: 'target' }, context);
    expect(result.action.kind).toBe('connect');
  });

  it('cancels on a tap on empty canvas', () => {
    const result = reduceTap(exitOf(cards, 'lamp'), { kind: 'pane' }, context);
    expect(result).toEqual({ armed: null, action: { kind: 'none' } });
  });

  it('ignores taps that are neither card nor pane while armed', () => {
    const armed = exitOf(cards, 'lamp');
    expect(reduceTap(armed, { kind: 'other' }, context).armed).toEqual(armed);
  });

  it('does nothing when nothing is armed and a card is tapped', () => {
    const result = reduceTap(null, { kind: 'card', nodeId: find(cards, 'dim').id }, context);
    expect(result).toEqual({ armed: null, action: { kind: 'none' } });
  });
});

describe('tap to connect values', () => {
  const program = automation([
    start('show'),
    gnode('sensor', 'device.get', { ports: { device: { lit: 'hall' } } }),
    note('show'),
    note('other', undefined, { ports: { message: wire('sensor', 'value') } }),
  ]);
  const cards = cardsOfProgram(program);
  const sensor = find(cards, 'sensor');
  const out: EdgeEnd = { nodeId: sensor.id, handle: sensor.scene.outputs[0]?.handle ?? '' };

  it('arms a value output only from zoom 0.9', () => {
    const tap = { kind: 'handle', end: out, side: 'source' } as const;
    expect(reduceTap(null, tap, { zoom: 0.5, cards }).armed).toBeNull();
    expect(reduceTap(null, tap, { zoom: 0.9, cards }).armed).toEqual(out);
    expect(hintFor(out)).toBe(VALUE_HINT);
  });

  it('connects to the input pin that is tapped', () => {
    const end = { nodeId: find(cards, 'show').id, handle: 'v:message' };
    const result = reduceTap(out, { kind: 'handle', end, side: 'target' }, { zoom: 1, cards });
    expect(result.action).toEqual({ kind: 'connect', from: out, to: end });
    expect(result.armed).toBeNull();
  });
});

describe('what a tap landed on', () => {
  const pane = fake({}, {});
  const card = fake({ 'data-id': 'n1' }, {});
  const sourceHandle: ElementLike = {
    getAttribute: (name) => ({ 'data-nodeid': 'n1', 'data-handleid': 'x:next' })[name] ?? null,
    closest: (selector) => (selector === '.react-flow__handle.source' ? sourceHandle : null),
  };
  const inside = (chain: Record<string, ElementLike | null>): ElementLike => fake({}, chain);

  it('reads a source handle', () => {
    const target = tapTargetOf(inside({ '.react-flow__handle': sourceHandle }));
    expect(target).toEqual({
      kind: 'handle',
      end: { nodeId: 'n1', handle: 'x:next' },
      side: 'source',
    });
  });

  it('reads a target handle', () => {
    const handle = fake({ 'data-nodeid': 'n2', 'data-handleid': 'x:in' }, {});
    const target = tapTargetOf(inside({ '.react-flow__handle': handle }));
    expect(target).toEqual({
      kind: 'handle',
      end: { nodeId: 'n2', handle: 'x:in' },
      side: 'target',
    });
  });

  it('reads a card, the pane, and anything else', () => {
    expect(tapTargetOf(inside({ '.react-flow__node': card }))).toEqual({
      kind: 'card',
      nodeId: 'n1',
    });
    expect(tapTargetOf(inside({ '.react-flow__pane': pane }))).toEqual({ kind: 'pane' });
    expect(tapTargetOf(inside({}))).toEqual({ kind: 'other' });
    expect(tapTargetOf(null)).toEqual({ kind: 'other' });
  });
});

describe('a tap that connects never selects', () => {
  const end = { nodeId: 'a', handle: 'x:next' };
  const nothing = { kind: 'none' } as const;

  it('keeps an arming tap on a source pin away from the card', () => {
    const tap = { kind: 'handle', end, side: 'source' } as const;
    expect(tapConsumed(null, tap, { armed: end, action: nothing })).toBe(true);
  });

  it('keeps the landing tap away from the target card', () => {
    expect(tapConsumed(end, { kind: 'card', nodeId: 'b' }, { armed: null, action: nothing })).toBe(
      true,
    );
  });

  it('lets a plain tap on a card select it and a pane tap through', () => {
    expect(tapConsumed(null, { kind: 'card', nodeId: 'b' }, { armed: null, action: nothing })).toBe(
      false,
    );
    expect(tapConsumed(end, { kind: 'pane' }, { armed: null, action: nothing })).toBe(false);
  });
});
