import { STATIC_KIND_LOOKUP } from '@smarteverything/domain';
import { EMPTY_LAYOUT, NODE_REGISTRY } from '@smarteverything/domain';
import type { CheckContext } from '@smarteverything/flow/check/shapes';
import { describe, expect, it, vi, type Mock } from 'vitest';
import { DocumentStore } from '../../model/editor/document-store';
import { automation, idOf, note, start } from '../../model/graph/graph-scene-fixtures';
import {
  InvalidCanvasIntentError,
  applyCanvasIntent,
  applyViewIntent,
  parseCanvasIntent,
  type CanvasEnv,
  type ViewActions,
} from './canvas-intents';
import type { HostActions } from './host-actions';

const check: CheckContext = {
  kinds: (id) => NODE_REGISTRY.get(id),
  automations: () => undefined,
  scopeOutputs: () => [],
  references: () => false,
  functions: () => undefined,
  secrets: new Set(),
};

type MockedActions = { readonly [K in keyof HostActions]: Mock<HostActions[K]> };

function actionsOf(): MockedActions {
  return {
    openNode: vi.fn<HostActions['openNode']>(),
    dropEmpty: vi.fn<HostActions['dropEmpty']>(),
    insertOnWire: vi.fn<HostActions['insertOnWire']>(),
    addTrigger: vi.fn<HostActions['addTrigger']>(),
    escape: vi.fn<HostActions['escape']>(),
    stepPass: vi.fn<HostActions['stepPass']>(),
    groupSelection: vi.fn<HostActions['groupSelection']>(),
  };
}

function setup(): {
  readonly store: DocumentStore;
  readonly env: CanvasEnv;
  readonly actions: MockedActions;
  readonly clip: { text: string };
} {
  const store = new DocumentStore(
    automation([start('a'), note('a', 'b'), note('b', 'c'), note('c')], { triggers: [] }),
    STATIC_KIND_LOOKUP,
    EMPTY_LAYOUT,
  );
  const clip = { text: '' };
  const actions = actionsOf();
  let count = 0;
  return {
    store,
    actions,
    clip,
    env: {
      actions,
      measure: vi.fn<CanvasEnv['measure']>(),
      intent: {
        store,
        clipboard: {
          read: () => Promise.resolve(clip.text),
          write: (text): Promise<void> => {
            clip.text = text;
            return Promise.resolve();
          },
        },
        runtime: {
          newId: (): string => {
            count += 1;
            return `00000000-0000-4000-9000-${String(count).padStart(12, '0')}`;
          },
          density: 'touch',
          direction: 'ltr',
          check,
          kinds: NODE_REGISTRY,
          sizes: new Map(),
        },
      },
    },
  };
}

const end = (key: string, handle: string): { nodeId: string; handle: string } => ({
  nodeId: idOf(key),
  handle,
});

describe('parseCanvasIntent', () => {
  it('accepts every intent the canvas sends and rejects anything else', () => {
    expect(parseCanvasIntent({ type: 'escape' })).toEqual({ type: 'escape' });
    expect(parseCanvasIntent({ type: 'shortcut', name: 'copy' })).toEqual({
      type: 'shortcut',
      name: 'copy',
    });
    expect(() => parseCanvasIntent({ type: 'shortcut', name: 'format' })).toThrow(
      InvalidCanvasIntentError,
    );
    expect(() => parseCanvasIntent({ type: 'wrap', request: {} })).toThrow(
      InvalidCanvasIntentError,
    );
    expect(() => parseCanvasIntent(null)).toThrow(InvalidCanvasIntentError);
  });
});

describe('applyCanvasIntent edits', () => {
  it('connects, tells what happened and keeps one undo step', async () => {
    const { store, env } = setup();
    const feedback = await applyCanvasIntent(
      { type: 'connect', request: { from: end('a', 'x:next'), to: end('c', 'x:in') } },
      env,
    );
    expect(feedback).toMatchObject({ failed: false });
    expect(store.state.get().program.nodes.find((node) => node.key === 'a')?.to).toEqual({
      next: 'c',
    });
    store.undo();
    expect(store.state.get().program.nodes.find((node) => node.key === 'a')?.to).toEqual({
      next: 'b',
    });
  });

  it('reports a refused edit as a failure with a toast', async () => {
    const { env } = setup();
    const feedback = await applyCanvasIntent(
      { type: 'delete', request: { ids: [idOf('start')] } },
      env,
    );
    expect(feedback?.failed).toBe(true);
    expect(feedback?.toast).toBe(feedback?.announcement);
  });
});

describe('applyCanvasIntent canvas events', () => {
  it('selects, opens and clears the selection', async () => {
    const { store, env, actions } = setup();
    expect(
      await applyCanvasIntent({ type: 'select', ids: [idOf('a'), idOf('zzz')] }, env),
    ).toBeNull();
    expect(store.state.get().selection.ids).toEqual([idOf('a')]);
    await applyCanvasIntent({ type: 'open', nodeId: idOf('b') }, env);
    expect(actions.openNode).toHaveBeenCalledWith(idOf('b'));
    await applyCanvasIntent({ type: 'escape' }, env);
    expect(store.state.get().selection.ids).toEqual([]);
    expect(actions.escape).toHaveBeenCalledTimes(1);
  });

  it('hands pin drops, wire inserts and loop steps to the screen', async () => {
    const { env, actions } = setup();
    const from = end('a', 'x:next');
    await applyCanvasIntent(
      { type: 'dropEmpty', from, point: { x: 3, y: 4 }, screen: { x: 30, y: 40 } },
      env,
    );
    expect(actions.dropEmpty).toHaveBeenCalledWith(from, { x: 3, y: 4 }, { x: 30, y: 40 });
    await applyCanvasIntent({ type: 'insertOnWire', from }, env);
    expect(actions.insertOnWire).toHaveBeenCalledWith(from);
    await applyCanvasIntent({ type: 'addTrigger' }, env);
    expect(actions.addTrigger).toHaveBeenCalledTimes(1);
    await applyCanvasIntent({ type: 'stepPass', nodeId: idOf('a'), delta: 1 }, env);
    expect(actions.stepPass).toHaveBeenCalledWith(idOf('a'), 1);
    expect(await applyCanvasIntent({ type: 'viewportSettled' }, env)).toBeNull();
    expect(
      await applyCanvasIntent({ type: 'ready', metrics: { width: 1, height: 1 } }, env),
    ).toBeNull();
  });

  it('adds a path to a Do together step', async () => {
    const { store, env } = setup();
    store.apply([
      {
        op: 'add',
        node: { kind: 'flow.parallel', key: 'both' },
        after: { key: 'c', port: 'next' },
      },
    ]);
    const fork = store.state.get().program.nodes.find((node) => node.key === 'both');
    const feedback = await applyCanvasIntent({ type: 'addPath', nodeId: fork?.id ?? '' }, env);
    expect(feedback).toMatchObject({ announcement: 'Added path3.', failed: false });
    expect(store.state.get().program.nodes.find((node) => node.key === 'both')?.paths).toHaveLength(
      3,
    );
  });
});

describe('applyCanvasIntent shortcuts', () => {
  it('undoes, redoes and selects everything', async () => {
    const { store, env } = setup();
    store.apply([{ op: 'set', key: 'a', label: 'Changed' }]);
    await applyCanvasIntent({ type: 'shortcut', name: 'undo' }, env);
    expect(store.state.get().program.nodes.find((node) => node.key === 'a')?.label).toBeUndefined();
    await applyCanvasIntent({ type: 'shortcut', name: 'redo' }, env);
    expect(store.state.get().program.nodes.find((node) => node.key === 'a')?.label).toBe('Changed');
    await applyCanvasIntent({ type: 'shortcut', name: 'selectAll' }, env);
    expect(store.state.get().selection.ids).toHaveLength(4);
  });

  it('copies, pastes and duplicates through the clipboard', async () => {
    const { store, env, clip } = setup();
    store.select(idOf('b'));
    const copied = await applyCanvasIntent({ type: 'shortcut', name: 'copy' }, env);
    expect(copied?.announcement).toContain('Copied 1 step');
    expect(clip.text).toContain('smarteverything.automation-graph');
    const pasted = await applyCanvasIntent({ type: 'shortcut', name: 'paste' }, env);
    expect(pasted?.announcement).toBe('Pasted 1 step.');
    const duplicated = await applyCanvasIntent({ type: 'shortcut', name: 'duplicate' }, env);
    expect(duplicated?.failed).toBe(false);
  });

  it('asks the screen to make a Custom Node from the selection', async () => {
    const { store, env, actions } = setup();
    store.select(idOf('b'));
    await applyCanvasIntent({ type: 'shortcut', name: 'group' }, env);
    expect(actions.groupSelection).toHaveBeenCalledWith([idOf('b')]);
  });
});

describe('applyViewIntent', () => {
  it('selects, opens and steps but never edits', () => {
    const { store } = setup();
    const actions = {
      openNode: vi.fn<ViewActions['openNode']>(),
      stepPass: vi.fn<ViewActions['stepPass']>(),
      settled: vi.fn<ViewActions['settled']>(),
    };
    const view = { store, actions, measure: vi.fn<CanvasEnv['measure']>() };
    applyViewIntent({ type: 'select', ids: [idOf('b')] }, view);
    expect(store.state.get().selection.ids).toEqual([idOf('b')]);
    applyViewIntent({ type: 'open', nodeId: idOf('a') }, view);
    expect(actions.openNode).toHaveBeenCalledWith(idOf('a'));
    applyViewIntent({ type: 'stepPass', nodeId: idOf('a'), delta: -1 }, view);
    expect(actions.stepPass).toHaveBeenCalledWith(idOf('a'), -1);
    applyViewIntent({ type: 'viewportSettled' }, view);
    expect(actions.settled).toHaveBeenCalledTimes(1);
    const before = store.state.get().program;
    expect(applyViewIntent({ type: 'delete', request: { ids: [idOf('b')] } }, view)).toBeNull();
    expect(store.state.get().program).toBe(before);
    const sizes = [{ id: idOf('a'), w: 248, h: 180 }];
    applyViewIntent({ type: 'measured', sizes }, view);
    expect(view.measure).toHaveBeenCalledWith(sizes);
  });
});
