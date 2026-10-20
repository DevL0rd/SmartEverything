import type { AutomationV3, FlowNode } from '@smarteverything/domain';
import { EMPTY_LAYOUT } from '@smarteverything/domain';
import { describe, expect, it, vi } from 'vitest';
import { projectScene } from '../../model/canvas/project-scene';
import {
  Ids,
  WIDE,
  add,
  automation,
  note,
  scope,
  setLight,
  timeTrigger,
} from '../../model/canvas/canvas-fixtures';
import type { CanvasIntent, Scene, SceneNode } from '../../model/canvas/contract';
import { DocumentStore } from '../../model/editor/document-store';
import { idSource } from '../../model/editor/editor-fixtures';
import { applyIntent, parseIntent } from './apply-intents';
import type { ClipboardPort } from './clipboard-port';
import { REFUSED_ACROSS, REFUSED_BACKWARD, REFUSED_EXEC_END, REFUSED_GONE } from './connect-intent';
import { REFUSED_PASTE } from './edit-intents';
import { InvalidCanvasIntentError, type HostActions, type IntentEnv } from './intent-env';
import type { MovePatch } from './move-intent';

interface Fixture {
  readonly store: DocumentStore;
  readonly env: IntentEnv;
  readonly actions: { [Name in keyof HostActions]: ReturnType<typeof vi.fn> };
  readonly clipboard: { text: string };
  readonly ready: ReturnType<typeof vi.fn>;
  readonly nodes: Record<'a' | 'b' | 'level' | 'dim' | 'each' | 'inner', FlowNode>;
  readonly scene: () => Scene;
  readonly send: (intent: CanvasIntent) => Promise<void>;
}

function program(): { readonly program: AutomationV3; readonly nodes: Fixture['nodes'] } {
  const ids = new Ids(1);
  const a = setLight(ids, null);
  const b = setLight(ids, null);
  const level = add(ids, null);
  const dim = setLight(ids, `${level.key}.result`);
  const inner = note(ids, 'Inside');
  const each: FlowNode = {
    ...ids.next(),
    kind: 'flow.for_each',
    ports: { items: { lit: ['x', 'y'] } },
    scopes: { body: scope([inner]) },
  };
  return {
    program: automation([a, b, level, dim, each]),
    nodes: { a, b, level, dim, each, inner },
  };
}

function fixture(mode: Scene['mode'] = 'wide'): Fixture {
  const built = program();
  const store = new DocumentStore(built.program, EMPTY_LAYOUT, { newId: idSource() });
  const scene = (): Scene =>
    projectScene(store.state.get().program, {
      ...WIDE,
      mode,
      layout: store.state.get().layout,
      ...(mode === 'compact' ? { canvasWidth: 375 } : {}),
    });
  const clipboard = { text: '' };
  const port: ClipboardPort = {
    read: () => Promise.resolve(clipboard.text),
    write: (text) => {
      clipboard.text = text;
      return Promise.resolve();
    },
  };
  const actions = {
    openNode: vi.fn(),
    insertOnEdge: vi.fn(),
    openSlot: vi.fn(),
    portDropEmpty: vi.fn(),
    groupSelection: vi.fn(),
    viewportSettled: vi.fn(),
    refused: vi.fn(),
  };
  const ready = vi.fn();
  const env: IntentEnv = { store, scene, actions, clipboard: port, ready };
  return {
    store,
    env,
    actions,
    clipboard,
    ready,
    nodes: built.nodes,
    scene,
    send: (intent) => applyIntent(intent, env),
  };
}

function keys(store: DocumentStore): readonly string[] {
  return store.state.get().program.body.nodes.map((node) => node.key);
}

function sceneNode(scene: Scene, id: string): SceneNode {
  const found = scene.nodes.find((node) => node.id === id);
  if (found === undefined) throw new Error(`scene has no node ${id}`);
  return found;
}

describe('parsing what the canvas sends', () => {
  it('accepts an intent of the contract', () => {
    expect(parseIntent({ type: 'select', ids: ['x'] })).toEqual({ type: 'select', ids: ['x'] });
  });

  it('rejects an unknown type and an extra field, naming the problem', () => {
    expect(() => parseIntent({ type: 'explode' })).toThrow(InvalidCanvasIntentError);
    expect(() => parseIntent({ type: 'delete', ids: [] })).toThrow(/ids/);
    expect(() => parseIntent({ type: 'openNode', id: 'x', extra: true })).toThrow(
      InvalidCanvasIntentError,
    );
    expect(() => parseIntent(null)).toThrow(InvalidCanvasIntentError);
  });
});

describe('selecting', () => {
  it('selects the program nodes it is given and drops ids the program does not hold', async () => {
    const { send, store, nodes } = fixture();
    await send({ type: 'select', ids: [nodes.a.id, 'lane:somewhere', nodes.b.id, nodes.a.id] });
    expect(store.state.get().selection.ids).toEqual([nodes.a.id, nodes.b.id]);
  });

  it('changes nothing, and wakes nobody, when the selection is already that set', async () => {
    const { send, store, nodes } = fixture();
    await send({ type: 'select', ids: [nodes.a.id, nodes.b.id] });
    const wake = vi.fn();
    store.state.subscribe(wake);
    await send({ type: 'select', ids: [nodes.b.id, nodes.a.id] });
    expect(wake).not.toHaveBeenCalled();
  });

  it('clears the selection for an empty list', async () => {
    const { send, store, nodes } = fixture();
    await send({ type: 'select', ids: [nodes.a.id] });
    await send({ type: 'select', ids: [] });
    expect(store.state.get().selection.ids).toEqual([]);
  });
});

describe('connecting a value', () => {
  it('writes the wire as a reference on the consumer port, one undo step', async () => {
    const { send, store, nodes } = fixture();
    await send({
      type: 'connect',
      connection: {
        from: { nodeId: nodes.level.id, port: 'result' },
        to: { nodeId: nodes.b.id, port: 'to' },
      },
    });
    const written = store.state.get().program.body.nodes.find((node) => node.key === nodes.b.key);
    expect(written?.ports?.['to']).toEqual({ wire: { from: nodes.level.key, port: 'result' } });
    store.undo();
    const restored = store.state.get().program.body.nodes.find((node) => node.key === nodes.b.key);
    expect(restored?.ports?.['to']).toEqual({ lit: 75 });
  });

  it('refuses a wire from a node that left the canvas', async () => {
    const { send, actions, store, nodes } = fixture();
    const before = store.state.get().program;
    await send({
      type: 'connect',
      connection: {
        from: { nodeId: 'gone', port: 'result' },
        to: { nodeId: nodes.b.id, port: 'to' },
      },
    });
    expect(actions.refused).toHaveBeenCalledWith(REFUSED_GONE);
    expect(store.state.get().program).toBe(before);
  });
});

describe('connecting steps', () => {
  const link = (from: FlowNode, to: FlowNode): CanvasIntent => ({
    type: 'connect',
    connection: { from: { nodeId: from.id, port: 'next' }, to: { nodeId: to.id, port: 'in' } },
  });

  it('puts the target right after the source in the same lane', async () => {
    const { send, store, nodes } = fixture();
    await send(link(nodes.a, nodes.dim));
    expect(keys(store)).toEqual([
      nodes.a.key,
      nodes.dim.key,
      nodes.b.key,
      nodes.level.key,
      nodes.each.key,
    ]);
  });

  it('refuses a wire that runs backwards', async () => {
    const { send, store, actions, nodes } = fixture();
    const before = store.state.get().program;
    await send(link(nodes.dim, nodes.a));
    expect(actions.refused).toHaveBeenCalledWith(REFUSED_BACKWARD);
    expect(store.state.get().program).toBe(before);
  });

  it('refuses a wire into another lane', async () => {
    const { send, actions, nodes } = fixture();
    await send(link(nodes.a, nodes.inner));
    expect(actions.refused).toHaveBeenCalledWith(REFUSED_ACROSS);
  });

  it('refuses a wire that does not join two steps', async () => {
    const { send, actions, nodes } = fixture();
    await send({
      type: 'connect',
      connection: {
        from: { nodeId: timeTrigger(0).id, port: 'next' },
        to: { nodeId: nodes.a.id, port: 'in' },
      },
    });
    expect(actions.refused).toHaveBeenCalledWith(REFUSED_EXEC_END);
  });
});

describe('moving nodes', () => {
  const to = (node: SceneNode, dx: number, dy: number): MovePatch => ({
    id: node.id,
    x: node.x + dx,
    y: node.y + dy,
  });

  it('stores the drag as an offset from the automatic position and adds the next drag', async () => {
    const { send, store, scene, nodes } = fixture();
    await send({ type: 'move', patches: [to(sceneNode(scene(), nodes.b.id), 12, -8)] });
    expect(store.state.get().layout.nodes[nodes.b.id]).toEqual({ x: 12, y: -8 });
    await send({ type: 'move', patches: [to(sceneNode(scene(), nodes.b.id), 3, 4)] });
    expect(store.state.get().layout.nodes[nodes.b.id]).toEqual({ x: 15, y: -4 });
    expect(sceneNode(scene(), nodes.b.id).x).toBe(sceneNode(scene(), nodes.a.id).x + 15);
  });

  it('is one undo step and leaves the program alone', async () => {
    const { send, store, scene, nodes } = fixture();
    const program = store.state.get().program;
    await send({ type: 'move', patches: [to(sceneNode(scene(), nodes.a.id), 5, 5)] });
    expect(store.state.get().program).toBe(program);
    store.undo();
    expect(store.state.get().layout.nodes).toEqual({});
  });

  it('gives a container the whole drag and leaves a child dragged with it alone', async () => {
    const { send, store, scene, nodes } = fixture();
    const shown = scene();
    await send({
      type: 'move',
      patches: [
        to(sceneNode(shown, nodes.each.id), 30, 10),
        to(sceneNode(shown, nodes.inner.id), 30, 10),
      ],
    });
    expect(store.state.get().layout.nodes).toEqual({ [nodes.each.id]: { x: 30, y: 10 } });
    expect(sceneNode(scene(), nodes.inner.id).x).toBe(sceneNode(shown, nodes.inner.id).x + 30);
  });

  it('gives a child dragged alone its own offset', async () => {
    const { send, store, scene, nodes } = fixture();
    await send({ type: 'move', patches: [to(sceneNode(scene(), nodes.inner.id), 6, 0)] });
    expect(store.state.get().layout.nodes).toEqual({ [nodes.inner.id]: { x: 6, y: 0 } });
  });

  it('ignores ids that are not program nodes and drags that did not move', async () => {
    const { send, store, scene, nodes } = fixture();
    const lane = scene().nodes.find((node) => node.role === 'lane');
    if (lane === undefined) throw new Error('the fixture has no lane');
    const undoable = store.state.get().canUndo;
    await send({
      type: 'move',
      patches: [to(lane, 9, 9), to(sceneNode(scene(), nodes.a.id), 0, 0)],
    });
    expect(store.state.get().canUndo).toBe(undoable);
  });

  it('ignores a drag in the compact layout, which is derived and never stored', async () => {
    const { send, store, scene, nodes } = fixture('compact');
    await send({ type: 'move', patches: [to(sceneNode(scene(), nodes.a.id), 9, 9)] });
    expect(store.state.get().layout.nodes).toEqual({});
  });
});

describe('deleting', () => {
  it('removes the nodes and the removal undoes in one step', async () => {
    const { send, store, nodes } = fixture();
    await send({ type: 'delete', ids: [nodes.a.id, nodes.b.id] });
    expect(keys(store)).toEqual([nodes.level.key, nodes.dim.key, nodes.each.key]);
    store.undo();
    expect(keys(store)).toContain(nodes.a.key);
  });

  it('leaves the document untouched for ids that are not nodes', async () => {
    const { send, store } = fixture();
    await send({ type: 'delete', ids: ['lane:somewhere'] });
    expect(store.state.get().canUndo).toBe(false);
  });
});

describe('shortcuts', () => {
  it('undoes and redoes through the one history', async () => {
    const { send, store, nodes } = fixture();
    await send({ type: 'delete', ids: [nodes.a.id] });
    await send({ type: 'shortcut', name: 'undo' });
    expect(keys(store)).toContain(nodes.a.key);
    await send({ type: 'shortcut', name: 'redo' });
    expect(keys(store)).not.toContain(nodes.a.key);
  });

  it('selects everything', async () => {
    const { send, store } = fixture();
    await send({ type: 'shortcut', name: 'selectAll' });
    expect(store.state.get().selection.ids.length).toBeGreaterThan(4);
  });

  it('copies the selection to the clipboard and pastes it after the selected step', async () => {
    const { send, store, clipboard, nodes } = fixture();
    await send({ type: 'select', ids: [nodes.a.id] });
    await send({ type: 'shortcut', name: 'copy' });
    expect(clipboard.text).toContain('smarteverything.automation-nodes');
    await send({ type: 'shortcut', name: 'paste' });
    expect(keys(store)).toHaveLength(6);
    expect(keys(store)[0]).toBe(nodes.a.key);
    expect(keys(store)[1]).not.toBe(nodes.b.key);
  });

  it('says so when the clipboard holds something else', async () => {
    const { send, store, actions, clipboard } = fixture();
    clipboard.text = 'just some text';
    await send({ type: 'shortcut', name: 'paste' });
    expect(actions.refused).toHaveBeenCalledWith(REFUSED_PASTE);
    expect(store.state.get().canUndo).toBe(false);
  });

  it('cuts: copies, then removes', async () => {
    const { send, store, clipboard, nodes } = fixture();
    await send({ type: 'select', ids: [nodes.b.id] });
    await send({ type: 'shortcut', name: 'cut' });
    expect(clipboard.text).not.toBe('');
    expect(keys(store)).not.toContain(nodes.b.key);
  });

  it('duplicates the selection right after itself', async () => {
    const { send, store, nodes } = fixture();
    await send({ type: 'select', ids: [nodes.b.id] });
    await send({ type: 'shortcut', name: 'duplicate' });
    expect(keys(store)).toHaveLength(6);
    expect(keys(store)[1]).toBe(nodes.b.key);
  });

  it('hands grouping to the host with the selection', async () => {
    const { send, actions, nodes } = fixture();
    await send({ type: 'select', ids: [nodes.a.id, nodes.b.id] });
    await send({ type: 'shortcut', name: 'group' });
    expect(actions.groupSelection).toHaveBeenCalledWith([nodes.a.id, nodes.b.id]);
  });
});

describe('intents that open something', () => {
  it('routes each to the host without touching the document', async () => {
    const { send, actions, store, ready } = fixture();
    const point = { x: 3, y: 4 };
    const viewport = { x: 1, y: 2, zoom: 0.5 };
    await send({ type: 'openNode', id: 'n' });
    await send({ type: 'insertOnEdge', edgeId: 'e' });
    await send({ type: 'openSlot', slotId: 's' });
    await send({ type: 'portDropEmpty', from: { nodeId: 'n', port: 'p' }, point });
    await send({ type: 'viewportSettled', viewport });
    await send({ type: 'ready', metrics: { width: 800, height: 600 } });
    expect(actions.openNode).toHaveBeenCalledWith('n');
    expect(actions.insertOnEdge).toHaveBeenCalledWith('e');
    expect(actions.openSlot).toHaveBeenCalledWith('s');
    expect(actions.portDropEmpty).toHaveBeenCalledWith({ nodeId: 'n', port: 'p' }, point);
    expect(actions.viewportSettled).toHaveBeenCalledWith(viewport);
    expect(ready).toHaveBeenCalledWith({ width: 800, height: 600 });
    expect(store.state.get().canUndo).toBe(false);
  });
});
