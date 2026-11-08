import { STATIC_KIND_LOOKUP } from '@smarteverything/domain';
import type { Layout, NodeLayout, ProgramV4 } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { layoutGraph } from '../../src/graph/layout';
import { layoutFault, shownLayout } from '../../src/graph/layout-fit';
import { nodeSize, programSizes, type Size } from '../../src/graph/metrics';
import {
  automation,
  idOf,
  ifNode,
  join,
  loop,
  start,
  step,
  together,
  tryNode,
  value,
} from './graph-fixtures';

const OPTIONS = { kinds: STATIC_KIND_LOOKUP, direction: 'ltr' } as const;

function babyCrying(): ProgramV4 {
  return automation([
    start('night'),
    ifNode('night', [{ name: 'Night', to: 'lamp' }], 'parents'),
    step('lamp', 'both', { ports: { to: { wire: { from: 'level', port: 'value' } } } }),
    step('parents', 'both'),
    together('both', [
      { name: 'lights', to: 'each' },
      { name: 'notify', to: 'tell' },
    ]),
    loop('each', 'flow.for_each', 'light', 'meet'),
    step('light'),
    step('tell', 'meet'),
    join('meet', 'guarded'),
    tryNode('guarded', { attempt: 'lullaby', catches: [{ name: 'any', to: 'sorry' }] }),
    step('lullaby'),
    step('sorry'),
    value('level'),
  ]);
}

function oldSizes(program: ProgramV4): ReadonlyMap<string, Size> {
  return new Map(
    program.nodes.map((node) => [node.id, nodeSize(node, 'touch', STATIC_KIND_LOOKUP)]),
  );
}

function layoutOf(nodes: Readonly<Record<string, NodeLayout>>): Layout {
  return { nodes, frames: [], comments: [] };
}

function migrated(program: ProgramV4): Layout {
  return layoutOf(layoutGraph(program, { ...OPTIONS, sizes: oldSizes(program) }).nodes);
}

describe('stored layout check', () => {
  it('accepts the structured layout laid out with the measured card sizes', () => {
    const program = babyCrying();
    const layout = layoutOf(layoutGraph(program, OPTIONS).nodes);
    expect(layoutFault(program, layout, OPTIONS)).toBeUndefined();
    expect(shownLayout(program, layout, OPTIONS)).toBe(layout);
  });

  it('finds overlapping cards in a Baby crying layout made with the old card sizes', () => {
    const program = babyCrying();
    expect(programSizes(program, 'touch', STATIC_KIND_LOOKUP).get(idOf('lamp'))?.h).toBeGreaterThan(
      oldSizes(program).get(idOf('lamp'))?.h ?? 0,
    );
    expect(layoutFault(program, migrated(program), OPTIONS)).toBe('overlap');
  });

  it('shows the structured layout instead and keeps the stored frames and collapsed flags', () => {
    const program = babyCrying();
    const stored = migrated(program);
    const lamp = idOf('lamp');
    const at = stored.nodes[lamp];
    const withFlag = layoutOf({
      ...stored.nodes,
      ...(at === undefined ? {} : { [lamp]: { ...at, collapsed: true } }),
    });
    const shown = shownLayout(program, withFlag, OPTIONS);
    expect(layoutFault(program, shown, OPTIONS)).toBeUndefined();
    expect(shown.nodes[lamp]).toEqual({
      ...layoutGraph(program, OPTIONS).nodes[lamp],
      collapsed: true,
    });
    expect(shown.frames).toBe(withFlag.frames);
  });

  it('reports a node with no stored position as missing', () => {
    const program = babyCrying();
    const full = layoutGraph(program, OPTIONS).nodes;
    const { [idOf('sorry')]: dropped, ...rest } = full;
    expect(dropped).toBeDefined();
    expect(layoutFault(program, layoutOf(rest), OPTIONS)).toBe('missing');
  });

  it('reports a card that sits on the exec line between two other steps', () => {
    const program = automation([start('a'), step('a', 'b'), step('b'), value('v')]);
    const placed = layoutGraph(program, OPTIONS).nodes;
    const a = placed[idOf('a')];
    const b = placed[idOf('b')];
    if (a === undefined || b === undefined) throw new Error('steps are not placed');
    const far = { x: b.x + 600, y: b.y };
    const between = { x: (a.x + far.x) / 2, y: a.y - 20 };
    const layout = layoutOf({ ...placed, [idOf('b')]: far, [idOf('v')]: between });
    expect(layoutFault(program, layout, OPTIONS)).toBe('on-exec-line');
  });
});
