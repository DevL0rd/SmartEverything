import { act, createElement, Fragment, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deviceFixture } from '../../../store/device-fixture';
import { visibilityRegistry } from '../../../components/house-map/live-visibility/registry';

interface Probe {
  visible: boolean;
  scene: { readonly name: string; readonly robot: null } | null;
  mapMounts: number;
  mapRenders: number;
  mapsOpen: number;
  stills: { readonly name: unknown; readonly floor: unknown }[];
  stillsOpen: number;
  plates: number;
  live: { readonly onReady: () => void; readonly onUnavailable: () => void } | null;
}

const probe: Probe = vi.hoisted(() => ({
  visible: true,
  scene: null,
  mapMounts: 0,
  mapRenders: 0,
  mapsOpen: 0,
  stills: [],
  stillsOpen: 0,
  plates: 0,
  live: null,
}));

vi.mock('react-native', async (importOriginal) => {
  const { createElement: create, Fragment: Frag, useEffect: effect } = await import('react');
  function View({
    children,
    onLayout,
    className,
  }: {
    readonly children?: ReactNode;
    readonly onLayout?: () => void;
    readonly className?: string;
  }): ReactNode {
    effect(() => {
      onLayout?.();
    }, [onLayout]);
    effect(() => {
      if (className === 'flex-1 bg-surface-2') probe.plates += 1;
    }, [className]);
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

vi.mock('../../../design/visibility', () => ({
  useOnScreen: (): { visible: boolean; onLayout: undefined } => ({
    visible: probe.visible,
    onLayout: undefined,
  }),
  useOnScreenGate: (): { moving: boolean; reduced: boolean; onLayout: undefined } => ({
    moving: false,
    reduced: false,
    onLayout: undefined,
  }),
}));

vi.mock('../../../components/charts', () => ({ ProgressBar: (): null => null }));
vi.mock('../../../components/icon', () => ({ Icon: (): null => null }));
vi.mock('../../../components/interactive', () => ({ Interactive: (): null => null }));
vi.mock('../../../components/text', () => ({ Text: (): null => null }));
vi.mock('../../device-visuals', () => ({ DeviceVisual: (): null => null }));

vi.mock('../../../components/house-map/iso/iso-still', async () => {
  const { useEffect: effect } = await import('react');
  return {
    IsoStill: ({
      input,
      name,
    }: {
      readonly input: { readonly floor: unknown };
      readonly name: unknown;
    }): null => {
      probe.stills.push({ name, floor: input.floor });
      effect(() => {
        probe.stillsOpen += 1;
        return (): void => {
          probe.stillsOpen -= 1;
        };
      }, []);
      return null;
    },
  };
});

vi.mock('./components/map-view', async () => {
  const { useEffect: effect } = await import('react');
  return {
    MapView: (props: NonNullable<Probe['live']>): null => {
      probe.mapRenders += 1;
      probe.live = { onReady: props.onReady, onUnavailable: props.onUnavailable };
      effect(() => {
        probe.mapMounts += 1;
        probe.mapsOpen += 1;
        return (): void => {
          probe.mapsOpen -= 1;
        };
      }, []);
      return null;
    },
  };
});

vi.mock('./data/use-vacuum', () => ({
  useVacuum: (): { snapshot: { mapVersionText: string } } => ({
    snapshot: { mapVersionText: '4:0' },
  }),
}));
vi.mock('./data/scene-query', () => ({
  useVacuumScene: (): { scene: Probe['scene'] } => ({ scene: probe.scene }),
}));
vi.mock('./data/use-vacuum-pose', () => ({
  useVacuumPose: (): { ok: true; value: null } => ({ ok: true, value: null }),
}));
vi.mock('./data/use-vacuum-fault', () => ({ useVacuumFault: (): null => null }));
vi.mock('./model/vacuum-scene', () => ({
  vacuumFloor: (scene: { readonly name: string }): string => `floor:${scene.name}`,
  vacuumRenderPose: (): null => null,
}));

const { AwakeStage } = await import('./face-stage');

const device = deviceFixture(0, { kind: 'vacuum', name: 'Robot' });

function face(key: string, error = false, view: '3d' | 'still' = '3d'): ReactNode {
  return createElement(AwakeStage, {
    key,
    device,
    slot: 'w',
    view,
    cameraLive: false,
    cameraOffered: false,
    error,
    onCamera: (): void => undefined,
    onCameraClosed: (): void => undefined,
  });
}

let root: Root;

function render(faces: readonly ReactNode[]): void {
  act(() => {
    root.render(createElement(Fragment, null, ...faces));
  });
}

function liveFaces(): readonly string[] {
  return visibilityRegistry.liveStageIds().filter((id) => id.startsWith('vacuum-face:'));
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('window', {
    event: undefined,
    document: { activeElement: null, body: null },
    HTMLIFrameElement: Date,
  });
  root = createRoot({
    nodeType: 1,
    tagName: 'DIV',
    ownerDocument: null,
    addEventListener: (): void => undefined,
  });
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  vi.unstubAllGlobals();
  probe.visible = true;
  probe.scene = null;
  probe.mapMounts = 0;
  probe.mapRenders = 0;
  probe.mapsOpen = 0;
  probe.stills.length = 0;
  probe.stillsOpen = 0;
  probe.plates = 0;
  probe.live = null;
});

describe('vacuum widget face stage', () => {
  it('mounts the live map once while visible and keeps it across re-renders', () => {
    probe.scene = { name: 'Flat', robot: null };
    render([face('a')]);
    const settled = probe.mapRenders;
    render([face('a', true)]);
    render([face('a')]);
    expect(probe.mapMounts).toBe(1);
    expect(probe.mapsOpen).toBe(1);
    expect(probe.mapRenders - settled).toBe(2);
    expect(liveFaces()).toHaveLength(1);
  });

  it('shows the iso still of the scene and no live map while not visible', () => {
    probe.visible = false;
    probe.scene = { name: 'Flat', robot: null };
    render([face('a')]);
    expect(probe.mapMounts).toBe(0);
    expect(probe.stills.at(-1)).toEqual({ name: 'Flat', floor: 'floor:Flat' });
    expect(liveFaces()).toHaveLength(0);
  });

  it('shows a plain plate as the still before the scene has arrived', () => {
    probe.visible = false;
    render([face('a')]);
    expect(probe.stills).toHaveLength(0);
    expect(probe.plates).toBe(1);
  });

  it('shows only the iso still and never mounts the map for a face that is not live', () => {
    probe.scene = { name: 'Flat', robot: null };
    render([face('a', false, 'still')]);
    expect(probe.mapMounts).toBe(0);
    expect(probe.stillsOpen).toBe(1);
    expect(probe.stills.at(-1)).toEqual({ name: 'Flat', floor: 'floor:Flat' });
    expect(liveFaces()).toHaveLength(0);
  });

  it('swaps the still for the live map when the face becomes live', () => {
    probe.scene = { name: 'Flat', robot: null };
    render([face('a', false, 'still')]);
    render([face('a')]);
    expect(probe.mapsOpen).toBe(1);
    expect(liveFaces()).toHaveLength(1);
    render([face('a', false, 'still')]);
    expect(probe.mapsOpen).toBe(0);
    expect(liveFaces()).toHaveLength(0);
  });

  it('keeps two visible faces of the same vacuum live at the same time', () => {
    render([face('home'), face('devices')]);
    expect(probe.mapsOpen).toBe(2);
    expect(liveFaces()).toHaveLength(2);
  });

  it('unmounts the live map off screen and mounts it again when visible', () => {
    probe.scene = { name: 'Flat', robot: null };
    render([face('a')]);
    probe.visible = false;
    render([face('a')]);
    expect(probe.mapsOpen).toBe(0);
    expect(probe.stills.length).toBeGreaterThan(0);
    probe.visible = true;
    render([face('a')]);
    expect(probe.mapMounts).toBe(2);
    expect(probe.mapsOpen).toBe(1);
  });

  it('keeps the iso still over the live map until the 3D view reports ready', () => {
    probe.scene = { name: 'Flat', robot: null };
    render([face('a')]);
    render([face('a')]);
    expect(probe.mapsOpen).toBe(1);
    expect(probe.stillsOpen).toBe(1);
    act(() => {
      probe.live?.onReady();
    });
    expect(probe.stillsOpen).toBe(0);
    expect(probe.mapsOpen).toBe(1);
  });

  it('drops the live map and keeps the still when WebGL is missing', () => {
    probe.scene = { name: 'Flat', robot: null };
    render([face('a')]);
    act(() => {
      probe.live?.onUnavailable();
    });
    expect(probe.mapsOpen).toBe(0);
    expect(probe.stillsOpen).toBe(1);
  });
});
