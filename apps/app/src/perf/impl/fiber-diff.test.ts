import { describe, expect, it } from 'vitest';
import { changedHooks, changedProps, nameOf, reasonOf } from './fiber-diff';
import { collect, nextEpoch, type RenderSink } from './fibers';
import type { RenderReason } from './fiber-diff';

function hook(state: unknown, next: unknown = null): Record<string, unknown> {
  return { memoizedState: state, next };
}

describe('nameOf', () => {
  it('reads function, display, memo and forwardRef names', () => {
    function Card(): null {
      return null;
    }
    expect(nameOf(Card)).toBe('Card');
    expect(nameOf({ type: Card })).toBe('Card');
    expect(nameOf({ render: Card })).toBe('Card');
    expect(nameOf({ displayName: 'Named', type: Card })).toBe('Named');
    expect(nameOf(undefined)).toBe('anon');
  });
});

describe('changedProps', () => {
  it('lists the keys that differ by identity', () => {
    const shared = {};
    expect(changedProps({ a: 1, b: shared, c: 1 }, { a: 2, b: shared, d: 1 })).toEqual([
      'a',
      'c',
      'd',
    ]);
  });

  it('is empty for the same object', () => {
    const props = { a: 1 };
    expect(changedProps(props, props)).toEqual([]);
  });
});

describe('changedHooks', () => {
  it('flags state hooks that changed and ignores effects', () => {
    const effect = { tag: 1, create: (): null => null };
    const before = hook(1, hook(effect, hook('x')));
    const after = hook(2, hook({ ...effect }, hook('x')));
    expect(changedHooks(before, after)).toEqual(['h0']);
  });
});

describe('reasonOf', () => {
  const base = { tag: 0, flags: 1, type: null, duration: 0, fresh: false };
  it('reports a parent render when nothing own changed', () => {
    const props = {};
    const state = hook(1);
    const reason = reasonOf({ ...base, props, state }, { ...base, props, state });
    expect(reason).toEqual({ props: [], hooks: [], parent: true });
  });

  it('reports class state changes', () => {
    const reason = reasonOf(
      { ...base, tag: 1, props: {}, state: { a: 2 } },
      { ...base, tag: 1, props: {}, state: { a: 1 } },
    );
    expect(reason.hooks).toEqual(['state']);
  });
});

function fiber(fields: Record<string, unknown>): Record<string, unknown> {
  return {
    tag: 0,
    flags: 0,
    type: null,
    memoizedProps: {},
    memoizedState: null,
    actualDuration: 0,
    child: null,
    sibling: null,
    alternate: null,
    ...fields,
  };
}

interface Seen {
  readonly name: string;
  readonly instance: number;
  readonly self: number;
  readonly reason: RenderReason | null;
}

function gather(root: unknown): { totals: ReturnType<typeof collect>; seen: Seen[] } {
  const seen: Seen[] = [];
  const sink: RenderSink = {
    render: (name, instance, self, reason) => {
      seen.push({ name, instance, self, reason });
    },
  };
  return { totals: collect(root, sink, 0), seen };
}

describe('collect', () => {
  it('counts rendered components with self time and prunes unchanged subtrees', () => {
    function Parent(): null {
      return null;
    }
    function Leaf(): null {
      return null;
    }
    function Idle(): null {
      return null;
    }
    const reusedChild = fiber({ type: Idle, flags: 1, actualDuration: 9 });
    const idleBefore = fiber({ type: Idle, child: reusedChild });
    const idle = fiber({ type: Idle, child: reusedChild, alternate: idleBefore });
    const leafBefore = fiber({ type: Leaf, memoizedProps: { n: 1 } });
    const leaf = fiber({
      type: Leaf,
      flags: 1,
      memoizedProps: { n: 2 },
      actualDuration: 2,
      alternate: leafBefore,
      sibling: idle,
    });
    const parentBefore = fiber({ type: Parent, child: leafBefore });
    const parent = fiber({
      type: Parent,
      flags: 1,
      actualDuration: 5,
      child: leaf,
      alternate: parentBefore,
    });
    const root = { current: fiber({ tag: 3, actualDuration: 6, child: parent }) };
    const { totals, seen } = gather(root);
    expect(totals?.rootMs).toBe(6);
    expect(totals?.timed).toBe(true);
    expect(seen.map((item) => item.name)).toEqual(['Parent', 'Leaf']);
    const leafRender = seen.find((item) => item.name === 'Leaf');
    expect(leafRender?.reason?.props).toEqual(['n']);
    expect(leafRender?.self).toBe(2);
    expect(seen.find((item) => item.name === 'Parent')?.self).toBe(3);
    expect(totals?.top).toBe('Parent');
  });

  it('skips the reason of a render when the commit is below the explain threshold', () => {
    function Row(): null {
      return null;
    }
    const row = fiber({ type: Row, flags: 1, actualDuration: 1, alternate: fiber({ type: Row }) });
    const root = { current: fiber({ tag: 3, actualDuration: 2, child: row }) };
    const seen: (RenderReason | null)[] = [];
    collect(root, { render: (_n, _i, _s, reason) => seen.push(reason) }, 8);
    expect(seen).toEqual([null]);
  });

  it('counts renders per instance across commits and restarts on a new epoch', () => {
    function Row(): null {
      return null;
    }
    const before = fiber({ type: Row });
    const row = fiber({ type: Row, flags: 1, alternate: before });
    const root = { current: fiber({ tag: 3, child: row }) };
    expect(gather(root).seen[0]?.instance).toBe(1);
    expect(gather(root).seen[0]?.instance).toBe(2);
    nextEpoch();
    expect(gather(root).seen[0]?.instance).toBe(1);
  });

  it('returns null for something that is not a root', () => {
    expect(gather(null).totals).toBeNull();
    expect(gather({}).totals).toBeNull();
  });
});
