import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EMPTY_LAYOUT, NODE_REGISTRY } from '@smarteverything/domain';
import { Ids, add, automation, setLight } from '../../model/canvas/canvas-fixtures';
import type { Scene } from '../../model/canvas/contract';
import { projectScene } from '../../model/canvas/project-scene';
import { buildFlow } from './scene-flow';
import { selectedAfter, useCanvasState, type CanvasState } from './use-canvas-state';

function scene(): Scene {
  const ids = new Ids(1);
  const program = automation([setLight(ids, null), add(ids, null)]);
  return projectScene(program, { registry: NODE_REGISTRY, layout: EMPTY_LAYOUT, mode: 'wide' });
}

const SCENE = scene();
const [FIRST, SECOND] = SCENE.nodes.map((node) => node.id);

interface Harness {
  readonly state: () => CanvasState;
  readonly select: (ids: readonly string[]) => void;
  readonly onSelect: ReturnType<typeof vi.fn>;
}

let root: Root | null = null;

function mount(initial: readonly string[]): Harness {
  const onSelect = vi.fn();
  let latest: CanvasState | null = null;
  function Probe({ selection }: { readonly selection: readonly string[] }): ReactNode {
    latest = useCanvasState(SCENE, selection, onSelect);
    return null;
  }
  const created = createRoot({
    nodeType: 1,
    tagName: 'DIV',
    ownerDocument: null,
    addEventListener: (): void => undefined,
  });
  root = created;
  act(() => {
    created.render(createElement(Probe, { selection: initial }));
  });
  return {
    state: (): CanvasState => {
      if (latest === null) throw new Error('the probe did not render');
      return latest;
    },
    select: (ids): void => {
      act(() => {
        created.render(createElement(Probe, { selection: ids }));
      });
    },
    onSelect,
  };
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('window', {
    event: undefined,
    document: { activeElement: null, body: null },
    HTMLIFrameElement: Date,
  });
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  vi.unstubAllGlobals();
});

describe('canvas selection state', () => {
  it('needs two nodes in the fixture', () => {
    expect(FIRST).toBeDefined();
    expect(SECOND).toBeDefined();
  });

  it('applies select changes on top of the shown selection', () => {
    const nodes = buildFlow(SCENE, [FIRST ?? '']).nodes;
    const ids = selectedAfter(nodes, [
      { type: 'select', id: FIRST ?? '', selected: false },
      { type: 'select', id: SECOND ?? '', selected: true },
    ]);
    expect(ids).toEqual([SECOND]);
  });

  it('never reports a selection that only came from the selection prop', () => {
    const harness = mount([FIRST ?? '']);
    harness.select([]);
    harness.select([SECOND ?? '']);
    expect(harness.onSelect).not.toHaveBeenCalled();
    const shown = harness.state().nodes.filter((node) => node.selected === true);
    expect(shown.map((node) => node.id)).toEqual([SECOND]);
  });

  it('reports a person selecting another node once', () => {
    const harness = mount([FIRST ?? '']);
    act(() => {
      harness.state().onNodesChange([
        { type: 'select', id: FIRST ?? '', selected: false },
        { type: 'select', id: SECOND ?? '', selected: true },
      ]);
    });
    expect(harness.onSelect).toHaveBeenCalledTimes(1);
    expect(harness.onSelect).toHaveBeenCalledWith([SECOND]);
  });

  it('stays quiet when a select change matches the selection already shown', () => {
    const harness = mount([FIRST ?? '']);
    act(() => {
      harness.state().onNodesChange([{ type: 'select', id: FIRST ?? '', selected: true }]);
    });
    expect(harness.onSelect).not.toHaveBeenCalled();
  });
});
