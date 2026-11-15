import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { SharedValue } from 'react-native-reanimated';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface Probe {
  onScreen: boolean;
  wanted: boolean[];
  jiggles: boolean[];
  layouts: number;
}

const probe: Probe = vi.hoisted(() => ({ onScreen: true, wanted: [], jiggles: [], layouts: 0 }));

vi.mock('react-native', async () => {
  const { createElement: create, Fragment, useEffect } = await import('react');
  function View({
    children,
    onLayout,
  }: {
    readonly children?: ReactNode;
    readonly onLayout?: () => void;
  }): ReactNode {
    useEffect(() => {
      onLayout?.();
    }, [onLayout]);
    return create(Fragment, null, children);
  }
  function Pressable({ children }: { readonly children?: ReactNode }): ReactNode {
    return create(Fragment, null, children);
  }
  return { View, Pressable };
});

vi.mock('react-native-gesture-handler', async () => {
  const { createElement: create, Fragment } = await import('react');
  return {
    GestureDetector: ({ children }: { readonly children?: ReactNode }): ReactNode =>
      create(Fragment, null, children),
  };
});

vi.mock('react-native-reanimated', async () => {
  const { createElement: create, Fragment } = await import('react');
  return {
    default: {
      View: ({ children }: { readonly children?: ReactNode }): ReactNode =>
        create(Fragment, null, children),
    },
    useAnimatedRef: (): { current: null } => ({ current: null }),
  };
});

vi.mock('../../../design/visibility', () => ({
  useOnScreenGate: (
    _ref: unknown,
    wanted: boolean,
  ): { moving: boolean; reduced: boolean; onLayout: () => void } => {
    probe.wanted.push(wanted);
    return {
      moving: wanted && probe.onScreen,
      reduced: false,
      onLayout: (): void => {
        probe.layouts += 1;
      },
    };
  },
}));

vi.mock('./use-widget-motion', () => ({
  useWidgetMotion: (): Record<string, never> => ({}),
  useJiggle: (active: boolean): null => {
    probe.jiggles.push(active);
    return null;
  },
  useMoveGesture: (): null => null,
  useWidgetStyle: (): { style: null; top: null } => ({ style: null, top: null }),
}));

vi.mock('./use-resize-gesture', () => ({ useResizeGesture: (): null => null }));
vi.mock('./widget-chrome', () => ({
  CornerButton: (): null => null,
  ResizeHandle: (): null => null,
  SizeLabel: (): null => null,
}));
vi.mock('../widget-scope', async () => {
  const { createContext } = await import('react');
  return { renderWidget: (): null => null, WidgetMotionFrameContext: createContext(null) };
});
vi.mock('../frame-class', () => ({ frameBoxOf: (): null => null }));
vi.mock('./edit-model', () => ({ SIZE_LABELS: { M: 'Medium', W: 'Wide', XL: 'Extra large' } }));

const { EditableWidget } = await import('./editable-widget');

type Props = Parameters<typeof EditableWidget>[0];

function shared<T>(value: T): SharedValue<T> {
  return {
    value,
    get: (): T => value,
    set: (): void => undefined,
    addListener: (): void => undefined,
    removeListener: (): void => undefined,
    modify: (): void => undefined,
  };
}

const drag: Props['drag'] = {
  key: shared(''),
  point: shared({
    originLeft: 0,
    originTop: 0,
    grabX: 0,
    grabY: 0,
    dx: 0,
    dy: 0,
    scrollStart: 0,
    pointerY: 0,
  }),
  target: shared(''),
  frames: shared({}),
  scrollY: shared(0),
  onTarget: (): void => undefined,
};

const handlers: Props['handlers'] = {
  lift: (): void => undefined,
  drop: (): void => undefined,
  resizeStart: (): void => undefined,
  resizeTo: (): void => undefined,
  resizeEnd: (): void => undefined,
  command: (): void => undefined,
  openOptions: (): void => undefined,
  focus: (): void => undefined,
};

const definition: Props['definition'] = {
  type: 'clock',
  title: 'Clock',
  icon: 'clock',
  sizes: { compact: ['M'], medium: ['M'], expanded: ['M'] },
  defaultSize: 'M',
  render: (): null => null,
};

let root: Root;

function render(resizing: boolean, reduced = false): void {
  act(() => {
    root.render(
      createElement(EditableWidget, {
        widget: { key: 'clock', type: 'clock', size: 'M' },
        definition,
        frame: { left: 0, top: 4000, width: 200, height: 120 },
        cell: { width: 80, height: 80, gap: 8, pad: 8 },
        order: 3,
        sizes: [],
        drag,
        handlers,
        touch: false,
        reduced,
        lifted: false,
        resizing,
        picked: false,
      }),
    );
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('window', {
    event: undefined,
    document: { activeElement: null, body: null },
    HTMLIFrameElement: Date,
  });
  probe.onScreen = true;
  probe.wanted = [];
  probe.jiggles = [];
  probe.layouts = 0;
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
});

describe('EditableWidget jiggle', () => {
  it('does not jiggle a widget that is off screen', () => {
    probe.onScreen = false;
    render(false);
    expect(probe.wanted.at(-1)).toBe(true);
    expect(probe.jiggles.at(-1)).toBe(false);
  });

  it('jiggles a widget that is on screen', () => {
    render(false);
    expect(probe.jiggles.at(-1)).toBe(true);
  });

  it('measures its own view for the on-screen gate', () => {
    render(false);
    expect(probe.layouts).toBeGreaterThan(0);
  });

  it('rests while resizing or under reduced motion', () => {
    render(true);
    expect(probe.wanted.at(-1)).toBe(false);
    expect(probe.jiggles.at(-1)).toBe(false);
    render(false, true);
    expect(probe.wanted.at(-1)).toBe(false);
    expect(probe.jiggles.at(-1)).toBe(false);
  });
});
