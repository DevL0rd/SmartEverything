import { STATIC_KIND_LOOKUP } from '@smarteverything/domain';
import type { Layout, ProgramV4 } from '@smarteverything/domain';
import { EMPTY_LAYOUT } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { automation, idOf, note, start } from '../graph/graph-scene-fixtures';
import { HISTORY_LIMIT, DocumentStore, pruneLayout, type DocumentState } from './document-store';
import { idSource } from './editor-fixtures';

function chain(...keys: string[]): ProgramV4 {
  const nodes = keys.map((key, at) => note(key, keys[at + 1]));
  return automation([start(keys[0]), ...nodes], { triggers: [] });
}

interface Setup {
  a: string;
  b: string;
  c: string;
  store: DocumentStore;
  keys: () => string[];
  now: () => DocumentState;
}

function setup(layout: Layout = EMPTY_LAYOUT): Setup {
  const store = new DocumentStore(chain('a', 'b', 'c'), STATIC_KIND_LOOKUP, layout, {
    newId: idSource(),
  });
  const keys = (): string[] =>
    store.state
      .get()
      .program.nodes.filter((node) => node.kind !== 'flow.start')
      .map((node) => node.key)
      .sort();
  return { a: idOf('a'), b: idOf('b'), c: idOf('c'), store, keys, now: () => store.state.get() };
}

const labelOf = (state: DocumentState, key: string): string | undefined =>
  state.program.nodes.find((node) => node.key === key)?.label;

describe('applying ops', () => {
  it('applies through the reducer and marks the document dirty', () => {
    const { store, keys, now } = setup();
    expect(now().dirty).toBe(false);
    const result = store.apply([{ op: 'remove', key: 'b' }]);
    expect(result.ok).toBe(true);
    expect(keys()).toEqual(['a', 'c']);
    expect(now()).toMatchObject({ dirty: true, canUndo: true, canRedo: false, refusal: null });
  });

  it('keeps the program and reports a refusal, cleared by the next change', () => {
    const { store, keys, now } = setup();
    const before = now().program;
    const result = store.apply([{ op: 'remove', key: 'nope' }]);
    expect(result.ok).toBe(false);
    expect(now().program).toBe(before);
    expect(now().refusal).toMatchObject({ code: 'unknown_key', opIndex: 0 });
    expect(now().canUndo).toBe(false);
    store.apply([{ op: 'remove', key: 'a' }]);
    expect(now().refusal).toBeNull();
    store.apply([{ op: 'remove', key: 'nope' }]);
    store.clearRefusal();
    expect(now().refusal).toBeNull();
    store.clearRefusal();
    expect(keys()).toEqual(['b', 'c']);
  });

  it('uses the default id source without options', () => {
    const store = new DocumentStore(chain('a'), STATIC_KIND_LOOKUP);
    const result = store.apply([{ op: 'add', node: { kind: 'notify.feed' } }]);
    expect(result.ok).toBe(true);
    expect(store.state.get().layout).toBe(EMPTY_LAYOUT);
  });

  it('accepts an edit that leaves structure problems so the user can finish it', () => {
    const { store, now } = setup();
    const result = store.apply([{ op: 'disconnect', from: 'start', port: 'next' }]);
    expect(result.ok).toBe(true);
    expect(now().refusal).toBeNull();
  });
});

describe('undo and redo', () => {
  it('undoes and redoes one edit at a time', () => {
    const { store, keys, now } = setup();
    store.apply([{ op: 'remove', key: 'a' }]);
    store.apply([{ op: 'remove', key: 'b' }]);
    store.undo();
    expect(keys()).toEqual(['b', 'c']);
    expect(now()).toMatchObject({ canUndo: true, canRedo: true });
    store.undo();
    expect(keys()).toEqual(['a', 'b', 'c']);
    expect(now()).toMatchObject({ canUndo: false, canRedo: true });
    store.redo();
    store.redo();
    expect(keys()).toEqual(['c']);
    expect(now().canRedo).toBe(false);
  });

  it('does nothing with an empty history', () => {
    const { store, now } = setup();
    const before = now();
    store.undo();
    store.redo();
    expect(now()).toBe(before);
  });

  it('drops the redo history on a new edit', () => {
    const { store, keys, now } = setup();
    store.apply([{ op: 'remove', key: 'a' }]);
    store.undo();
    store.apply([{ op: 'remove', key: 'c' }]);
    expect(now().canRedo).toBe(false);
    expect(keys()).toEqual(['a', 'b']);
  });

  it('groups everything in one gesture into one undo step', () => {
    const { store, keys, now } = setup();
    store.beginGesture();
    store.apply([{ op: 'remove', key: 'a' }]);
    store.beginGesture();
    store.apply([{ op: 'remove', key: 'b' }]);
    store.endGesture();
    expect(now().canUndo).toBe(true);
    store.apply([{ op: 'set', key: 'c', label: 'Last' }]);
    store.endGesture();
    expect(keys()).toEqual(['c']);
    store.undo();
    expect(keys()).toEqual(['a', 'b', 'c']);
    expect(labelOf(now(), 'c')).toBeUndefined();
    expect(now().canUndo).toBe(false);
    store.redo();
    expect(keys()).toEqual(['c']);
  });

  it('closes an open gesture before undoing and ignores a stray end', () => {
    const { store, keys, now } = setup();
    store.endGesture();
    store.beginGesture();
    store.apply([{ op: 'remove', key: 'a' }]);
    store.undo();
    expect(keys()).toEqual(['a', 'b', 'c']);
    store.apply([{ op: 'remove', key: 'b' }]);
    expect(now().canUndo).toBe(true);
    store.endGesture();
  });

  it('commits an empty gesture without a history step', () => {
    const { store, now } = setup();
    store.beginGesture();
    store.endGesture();
    expect(now().canUndo).toBe(false);
  });

  it('keeps at most the history limit', () => {
    const { store, now } = setup();
    for (let n = 0; n < HISTORY_LIMIT + 5; n += 1) {
      store.apply([{ op: 'set', key: 'a', label: `L${String(n)}` }]);
    }
    for (let n = 0; n < HISTORY_LIMIT + 5; n += 1) store.undo();
    expect(labelOf(now(), 'a')).toBe('L4');
    expect(now().canUndo).toBe(false);
  });
});

describe('layout', () => {
  const place =
    (id: string) =>
    (layout: Layout): Layout => ({
      ...layout,
      nodes: { ...layout.nodes, [id]: { x: 10, y: 20 } },
    });

  it('edits the layout as an undoable step and ignores unchanged results', () => {
    const { store, a, now } = setup();
    store.editLayout((layout) => layout);
    expect(now().canUndo).toBe(false);
    store.editLayout(place(a));
    expect(now().layout.nodes[a]).toEqual({ x: 10, y: 20 });
    store.undo();
    expect(now().layout).toEqual(EMPTY_LAYOUT);
    store.redo();
    expect(now().layout.nodes[a]).toEqual({ x: 10, y: 20 });
  });

  it('restores the layout together with the program', () => {
    const { store, a, now } = setup();
    store.beginGesture();
    store.editLayout(place(a));
    store.apply([{ op: 'remove', key: 'a' }]);
    store.endGesture();
    expect(now().layout.nodes).toEqual({});
    store.undo();
    expect(now().layout).toEqual(EMPTY_LAYOUT);
    expect(now().program.nodes).toHaveLength(4);
    store.redo();
    expect(now().layout.nodes).toEqual({});
  });

  it('prunes layout entries and frame members of removed steps', () => {
    const program = chain('a', 'b');
    const a = idOf('a');
    const gone = idOf('gone');
    const layout: Layout = {
      nodes: { [a]: { x: 1, y: 1 }, [gone]: { x: 2, y: 2 } },
      frames: [
        { id: idOf('frame'), title: 'F', color: 'red', nodeIds: [a, gone], collapsed: false },
      ],
      comments: [],
    };
    expect(pruneLayout(layout, program)).toEqual({
      ...layout,
      nodes: { [a]: { x: 1, y: 1 } },
      frames: [{ ...(layout.frames[0] ?? {}), nodeIds: [a] }],
    });
    const clean = { ...layout, nodes: { [a]: { x: 1, y: 1 } }, frames: [] };
    expect(pruneLayout(clean, program)).toBe(clean);
    const onlyFrame: Layout = {
      ...clean,
      frames: [{ id: idOf('frame'), title: 'F', color: 'red', nodeIds: [gone], collapsed: false }],
    };
    expect(pruneLayout(onlyFrame, program).frames[0]?.nodeIds).toEqual([]);
    const nodesOnly: Layout = { ...EMPTY_LAYOUT, nodes: { [gone]: { x: 0, y: 0 } } };
    expect(pruneLayout(nodesOnly, program).nodes).toEqual({});
  });
});

describe('saving', () => {
  it('tracks a save in flight and what it covered', () => {
    const { store, now } = setup();
    store.apply([{ op: 'remove', key: 'a' }]);
    const snapshot = store.beginSave();
    expect(now().saving).toBe(true);
    expect(snapshot.program).toBe(now().program);
    store.apply([{ op: 'remove', key: 'b' }]);
    store.finishSave(snapshot.version, true);
    expect(now()).toMatchObject({ saving: false, dirty: true });
    const second = store.beginSave();
    store.finishSave(second.version, true);
    expect(now().dirty).toBe(false);
    store.undo();
    expect(now().dirty).toBe(true);
  });

  it('stays dirty after a failed save', () => {
    const { store, now } = setup();
    store.apply([{ op: 'remove', key: 'a' }]);
    const snapshot = store.beginSave();
    store.finishSave(snapshot.version, false);
    expect(now()).toMatchObject({ saving: false, dirty: true });
  });

  it('replaces the document clean with no history', () => {
    const { store, now } = setup();
    store.apply([{ op: 'remove', key: 'a' }]);
    store.beginGesture();
    store.apply([{ op: 'remove', key: 'b' }]);
    const fresh = chain('z');
    store.replace(fresh, EMPTY_LAYOUT);
    expect(now()).toMatchObject({ program: fresh, dirty: false, canUndo: false, canRedo: false });
    store.endGesture();
    expect(now().canUndo).toBe(false);
  });
});

describe('selection', () => {
  it('selects, toggles, extends, selects all and clears', () => {
    const { store, a, b, c, now } = setup();
    const start = idOf('start');
    store.select(b);
    expect(now().selection.ids).toEqual([b]);
    store.select(b);
    store.toggleSelect(c);
    expect(now().selection.ids).toEqual([b, c]);
    store.select(a);
    store.extendSelect(c);
    expect(now().selection.ids).toEqual([a, b, c]);
    store.selectEverything();
    store.selectEverything();
    expect(now().selection.ids).toEqual([start, a, b, c]);
    store.clearSelected();
    store.clearSelected();
    expect(now().selection.ids).toEqual([]);
  });

  it('drops removed steps from the selection and brings none back on undo', () => {
    const { store, a, b, now } = setup();
    store.select(a);
    store.toggleSelect(b);
    store.apply([{ op: 'remove', key: 'a' }]);
    expect(now().selection.ids).toEqual([b]);
    store.undo();
    expect(now().selection.ids).toEqual([b]);
  });
});
