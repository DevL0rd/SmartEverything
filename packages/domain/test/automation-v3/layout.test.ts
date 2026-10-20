import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { EMPTY_LAYOUT, LAYOUT, NODE_LAYOUT } from '../../src/automation-v3/layout';

const A = '00000000-0000-4000-8000-00000000000a';
const B = '00000000-0000-4000-8000-00000000000b';
const C = '00000000-0000-4000-8000-00000000000c';

describe('layout', () => {
  it('accepts the empty layout', () => {
    expect(LAYOUT.parse(EMPTY_LAYOUT)).toEqual(EMPTY_LAYOUT);
  });

  it('accepts positions, frames and comments', () => {
    const layout = {
      nodes: { [A]: { x: 10, y: -4.5, collapsed: true }, [B]: { x: 0, y: 0 } },
      frames: [{ id: C, title: 'Lights', color: 'amber', nodeIds: [A, B], collapsed: false }],
      comments: [{ id: B, text: 'why', x: 1, y: 2, w: 240 }],
    };
    expect(LAYOUT.parse(layout)).toEqual(layout);
  });

  it('round-trips any finite positions', () => {
    fc.assert(
      fc.property(
        fc.double({ noNaN: true, noDefaultInfinity: true }),
        fc.double({ noNaN: true, noDefaultInfinity: true }),
        (x, y) => {
          const layout = { nodes: { [A]: { x, y } }, frames: [], comments: [] };
          expect(LAYOUT.parse(layout)).toEqual(layout);
        },
      ),
    );
  });

  it('rejects non-finite coordinates, bad keys and unknown fields', () => {
    expect(NODE_LAYOUT.safeParse({ x: Number.POSITIVE_INFINITY, y: 0 }).success).toBe(false);
    expect(NODE_LAYOUT.safeParse({ x: 0 }).success).toBe(false);
    expect(NODE_LAYOUT.safeParse({ x: 0, y: 0, z: 1 }).success).toBe(false);
    expect(LAYOUT.safeParse({ ...EMPTY_LAYOUT, nodes: { n1: { x: 0, y: 0 } } }).success).toBe(
      false,
    );
    expect(LAYOUT.safeParse({ nodes: {}, frames: [] }).success).toBe(false);
  });

  it('rejects a comment without width', () => {
    const comment = { id: A, text: '', x: 0, y: 0, w: 0 };
    expect(LAYOUT.safeParse({ ...EMPTY_LAYOUT, comments: [comment] }).success).toBe(false);
  });

  it('rejects duplicate frame ids, comment ids and frame members', () => {
    const frame = { id: A, title: 't', color: 'red', nodeIds: [B], collapsed: false };
    const comment = { id: A, text: 't', x: 0, y: 0, w: 5 };
    expect(LAYOUT.safeParse({ ...EMPTY_LAYOUT, frames: [frame, frame] }).success).toBe(false);
    expect(LAYOUT.safeParse({ ...EMPTY_LAYOUT, comments: [comment, comment] }).success).toBe(false);
    const doubled = { ...frame, nodeIds: [B, B] };
    const result = LAYOUT.safeParse({ ...EMPTY_LAYOUT, frames: [doubled] });
    expect(result.success).toBe(false);
  });
});
