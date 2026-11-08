import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { useFocusedMessage } from './use-focused-message';
import type { IndexScroller } from './use-thread-scroll';

vi.mock('expo-router', () => ({
  router: { setParams: vi.fn() },
  useLocalSearchParams: (): Record<string, string> => ({}),
}));
vi.mock('../../../components/toast-store', () => ({ notify: vi.fn() }));

const KEYS = ['newest', 'quoted', 'oldest'] as const;

interface Landing {
  readonly focus: (id: string | null) => void;
  readonly flashed: () => string | null;
  readonly scrollTo: ReturnType<typeof vi.fn>;
  readonly close: () => void;
}

function landing(): Landing {
  vi.useFakeTimers();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('window', {
    event: undefined,
    document: { activeElement: null, body: null },
    HTMLIFrameElement: Date,
  });
  const root = createRoot({
    nodeType: 1,
    tagName: 'DIV',
    ownerDocument: null,
    addEventListener: (): void => undefined,
  });
  const scrollTo = vi.fn();
  const scroller: IndexScroller = { scrollTo, onFailed: vi.fn() };
  const seen = vi.fn<(id: string | null) => void>();
  const onDone = vi.fn();
  function Thread({ focusId }: { readonly focusId: string | null }): null {
    seen(
      useFocusedMessage({
        keys: KEYS,
        focusId,
        scroller,
        exhausted: true,
        loadMore: vi.fn(),
        onDone,
      }),
    );
    return null;
  }
  return {
    focus: (focusId): void => {
      act(() => {
        root.render(createElement(Thread, { focusId }));
      });
    },
    flashed: (): string | null => seen.mock.lastCall?.[0] ?? null,
    scrollTo,
    close: (): void => {
      act(() => {
        root.unmount();
      });
      vi.unstubAllGlobals();
      vi.useRealTimers();
    },
  };
}

afterEach(() => {
  vi.useRealTimers();
});

it('lands on and flashes the same quoted message every time its quote is tapped', () => {
  const thread = landing();
  try {
    thread.focus('quoted');
    expect(thread.scrollTo).toHaveBeenLastCalledWith(1, 0.35);
    expect(thread.flashed()).toBe('quoted');
    act(() => {
      vi.runAllTimers();
    });
    expect(thread.flashed()).toBeNull();
    thread.focus(null);
    thread.focus('quoted');
    expect(thread.scrollTo).toHaveBeenCalledTimes(2);
    expect(thread.flashed()).toBe('quoted');
  } finally {
    thread.close();
  }
});
