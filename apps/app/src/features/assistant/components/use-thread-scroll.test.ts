import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { useThreadScroll, type Newest, type ThreadScroll } from './use-thread-scroll';

vi.mock('../../../perf/probe-kit', () => ({ count: vi.fn() }));

const COORDINATOR: Newest = {
  key: 'coordinator',
  at: '2026-11-06T10:00:00.000Z',
  streaming: true,
  reply: true,
  unread: true,
  mine: false,
};

const HELPER: Newest = {
  ...COORDINATOR,
  key: 'helper',
  at: '2026-11-06T10:01:00.000Z',
  streaming: false,
};

const DIRECTION: Newest = {
  ...HELPER,
  key: 'to-onyx',
  at: '2026-11-06T10:00:30.000Z',
  reply: false,
};

function layout(height: number): Parameters<ThreadScroll['onViewportLayout']>[0] {
  return { nativeEvent: { layout: { height } } };
}

interface ScrollFixture {
  readonly current: () => ThreadScroll;
  readonly show: (newest: Newest, reply?: Newest) => void;
  readonly close: () => void;
  readonly scrollToOffset: ReturnType<typeof vi.fn>;
}

function fixture(): ScrollFixture {
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
  const scrollToOffset = vi.fn();
  const list = { current: { scrollToOffset } };
  const capture = vi.fn<(scroll: ThreadScroll) => void>();
  function Thread(tail: { readonly newest: Newest; readonly reply: Newest }): null {
    capture(useThreadScroll(list, tail));
    return null;
  }
  return {
    current: (): ThreadScroll => {
      const scroll = capture.mock.lastCall?.[0];
      if (scroll === undefined) throw new Error('Expected a mounted thread.');
      return scroll;
    },
    show: (newest, reply = newest): void => {
      act(() => {
        root.render(createElement(Thread, { newest, reply }));
      });
    },
    close: (): void => {
      act(() => {
        root.unmount();
      });
      vi.unstubAllGlobals();
    },
    scrollToOffset,
  };
}

function pinCoordinator(thread: ScrollFixture): void {
  thread.show(COORDINATOR);
  act(() => {
    thread.current().onViewportLayout(layout(500));
    thread.current().onNewestLayout(layout(900));
  });
  expect(thread.current().pinned).toBe(true);
  expect(thread.scrollToOffset).toHaveBeenCalledWith({ offset: 424, animated: false });
  sampleScroll(thread, 424);
  thread.scrollToOffset.mockClear();
}

function sampleScroll(thread: ScrollFixture, offset: number): void {
  act(() => {
    thread.current().onScroll({
      nativeEvent: {
        contentOffset: { x: 0, y: offset },
        contentSize: { width: 412, height: 1200 },
      },
    });
  });
}

it('retires the streaming pin and follows a short helper reply', () => {
  const thread = fixture();
  try {
    pinCoordinator(thread);
    thread.show(HELPER);
    expect(thread.current().pinned).toBe(false);
    expect(thread.scrollToOffset).toHaveBeenCalledExactlyOnceWith({ offset: 0, animated: false });
    thread.show({ ...HELPER, unread: false });
    expect(thread.scrollToOffset).toHaveBeenCalledTimes(1);
  } finally {
    thread.close();
  }
});

it('keeps the Coordinator pin through an outgoing direction and follows the helper reply', () => {
  const thread = fixture();
  try {
    pinCoordinator(thread);
    thread.show(DIRECTION, COORDINATOR);
    expect(thread.current().pinned).toBe(true);
    expect(thread.scrollToOffset).not.toHaveBeenCalled();
    thread.show(HELPER);
    expect(thread.current().pinned).toBe(false);
    expect(thread.scrollToOffset).toHaveBeenCalledExactlyOnceWith({ offset: 0, animated: false });
  } finally {
    thread.close();
  }
});

it('releases a Coordinator that settles behind an outgoing direction without jumping', () => {
  const thread = fixture();
  try {
    pinCoordinator(thread);
    thread.show(DIRECTION, COORDINATOR);
    thread.show(DIRECTION, { ...COORDINATOR, streaming: false });
    expect(thread.current().pinned).toBe(false);
    expect(thread.scrollToOffset).not.toHaveBeenCalled();
  } finally {
    thread.close();
  }
});

it('preserves the viewport if the reader drags away before a helper reply', () => {
  const thread = fixture();
  try {
    pinCoordinator(thread);
    act(() => {
      thread.current().onScrollBeginDrag();
    });
    sampleScroll(thread, 720);
    thread.show(HELPER);
    expect(thread.current().pinned).toBe(false);
    expect(thread.current().away).toBe(true);
    expect(thread.scrollToOffset).not.toHaveBeenCalled();
  } finally {
    thread.close();
  }
});

it('retires the pin without jumping on a settle or an older replacement', () => {
  const thread = fixture();
  try {
    pinCoordinator(thread);
    thread.show({ ...COORDINATOR, streaming: false });
    expect(thread.current().pinned).toBe(false);
    thread.show({ ...HELPER, at: '2026-11-06T09:59:00.000Z' });
    expect(thread.scrollToOffset).not.toHaveBeenCalled();
  } finally {
    thread.close();
  }
});
