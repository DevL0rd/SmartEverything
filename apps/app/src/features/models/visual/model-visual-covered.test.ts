import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BakeKey } from '../bake/bake-protocol';
import type { BakeOutcome } from '../bake/bake-queue';
import type * as ClipAtlasModule from './clip-atlas';
import { clipImage, fanSpec } from './visual-fixture';

interface Sim {
  readonly frames: Set<object>;
  readonly playing: boolean[];
}

const sim = vi.hoisted((): Sim => ({ frames: new Set<object>(), playing: [] }));

vi.mock('react-native', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  PixelRatio: { get: (): number => 3 },
  View: ({ children }: { readonly children?: ReactNode }): ReactNode => children ?? null,
}));

vi.mock('react-native-reanimated', async () => {
  const { useState } = await import('react');
  function useShared<Value>(initial: Value): { get: () => Value; set: (next: Value) => void } {
    const [value] = useState(() => {
      let current = initial;
      return {
        get: (): Value => current,
        set: (next: Value): void => {
          current = next;
        },
      };
    });
    return value;
  }
  function useFrameCallback(): { setActive: (on: boolean) => void } {
    const [frame] = useState(() => {
      const handle = {
        setActive: (on: boolean): void => {
          if (on) sim.frames.add(handle);
          else sim.frames.delete(handle);
        },
      };
      return handle;
    });
    return frame;
  }
  return {
    default: {
      View: ({ children }: { readonly children?: ReactNode }): ReactNode => children ?? null,
    },
    useAnimatedStyle: (): object => ({}),
    useFrameCallback,
    useSharedValue: useShared,
    withTiming: (target: number): number => target,
  };
});

vi.mock('../../../design/motion', () => ({ EASING: { fade: null } }));
vi.mock('expo-image', () => ({ Image: (): null => null }));
vi.mock('expo-router', () => ({
  useNavigation: (): { getState: () => { index: number; routes: { key: string }[] } } => ({
    getState: () => ({ index: 0, routes: [{ key: 'devices' }] }),
  }),
}));
vi.mock('uniwind', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useUniwind: (): { theme: string } => ({ theme: 'dark' }),
}));
vi.mock('../../../design/visibility', () => ({
  useOnScreen: (): { visible: boolean; onLayout: () => void } => ({
    visible: true,
    onLayout: (): void => undefined,
  }),
}));
vi.mock('../../../design/animation-gate', () => ({
  useAnimationGate: (
    wanted: boolean,
    onScreen: boolean,
  ): { moving: boolean; reduced: boolean } => ({
    moving: wanted && onScreen,
    reduced: false,
  }),
}));
vi.mock('./clip-atlas', async (importOriginal) => {
  const actual = await importOriginal<typeof ClipAtlasModule>();
  return {
    ...actual,
    ClipAtlas: (props: Parameters<typeof actual.ClipAtlas>[0]): ReactNode => {
      sim.playing.push(props.playing);
      return actual.ClipAtlas(props);
    },
  };
});
vi.mock('../bake/bake-host', () => ({
  modelBakeQueue: {
    want: (
      job: { readonly key: BakeKey },
      landed: (outcome: BakeOutcome) => void,
    ): { release: () => void; setPriority: () => void } => {
      landed({
        kind: 'baked',
        bake: { keyText: 'k', key: job.key, image: clipImage({}) },
      });
      return { release: (): void => undefined, setPriority: (): void => undefined };
    },
  },
}));

const { ModelVisual } = await import('./model-visual');
const { StillCoveredContext } = await import('./still-covered');

const SOURCE = { spec: fanSpec(), specHash: 'fan', tokenHash: 'tok', finish: null, params: {} };

function render(root: Root, covered: boolean): void {
  act(() => {
    root.render(
      createElement(
        StillCoveredContext,
        { value: covered },
        createElement(ModelVisual, {
          source: SOURCE,
          view: 'card',
          px: 96,
          signals: { power: true, speed: 0.9 },
        }),
      ),
    );
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
  sim.frames.clear();
  sim.playing.length = 0;
});

describe('a still covered by the drawn live model', () => {
  it('plays its clip only while nothing covers it', () => {
    render(root, false);
    expect(sim.playing.at(-1)).toBe(true);
    expect(sim.frames.size).toBe(1);
  });

  it('stops the clip frame callback while covered and restarts it once uncovered', () => {
    render(root, true);
    expect(sim.playing.at(-1)).toBe(false);
    expect(sim.frames.size).toBe(0);
    render(root, false);
    expect(sim.playing.at(-1)).toBe(true);
    expect(sim.frames.size).toBe(1);
    render(root, true);
    expect(sim.playing.at(-1)).toBe(false);
    expect(sim.frames.size).toBe(0);
  });
});
