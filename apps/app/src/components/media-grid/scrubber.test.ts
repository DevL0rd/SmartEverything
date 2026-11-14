import { act, createElement, useEffect, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LibraryBucket } from '@smarteverything/domain';
import type { ScrubPoint } from './scrubber-model';

interface PanEvent {
  readonly y: number;
  readonly translationY: number;
}

type Handler = (event: PanEvent) => void;

interface Builder {
  readonly kind: string;
  readonly handlers: Map<string, Handler>;
}

const built = vi.hoisted((): Builder[] => []);
const texts = vi.hoisted((): string[] => []);
const idiom = vi.hoisted(() => ({ value: 'pointer' }));

function chain(kind: string): unknown {
  const handlers = new Map<string, Handler>();
  built.push({ kind, handlers });
  const target: Record<string, unknown> = {};
  const proxy: unknown = new Proxy(target, {
    get: (_target, name: string) => (value: unknown) => {
      if (name.startsWith('on') && typeof value === 'function') {
        handlers.set(name, (event) => {
          Reflect.apply(value, undefined, [event]);
        });
      }
      return proxy;
    },
  });
  return proxy;
}

function passThrough({ children }: { readonly children?: ReactNode }): ReactNode {
  return children;
}

function LaidOut({
  children,
  onLayout,
}: {
  readonly children?: ReactNode;
  readonly onLayout?: (event: object) => void;
}): ReactNode {
  useEffect(() => {
    onLayout?.({ nativeEvent: { layout: { width: 44, height: 1000 } } });
  }, [onLayout]);
  return children;
}

vi.mock('react-native', () => ({ View: LaidOut }));
vi.mock('react-native-gesture-handler', () => ({
  GestureDetector: passThrough,
  Gesture: {
    Pan: (): unknown => chain('pan'),
    Hover: (): unknown => chain('hover'),
    Simultaneous: (...parts: unknown[]): unknown[] => parts,
  },
}));
vi.mock('react-native-reanimated', () => ({
  default: { View: passThrough },
  useSharedValue: <T>(initial: T): { get: () => T; set: (next: T) => void } => {
    let value = initial;
    return {
      get: (): T => value,
      set: (next: T): void => {
        value = next;
      },
    };
  },
  useAnimatedStyle: (): object => ({}),
}));
vi.mock('react-native-svg', () => ({ default: passThrough, Path: (): null => null }));
vi.mock('react-native-worklets', () => ({
  scheduleOnRN: (run: (...args: unknown[]) => void, ...args: unknown[]): void => {
    run(...args);
  },
}));
vi.mock('../../design/colour', () => ({ useColour: (): string => '#000' }));
vi.mock('../../design/platform', () => ({ useIdiom: (): string => idiom.value }));
vi.mock('../../platform/haptics', () => ({ selectionTick: (): void => undefined }));
vi.mock('../text', () => ({
  Text: ({ children }: { readonly children?: ReactNode }): null => {
    if (typeof children === 'string') texts.push(children);
    return null;
  },
}));

const { Scrubber } = await import('./scrubber');

const BUCKETS: readonly LibraryBucket[] = [
  { month: '2026-03', count: 600 },
  { month: '2026-01', count: 200 },
  { month: '2024-12', count: 200 },
];

let root: Root | null = null;
const scrubbed: ScrubPoint[] = [];
const released: ScrubPoint[] = [];

function render(buckets: readonly LibraryBucket[]): void {
  act(() => {
    root?.render(
      createElement(Scrubber, {
        buckets,
        at: { month: '2026-03', item: 0 },
        onScrub: (point: ScrubPoint): void => {
          scrubbed.push(point);
        },
        onRelease: (point: ScrubPoint): void => {
          released.push(point);
        },
      }),
    );
  });
}

function pan(): Map<string, Handler> {
  const found = built.findLast((builder) => builder.kind === 'pan');
  if (found === undefined) throw new Error('the scrubber built no drag');
  return found.handlers;
}

function fire(name: string, event: PanEvent): void {
  act(() => {
    pan().get(name)?.(event);
  });
}

beforeEach(() => {
  built.length = 0;
  texts.length = 0;
  scrubbed.length = 0;
  released.length = 0;
  idiom.value = 'pointer';
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
    addEventListener: () => undefined,
  });
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  vi.unstubAllGlobals();
});

describe('the timeline scrubber', () => {
  it('draws nothing for an empty library', () => {
    render([]);
    expect(built).toEqual([]);
    expect(texts).toEqual([]);
  });

  it('drags to a month, shows the month pill with its count and releases on that month', () => {
    render(BUCKETS);
    fire('onBegin', { y: 0, translationY: 0 });
    fire('onUpdate', { y: 0, translationY: 0 });
    expect(scrubbed.at(-1)).toEqual({ index: 0, month: '2026-03', count: 600, item: 0 });
    expect(texts).toContain('March 2026 · 600');
    fire('onFinalize', { y: 0, translationY: 0 });
    expect(released.at(-1)?.month).toBe('2026-03');
  });

  it('on a phone moves the thumb by the drag distance and shows the years only while dragging', () => {
    idiom.value = 'touch';
    render(BUCKETS);
    expect(texts.some((text) => text === '2026')).toBe(false);
    fire('onBegin', { y: 0, translationY: 0 });
    fire('onUpdate', { y: 0, translationY: 0 });
    expect(texts).toContain('2026');
    expect(texts).toContain('2024');
    expect(texts).not.toContain('2025');
  });
});
