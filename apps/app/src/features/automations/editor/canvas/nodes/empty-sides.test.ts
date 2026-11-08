import { clearSpot } from '../drop-ghost';
import { STATIC_KIND_LOOKUP } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { automation, start } from '../../../model/graph/graph-scene-fixtures';
import { babyProgram } from '../../../model/graph/graph-baby-fixture';
import { projectGraphScene } from '../../../model/graph/project-graph-scene';
import { dropGhostOf } from '../../palette/armed-insert';
import { emptySidesOf } from './empty-sides';

function startOf(program: Parameters<typeof projectGraphScene>[0]): {
  readonly node: ReturnType<typeof projectGraphScene>['nodes'][number];
  readonly incoming: readonly string[];
} {
  const scene = projectGraphScene(program, { direction: 'ltr', kinds: STATIC_KIND_LOOKUP });
  const node = scene.nodes.find((candidate) => candidate.family === 'start');
  if (node === undefined) throw new Error('no Start');
  const incoming = scene.edges.filter((edge) => edge.target.nodeId === node.id).map(() => 'x');
  return { node, incoming };
}

describe('empty automation', () => {
  it('offers what starts it on the left and the first step on the right', () => {
    const { node, incoming } = startOf(automation([start()], { triggers: [] }));
    const then = node.rows.find((row) => row.role === 'next');
    expect(emptySidesOf(node, incoming, then)).toEqual({ trigger: true, step: true });
  });

  it('offers nothing once the automation has a trigger and a first step', () => {
    const { node, incoming } = startOf(babyProgram());
    const then = node.rows.find((row) => row.role === 'next');
    expect(emptySidesOf(node, incoming, then)).toEqual({ trigger: false, step: false });
  });
});

describe('drop ghost', () => {
  it('shows a ghost where a pin was dropped while the palette is open', () => {
    const pin = { kind: 'exec' as const, nodeId: 'n1', nodeKey: 'a', port: 'next' };
    expect(
      dropGhostOf({
        phase: 'choosing',
        point: { pin, at: { x: 10, y: 20 }, filtered: true },
        anchor: null,
      }),
    ).toEqual({ nodeId: 'n1', handle: 'x:next', side: 'out', x: 10, y: 20 });
    expect(dropGhostOf({ phase: 'closed' })).toBeNull();
  });

  it('moves the ghost below any card it would cover', () => {
    const card = { x: 0, y: 0, w: 300, h: 100 };
    expect(clearSpot({ x: 50, y: 40 }, [card])).toEqual({ x: 50, y: 116 });
    expect(clearSpot({ x: 400, y: 40 }, [card])).toEqual({ x: 400, y: 40 });
  });
});
