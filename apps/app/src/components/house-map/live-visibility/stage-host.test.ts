import { act, createElement, Fragment, useEffect, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Logger } from '@smarteverything/logging';
import { BufferGeometry } from 'three';
import { acquireGeometry, releaseGeometry } from '../../models/three/shared-geometry';
import type { QualityConfig } from './quality-scaler';
import { createVisibilityRegistry, type VisibilityRegistry } from './registry';
import type { StageLiveProps, StageStillState } from './stage-host';

interface Probe {
  visible: boolean;
  focused: boolean;
  mounts: Map<string, number>;
  live: Map<string, StageLiveProps>;
  stills: Map<string, number>;
  unavailable: Map<string, boolean>;
}

const probe: Probe = vi.hoisted(() => ({
  visible: true,
  focused: true,
  mounts: new Map<string, number>(),
  live: new Map<string, StageLiveProps>(),
  stills: new Map<string, number>(),
  unavailable: new Map<string, boolean>(),
}));

vi.mock('react-native', async (importOriginal) => {
  const { createElement: create, Fragment: Frag, useEffect: effect } = await import('react');
  function View({
    children,
    onLayout,
  }: {
    readonly children?: ReactNode;
    readonly onLayout?: () => void;
  }): ReactNode {
    effect(() => {
      onLayout?.();
    }, [onLayout]);
    return create(Frag, null, children);
  }
  return {
    ...(await importOriginal<Record<string, unknown>>()),
    View,
    AppState: {
      currentState: 'active',
      addEventListener: (): { remove: () => void } => ({ remove: (): void => undefined }),
    },
  };
});

vi.mock('expo-router', () => ({
  useIsFocused: (): boolean => probe.focused,
}));

vi.mock('../../../design/visibility', () => ({
  useOnScreen: (): { visible: boolean; onLayout: undefined } => ({
    visible: probe.visible,
    onLayout: undefined,
  }),
}));

const { StageHost } = await import('./stage-host');

const built: BufferGeometry[] = [];

function GeometryDom({ id, props }: { readonly id: string; readonly props: StageLiveProps }): null {
  probe.live.set(id, props);
  useEffect(() => {
    acquireGeometry(`stage-host-test|${id}`, () => {
      const made = new BufferGeometry();
      built.push(made);
      return made;
    });
    return (): void => {
      probe.live.delete(id);
      releaseGeometry(`stage-host-test|${id}`);
    };
  }, [id]);
  return null;
}

function bump(counts: Map<string, number>, id: string): void {
  counts.set(id, (counts.get(id) ?? 0) + 1);
}

function FakeDom({
  id,
  props,
}: {
  readonly id: string;
  readonly selection: number;
  readonly props: StageLiveProps;
}): null {
  probe.live.set(id, props);
  useEffect(() => {
    bump(probe.mounts, id);
    return (): void => {
      probe.live.delete(id);
    };
  }, [id]);
  return null;
}

function FakeStill({
  id,
  unavailable,
}: {
  readonly id: string;
  readonly unavailable: boolean;
}): null {
  probe.unavailable.set(id, unavailable);
  useEffect(() => {
    bump(probe.stills, id);
  }, [id]);
  return null;
}

interface StageSpec {
  readonly id: string;
  readonly selection: number;
}

function stage(registry: VisibilityRegistry, spec: StageSpec, config?: QualityConfig): ReactNode {
  return createElement(StageHost, {
    key: spec.id,
    id: spec.id,
    registry,
    still: (state: StageStillState) =>
      createElement(FakeStill, { id: spec.id, unavailable: state.unavailable }),
    renderLive: (props: StageLiveProps) =>
      createElement(FakeDom, { id: spec.id, selection: spec.selection, props }),
    ...(config === undefined ? {} : { qualityConfig: config }),
  });
}

function mount(): Root {
  return createRoot({
    nodeType: 1,
    tagName: 'DIV',
    ownerDocument: null,
    addEventListener: (): void => undefined,
  });
}

let root: Root;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('window', {
    event: undefined,
    document: { activeElement: null, body: null },
    HTMLIFrameElement: Date,
  });
  root = mount();
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  vi.unstubAllGlobals();
  probe.visible = true;
  probe.focused = true;
  probe.mounts.clear();
  probe.live.clear();
  probe.stills.clear();
  probe.unavailable.clear();
  built.length = 0;
  vi.restoreAllMocks();
});

function render(nodes: readonly ReactNode[]): void {
  act(() => {
    root.render(createElement(Fragment, null, ...nodes));
  });
}

describe('stage host', () => {
  it('mounts no DOM component for a stage that is not visible and shows the still', () => {
    probe.visible = false;
    render([stage(createVisibilityRegistry(), { id: 'hero', selection: 0 })]);
    expect(probe.mounts.get('hero')).toBeUndefined();
    expect(probe.stills.get('hero')).toBe(1);
  });

  it('keeps two visible stages live at the same time', () => {
    const registry = createVisibilityRegistry();
    render([
      stage(registry, { id: 'hero', selection: 0 }),
      stage(registry, { id: 'pinned', selection: 0 }),
    ]);
    expect(probe.live.get('hero')?.active).toBe(true);
    expect(probe.live.get('pinned')?.active).toBe(true);
    expect(registry.liveStageIds()).toEqual(['hero', 'pinned']);
  });

  it('does not remount a live stage when a map tap changes its props', () => {
    const registry = createVisibilityRegistry();
    render([stage(registry, { id: 'hero', selection: 0 })]);
    render([stage(registry, { id: 'hero', selection: 3 })]);
    render([stage(registry, { id: 'hero', selection: 7 })]);
    expect(probe.mounts.get('hero')).toBe(1);
    expect(probe.live.get('hero')?.active).toBe(true);
  });

  it('pauses and draws the still off screen but keeps the DOM component until the screen blurs', () => {
    const registry = createVisibilityRegistry();
    render([stage(registry, { id: 'hero', selection: 0 })]);
    act(() => {
      probe.live.get('hero')?.onReady();
    });
    const stillsWhileLive = probe.stills.get('hero') ?? 0;
    for (let pass = 0; pass < 3; pass += 1) {
      probe.visible = false;
      render([stage(registry, { id: 'hero', selection: 0 })]);
      expect(probe.live.get('hero')?.active).toBe(false);
      probe.visible = true;
      render([stage(registry, { id: 'hero', selection: 0 })]);
      expect(probe.live.get('hero')?.active).toBe(true);
    }
    expect(probe.stills.get('hero')).toBe(stillsWhileLive + 3);
    expect(probe.mounts.get('hero')).toBe(1);
    probe.visible = false;
    probe.focused = false;
    render([stage(registry, { id: 'hero', selection: 0 })]);
    expect(probe.live.has('hero')).toBe(false);
    probe.visible = true;
    probe.focused = true;
    render([stage(registry, { id: 'hero', selection: 0 })]);
    expect(probe.mounts.get('hero')).toBe(2);
    expect(probe.live.get('hero')?.active).toBe(true);
  });

  it('applies the scaler step when frame time stays above the target', () => {
    const config: QualityConfig = {
      targetMs: 16,
      headroomRatio: 0.5,
      smoothing: 1,
      settleSamples: 2,
      phases: {
        renderScale: [0.5],
        lodBias: [],
        decalLightShare: [],
        animationDivisor: [],
        splatScale: [],
      },
    };
    render([stage(createVisibilityRegistry(), { id: 'hero', selection: 0 }, config)]);
    expect(probe.live.get('hero')?.quality.renderScale).toBe(1);
    act(() => {
      probe.live.get('hero')?.onFrameTime(30);
      probe.live.get('hero')?.onFrameTime(30);
    });
    expect(probe.live.get('hero')?.quality.renderScale).toBe(0.5);
    expect(probe.mounts.get('hero')).toBe(1);
  });

  it('unmounts the DOM component and shows the unavailable still when 3D is missing', () => {
    const info = vi.spyOn(Logger.prototype, 'info');
    const registry = createVisibilityRegistry();
    render([stage(registry, { id: 'hero', selection: 0 })]);
    expect(probe.unavailable.get('hero')).toBe(false);
    act(() => {
      probe.live.get('hero')?.onUnavailable();
    });
    expect(probe.live.has('hero')).toBe(false);
    expect(probe.unavailable.get('hero')).toBe(true);
    render([stage(registry, { id: 'hero', selection: 2 })]);
    expect(probe.live.has('hero')).toBe(false);
    expect(probe.mounts.get('hero')).toBe(1);
    expect(info.mock.calls.filter(([event]) => event === 'stage.unavailable')).toHaveLength(1);
  });

  it('keeps the live layer geometry for its return and frees it when the stage goes away', () => {
    const registry = createVisibilityRegistry();
    const geometry = (): ReactNode =>
      createElement(StageHost, {
        id: 'hero',
        registry,
        still: null,
        renderLive: (props: StageLiveProps) => createElement(GeometryDom, { id: 'hero', props }),
      });
    render([geometry()]);
    const [first] = built;
    const disposed = vi.fn();
    first?.addEventListener('dispose', disposed);
    probe.visible = false;
    render([geometry()]);
    expect(probe.live.get('hero')?.active).toBe(false);
    probe.focused = false;
    render([geometry()]);
    expect(probe.live.has('hero')).toBe(false);
    expect(disposed).toHaveBeenCalledTimes(1);
    probe.visible = true;
    probe.focused = true;
    render([geometry()]);
    expect(built).toEqual([first]);
    render([]);
    render([geometry()]);
    expect(built).toHaveLength(2);
    expect(built[1]).not.toBe(first);
  });
});
