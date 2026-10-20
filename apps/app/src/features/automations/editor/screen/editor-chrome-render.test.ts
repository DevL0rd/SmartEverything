import { act, createElement, Profiler, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TopBarProps } from './top-bar';
import { bottomBarItems } from './screen-model';

const counts = vi.hoisted(() => ({ renders: new Map<string, number>() }));

interface Passthrough {
  readonly children?: ReactNode;
}

function tally(name: string): void {
  counts.renders.set(name, (counts.renders.get(name) ?? 0) + 1);
}

vi.mock('react-native', () => ({
  View: ({ children }: Passthrough): ReactNode => children,
}));
vi.mock('../../../../design/platform', () => ({ useIdiom: (): string => 'touch' }));
vi.mock('../../../../components/interactive', () => ({
  Interactive: ({ children, label }: Passthrough & { readonly label?: string }): ReactNode => {
    tally(`interactive:${label ?? ''}`);
    return children;
  },
}));
vi.mock('../../../../components/icon-button', () => ({
  IconButton: ({ label }: { readonly label: string }): null => {
    tally(`icon-button:${label}`);
    return null;
  },
}));
vi.mock('../../../../components/icon', () => ({ Icon: (): null => null }));
vi.mock('../../../../components/button', () => ({
  Button: ({ label }: { readonly label: string }): null => {
    tally(`button:${label}`);
    return null;
  },
}));
vi.mock('../../../../components/badge', () => ({ Badge: (): null => null }));
vi.mock('../../../../components/menu', () => ({ OverflowButton: (): null => null }));
vi.mock('../../../../components/tooltip', () => ({ Tooltip: (): null => null }));
vi.mock('../../../../components/text', () => ({ Text: (): null => null }));
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: (): { readonly bottom: number } => ({ bottom: 0 }),
}));

const { TopBar } = await import('./top-bar');
const { BottomBar } = await import('./bottom-bar');

const NO_OP = (): void => undefined;

const TOP: TopBarProps = {
  layout: 'phone',
  name: 'Night air',
  status: 'Saved',
  reusable: false,
  online: true,
  counts: { errors: 0, warnings: 1, hints: 0 },
  canUndo: false,
  canRedo: false,
  onBack: NO_OP,
  onRename: NO_OP,
  onUndo: NO_OP,
  onRedo: NO_OP,
  onPublish: NO_OP,
  onTest: NO_OP,
  onAdd: NO_OP,
  onProblems: NO_OP,
  onShortcuts: NO_OP,
};

const BOTTOM = { reusable: false, selecting: false } as const;

function mount(): ReturnType<typeof createRoot> {
  return createRoot({
    nodeType: 1,
    tagName: 'DIV',
    ownerDocument: null,
    addEventListener: (): void => undefined,
  });
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
  vi.unstubAllGlobals();
  counts.renders.clear();
});

const IDLE_WINDOW_MS = 5000;
const IDLE_BUDGET = { commits: 1, uiFrames: 5 } as const;
const BUDGET = { mount: 1, equalProps: 0, oneChange: 1 } as const;

describe('the editor chrome render budget', () => {
  it('renders the top bar once, not at all for equal props, and once per real change', () => {
    const root = mount();
    act(() => {
      root.render(createElement(TopBar, TOP));
    });
    expect(counts.renders.get('icon-button:Undo')).toBe(BUDGET.mount);
    act(() => {
      root.render(createElement(TopBar, { ...TOP }));
    });
    expect(counts.renders.get('icon-button:Undo')).toBe(BUDGET.mount + BUDGET.equalProps);
    act(() => {
      root.render(createElement(TopBar, { ...TOP, canUndo: true }));
    });
    expect(counts.renders.get('icon-button:Undo')).toBe(BUDGET.mount + BUDGET.oneChange);
  });

  it('renders the bottom bar once and not again while nothing about it changes', () => {
    const root = mount();
    const items = bottomBarItems(BOTTOM);
    act(() => {
      root.render(createElement(BottomBar, { items, onItem: NO_OP }));
    });
    expect(counts.renders.get('interactive:Add')).toBe(BUDGET.mount);
    act(() => {
      root.render(createElement(BottomBar, { items, onItem: NO_OP }));
    });
    expect(counts.renders.get('interactive:Add')).toBe(BUDGET.mount + BUDGET.equalProps);
    act(() => {
      root.render(
        createElement(BottomBar, {
          items: bottomBarItems({ ...BOTTOM, selecting: true }),
          onItem: NO_OP,
        }),
      );
    });
    expect(counts.renders.get('interactive:Add')).toBe(BUDGET.mount + BUDGET.oneChange);
  });

  it('makes no commits and requests no frames at rest', () => {
    vi.useFakeTimers();
    const frames = vi.fn();
    vi.stubGlobal('requestAnimationFrame', frames);
    let commits = 0;
    const root = mount();
    act(() => {
      root.render(
        createElement(
          Profiler,
          {
            id: 'editor',
            onRender: (): void => {
              commits += 1;
            },
          },
          createElement(TopBar, TOP),
          createElement(BottomBar, { items: bottomBarItems(BOTTOM), onItem: NO_OP }),
        ),
      );
    });
    const afterMount = commits;
    act(() => {
      vi.advanceTimersByTime(IDLE_WINDOW_MS);
    });
    vi.useRealTimers();
    expect(commits - afterMount).toBeLessThanOrEqual(IDLE_BUDGET.commits);
    expect(frames.mock.calls.length).toBeLessThanOrEqual(IDLE_BUDGET.uiFrames);
  });
});
