import { act, createElement, useEffect, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { EMPTY_LAYOUT, NODE_REGISTRY } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CanvasIntent, CanvasProps } from '../../model/canvas/contract';
import type { FlowCanvasProps } from '../canvas/canvas-types';

interface Probe {
  renders: number;
  mounts: number;
  unmounts: number;
  gateCalls: [boolean, boolean][];
  last: FlowCanvasProps | null;
}

const probe = vi.hoisted((): Probe => ({
  renders: 0,
  mounts: 0,
  unmounts: 0,
  gateCalls: [],
  last: null,
}));

vi.mock('../canvas/flow-canvas', () => ({
  default: function CanvasProbe(props: FlowCanvasProps): ReactNode {
    probe.renders += 1;
    probe.last = props;
    useEffect(() => {
      probe.mounts += 1;
      return (): void => {
        probe.unmounts += 1;
      };
    }, []);
    return null;
  },
}));

vi.mock('../../../../design/animation-gate', () => ({
  useAnimationGate: (wanted: boolean, onScreen: boolean): { moving: boolean; reduced: boolean } => {
    probe.gateCalls.push([wanted, onScreen]);
    return { moving: wanted && onScreen, reduced: false };
  },
}));

vi.mock('react-native', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  Dimensions: { get: (): { width: number; height: number } => ({ width: 400, height: 900 }) },
}));

const clipboardWrite = vi.hoisted(() => vi.fn());

vi.mock('expo-clipboard', () => ({
  getStringAsync: (): Promise<string> => Promise.resolve(''),
  setStringAsync: clipboardWrite,
}));

const { PaletteContext, COLOUR_VARIABLE } = await import('../../../../design/colour-roles');
const { DocumentStore } = await import('../../model/editor/document-store');
const { idSource } = await import('../../model/editor/editor-fixtures');
const { Ids, add, automation, note, setLight } = await import('../../model/canvas/canvas-fixtures');
const { CanvasHost } = await import('./canvas-host');
const { InvalidCanvasIntentError } = await import('./intent-env');

const ids = new Ids(1);
const first = setLight(ids, null);
const second = note(ids, 'Second');
const third = add(ids, null);

function makeStore(): InstanceType<typeof DocumentStore> {
  return new DocumentStore(automation([first, second, third]), EMPTY_LAYOUT, {
    newId: idSource(),
  });
}

const actions = {
  openNode: vi.fn(),
  insertOnEdge: vi.fn(),
  openSlot: vi.fn(),
  portDropEmpty: vi.fn(),
  groupSelection: vi.fn(),
  viewportSettled: vi.fn(),
  refused: vi.fn(),
};

const options = { registry: NODE_REGISTRY };

let root: Root | null = null;

let rerender: (onScreen: boolean) => void = (): void => undefined;

function mount(store: InstanceType<typeof DocumentStore>, onScreen = true): void {
  const element = (visible: boolean): ReactNode =>
    createElement(
      PaletteContext,
      { value: COLOUR_VARIABLE },
      createElement(CanvasHost, {
        store,
        options,
        run: null,
        focusNode: null,
        viewportCommand: null,
        onScreen: visible,
        actions,
      }),
    );
  root = createRoot({
    nodeType: 1,
    tagName: 'DIV',
    ownerDocument: null,
    addEventListener: (): void => undefined,
  });
  const current = root;
  act(() => {
    current.render(element(onScreen));
  });
  rerender = (visible: boolean): void => {
    act(() => {
      current.render(element(visible));
    });
  };
}

function latest(): FlowCanvasProps {
  if (probe.last === null) throw new Error('the canvas never rendered');
  return probe.last;
}

async function send(intent: CanvasIntent): Promise<void> {
  await act(async () => {
    await latest().onIntent(intent);
  });
}

function loseWebView(name: 'onRenderProcessGone' | 'onContentProcessDidTerminate'): void {
  const handler: unknown = Reflect.get(latest().dom ?? {}, name);
  if (typeof handler !== 'function') throw new Error(`the host did not hand over ${name}`);
  act(() => {
    Reflect.apply(handler, undefined, [{ nativeEvent: { url: '', title: '' } }]);
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('window', {
    event: undefined,
    document: { activeElement: null, body: null },
    HTMLIFrameElement: Date,
  });
  probe.renders = 0;
  probe.mounts = 0;
  probe.unmounts = 0;
  probe.gateCalls = [];
  probe.last = null;
  for (const action of Object.values(actions)) action.mockClear();
  clipboardWrite.mockClear();
});

afterEach(() => {
  const open = root;
  root = null;
  if (open !== null)
    act(() => {
      open.unmount();
    });
  vi.unstubAllGlobals();
});

function props(): CanvasProps {
  return latest();
}

describe('what the host hands the canvas', () => {
  it('builds the scene from the document, with the compact layout on a phone width', () => {
    mount(makeStore());
    expect(props().scene.mode).toBe('compact');
    expect(props().scene.nodes.map((node) => node.id)).toContain(first.id);
    expect(props().idiom).toBe('touch');
    expect(props().run).toBeNull();
  });

  it('maps the app palette onto --se variables', () => {
    mount(makeStore());
    expect(props().theme['--se-bg']).toBe('--color-bg');
    expect(props().theme['--se-primary']).toBe('--color-primary');
    expect(props().theme['--se-type-boolean']).toBe('--color-viz-violet');
  });

  it('is active only while the animation gate lets it move', () => {
    mount(makeStore(), true);
    expect(props().active).toBe(true);
    rerender(false);
    expect(props().active).toBe(false);
    expect(probe.gateCalls.at(-1)).toEqual([true, false]);
  });

  it('follows the document: a change to the selection reaches the canvas', () => {
    const store = makeStore();
    mount(store);
    act(() => {
      store.select(first.id);
    });
    expect(props().selection).toEqual([first.id]);
  });
});

describe('what leaves the canvas', () => {
  it('rejects an intent outside the contract and changes nothing', async () => {
    const store = makeStore();
    mount(store);
    const renders = probe.renders;
    await expect(send({ type: 'delete', ids: [] })).rejects.toBeInstanceOf(
      InvalidCanvasIntentError,
    );
    expect(probe.renders).toBe(renders);
    expect(store.state.get().canUndo).toBe(false);
  });

  it('applies a delete through the document store', async () => {
    const store = makeStore();
    mount(store);
    await send({ type: 'delete', ids: [first.id] });
    expect(store.state.get().program.body.nodes.map((node) => node.key)).toEqual([
      second.key,
      third.key,
    ]);
    expect(props().scene.nodes.map((node) => node.id)).not.toContain(first.id);
  });

  it('copies through the device clipboard', async () => {
    const store = makeStore();
    mount(store);
    await send({ type: 'select', ids: [first.id] });
    await send({ type: 'shortcut', name: 'copy' });
    expect(clipboardWrite).toHaveBeenCalledTimes(1);
    expect(clipboardWrite.mock.calls[0]?.[0]).toContain('smarteverything.automation-nodes');
  });

  it('passes the opening intents to the screen', async () => {
    mount(makeStore());
    await send({ type: 'openNode', id: first.id });
    expect(actions.openNode).toHaveBeenCalledWith(first.id);
  });
});

describe('native renders while the canvas works', () => {
  it('does not render for pans, pinches, repeated selections or a size report in the same class', async () => {
    const store = makeStore();
    mount(store);
    await send({ type: 'select', ids: [first.id] });
    const settled = probe.renders;
    for (let step = 0; step < 20; step += 1) {
      await send({
        type: 'viewportSettled',
        viewport: { x: step * 7, y: -step * 3, zoom: 1 + step / 40 },
      });
    }
    await send({ type: 'select', ids: [first.id] });
    await send({ type: 'ready', metrics: { width: 400, height: 700 } });
    expect(actions.viewportSettled).toHaveBeenCalledTimes(20);
    expect(probe.renders).toBe(settled);
  });

  it('renders once for a change of size class, and the scene switches layout', async () => {
    mount(makeStore());
    const before = probe.renders;
    await send({ type: 'ready', metrics: { width: 1000, height: 700 } });
    expect(probe.renders).toBe(before + 1);
    expect(props().scene.mode).toBe('wide');
  });

  it('renders once for a drop, because a drop is a change of the document', async () => {
    const store = makeStore();
    mount(store);
    await send({ type: 'ready', metrics: { width: 1000, height: 700 } });
    const node = props().scene.nodes.find((candidate) => candidate.id === second.id);
    if (node === undefined) throw new Error('the scene has no second step');
    const before = probe.renders;
    await send({ type: 'move', patches: [{ id: second.id, x: node.x + 40, y: node.y + 10 }] });
    expect(probe.renders).toBe(before + 1);
    expect(store.state.get().layout.nodes[second.id]).toEqual({ x: 40, y: 10 });
    expect(props().scene.nodes.find((candidate) => candidate.id === second.id)?.x).toBe(
      node.x + 40,
    );
  });
});

describe('when the web view is lost', () => {
  it('mounts a fresh canvas that gets the whole state back from the document', async () => {
    const store = makeStore();
    mount(store);
    await send({ type: 'select', ids: [second.id] });
    const mounted = probe.mounts;
    loseWebView('onRenderProcessGone');
    expect(probe.unmounts).toBe(1);
    expect(probe.mounts).toBe(mounted + 1);
    expect(props().selection).toEqual([second.id]);
    expect(props().scene.nodes.map((node) => node.id)).toContain(first.id);
  });

  it('does the same when the iOS content process ends', () => {
    mount(makeStore());
    loseWebView('onContentProcessDidTerminate');
    expect(probe.unmounts).toBe(1);
    expect(probe.mounts).toBe(2);
  });
});
