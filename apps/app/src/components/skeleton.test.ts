import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface Probe {
  moving: boolean;
  loops: number;
  cancels: number;
  sets: unknown[];
  hosts: string[];
  refs: number;
}

const probe = vi.hoisted((): Probe => ({
  moving: false,
  loops: 0,
  cancels: 0,
  sets: [],
  hosts: [],
  refs: 0,
}));

vi.mock('react-native', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  View: (): null => {
    probe.hosts.push('View');
    return null;
  },
}));

vi.mock('react-native-reanimated', async (importOriginal) => {
  const original = await importOriginal<Record<string, unknown>>();
  const View = (props: { ref?: unknown; onLayout?: unknown }): null => {
    probe.hosts.push('Anim.View');
    if (props.ref !== undefined) {
      probe.refs += 1;
    }
    return null;
  };
  const shared = {
    get: (): number => 1,
    set: (value: unknown): void => {
      probe.sets.push(value);
    },
  };
  return {
    ...original,
    default: { View },
    View,
    cancelAnimation: (): void => {
      probe.cancels += 1;
    },
    useAnimatedStyle: (): object => ({}),
    useSharedValue: (): object => shared,
    withTiming: (value: unknown): unknown => value,
    withRepeat: (value: unknown): string => {
      probe.loops += 1;
      return `loop:${String(value)}`;
    },
  };
});

vi.mock('../design/platform', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  isNative: (): boolean => false,
}));

vi.mock('../design/visibility', () => ({
  useOnScreenGate: (): { moving: boolean; reduced: boolean; onLayout: () => void } => ({
    moving: probe.moving,
    reduced: false,
    onLayout: (): undefined => undefined,
  }),
}));

const { Skeleton } = await import('./skeleton');

function mount(): { rerender: () => void; stop: () => void } {
  const root = createRoot({
    nodeType: 1,
    tagName: 'DIV',
    ownerDocument: null,
    addEventListener: (): void => undefined,
  });
  const draw = (): void => {
    act(() => {
      root.render(createElement(Skeleton, { shape: 'block' }));
    });
  };
  draw();
  return {
    rerender: draw,
    stop: (): void => {
      act(() => {
        root.unmount();
      });
    },
  };
}

beforeEach(() => {
  probe.moving = false;
  probe.loops = 0;
  probe.cancels = 0;
  probe.sets = [];
  probe.hosts = [];
  probe.refs = 0;
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('window', {
    event: undefined,
    document: { activeElement: null, body: null },
    HTMLIFrameElement: Date,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the web skeleton shimmer', () => {
  it('starts no loop while it is off screen', () => {
    const mounted = mount();
    expect(probe.loops).toBe(0);
    expect(probe.sets).toEqual([1]);
    mounted.stop();
  });

  it('starts one loop on screen and cancels it once it leaves the screen', () => {
    probe.moving = true;
    const mounted = mount();
    expect(probe.loops).toBe(1);
    expect(probe.cancels).toBe(0);
    probe.moving = false;
    mounted.rerender();
    expect(probe.loops).toBe(1);
    expect(probe.cancels).toBe(2);
    expect(probe.sets.at(-1)).toBe(1);
    mounted.stop();
  });

  it('cancels the loop when it unmounts', () => {
    probe.moving = true;
    const mounted = mount();
    mounted.stop();
    expect(probe.cancels).toBe(1);
  });

  it('keeps one measured animated host across gate changes', () => {
    const mounted = mount();
    probe.moving = true;
    mounted.rerender();
    probe.moving = false;
    mounted.rerender();
    expect(new Set(probe.hosts)).toEqual(new Set(['Anim.View']));
    expect(probe.refs).toBe(probe.hosts.length);
    mounted.stop();
  });
});
