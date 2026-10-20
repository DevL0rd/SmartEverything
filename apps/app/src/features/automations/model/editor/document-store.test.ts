import type { FlowNode, Layout } from '@smarteverything/domain';
import type { Program } from '@smarteverything/flow/program/walk';
import { EMPTY_LAYOUT } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { HISTORY_LIMIT, DocumentStore, pruneLayout, type DocumentState } from './document-store';
import { automation, idSource, repeat, step, uuid } from './editor-fixtures';

function setup(layout: Layout = EMPTY_LAYOUT): Setup {
  const a = step('a');
  const b = step('b');
  const c = step('c');
  const program = automation([a, b, c]);
  const store = new DocumentStore(program, layout, { newId: idSource() });
  const keys = (): string[] => store.state.get().program.body.nodes.map((node) => node.key);
  return { a, b, c, program, store, keys, now: () => store.state.get() };
}

interface Setup {
  a: FlowNode;
  b: FlowNode;
  c: FlowNode;
  program: Program;
  store: DocumentStore;
  keys: () => string[];
  now: () => DocumentState;
}

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
    const store = new DocumentStore(automation([step('a')]));
    const result = store.apply([{ op: 'add', node: { kind: 'device.set' }, in: 'body' }]);
    expect(result.ok).toBe(true);
    expect(store.state.get().layout).toBe(EMPTY_LAYOUT);
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
    expect(now().program.body.nodes[2]?.label).toBeUndefined();
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
    expect(now().program.body.nodes[0]?.label).toBe('L4');
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
    store.editLayout(place(a.id));
    expect(now().layout.nodes[a.id]).toEqual({ x: 10, y: 20 });
    store.undo();
    expect(now().layout).toEqual(EMPTY_LAYOUT);
    store.redo();
    expect(now().layout.nodes[a.id]).toEqual({ x: 10, y: 20 });
  });

  it('restores the layout together with the program', () => {
    const { store, a, now } = setup();
    store.beginGesture();
    store.editLayout(place(a.id));
    store.apply([{ op: 'remove', key: 'a' }]);
    store.endGesture();
    expect(now().layout.nodes).toEqual({});
    store.undo();
    expect(now().layout).toEqual(EMPTY_LAYOUT);
    expect(now().program.body.nodes).toHaveLength(3);
    store.redo();
    expect(now().layout.nodes).toEqual({});
  });

  it('prunes layout entries and frame members of removed steps', () => {
    const a = step('a');
    const b = step('b');
    const program = automation([a, b]);
    const gone = uuid();
    const layout: Layout = {
      nodes: { [a.id]: { x: 1, y: 1 }, [gone]: { x: 2, y: 2 } },
      frames: [{ id: uuid(), title: 'F', color: 'red', nodeIds: [a.id, gone], collapsed: false }],
      comments: [],
    };
    expect(pruneLayout(layout, program)).toEqual({
      ...layout,
      nodes: { [a.id]: { x: 1, y: 1 } },
      frames: [{ ...(layout.frames[0] ?? {}), nodeIds: [a.id] }],
    });
    const clean = { ...layout, nodes: { [a.id]: { x: 1, y: 1 } }, frames: [] };
    expect(pruneLayout(clean, program)).toBe(clean);
    const onlyFrame: Layout = {
      ...clean,
      frames: [{ id: uuid(), title: 'F', color: 'red', nodeIds: [gone], collapsed: false }],
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
    const fresh = automation([step('z')]);
    store.replace(fresh, EMPTY_LAYOUT);
    expect(now()).toMatchObject({ program: fresh, dirty: false, canUndo: false, canRedo: false });
    store.endGesture();
    expect(now().canUndo).toBe(false);
  });
});

describe('selection', () => {
  it('selects, toggles, extends, selects all and clears', () => {
    const { store, a, b, c, now } = setup();
    store.select(b.id);
    expect(now().selection.ids).toEqual([b.id]);
    store.select(b.id);
    store.toggleSelect(c.id);
    expect(now().selection.ids).toEqual([b.id, c.id]);
    store.select(a.id);
    store.extendSelect(c.id);
    expect(now().selection.ids).toEqual([a.id, b.id, c.id]);
    store.selectEverything();
    store.selectEverything();
    expect(now().selection.ids).toEqual([a.id, b.id, c.id]);
    store.clearSelected();
    store.clearSelected();
    expect(now().selection.ids).toEqual([]);
  });

  it('drops removed steps from the selection and brings none back on undo', () => {
    const { store, a, b, now } = setup();
    store.select(a.id);
    store.toggleSelect(b.id);
    store.apply([{ op: 'remove', key: 'a' }]);
    expect(now().selection.ids).toEqual([b.id]);
    store.undo();
    expect(now().selection.ids).toEqual([b.id]);
  });

  it('keeps selection inside nested steps', () => {
    const inner = step('inner');
    const store = new DocumentStore(automation([repeat('loop', [inner])]));
    store.select(inner.id);
    expect(store.state.get().selection.ids).toEqual([inner.id]);
  });
});
