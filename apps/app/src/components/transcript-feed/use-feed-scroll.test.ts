import { act, createElement, useEffect, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import type { TranscriptHit, TranscriptSession } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeFlashListRef, type FakeFlashListRef } from '../../test-support/flash-list';
import { feedItems, type FeedItem } from './feed-items';

const scrollY = vi.hoisted(() => ({ set: (_value: number): void => undefined }));

vi.mock('expo-router', () => ({ useScrollToTop: (): void => undefined }));
vi.mock('../screen-context', () => ({
  useScreen: (): { scrollY: typeof scrollY } => ({ scrollY }),
}));

const { useFeedScroll } = await import('./use-feed-scroll');

type Scroll = ReturnType<typeof useFeedScroll>;

const SESSION: TranscriptSession = {
  id: '11111111-1111-4111-8111-111111111111',
  source: 'camera',
  source_id: 'cam-1',
  plugin_id: null,
  title: 'Porch',
  retention_days: null,
  started_at: '2026-10-15T20:00:00.000Z',
  ended_at: null,
  last_line_at: null,
  line_count: 3,
  participants: [],
};

function hit(id: number): TranscriptHit {
  return {
    session: SESSION,
    line: {
      id,
      session_id: SESSION.id,
      at: '2026-10-16T09:00:00.000Z',
      speaker_id: null,
      speaker: 'Someone',
      text: `line ${String(id)}`,
      bot: false,
    },
  };
}

const ITEMS: readonly FeedItem[] = feedItems([hit(12), hit(11), hit(10)], {
  timeZone: 'UTC',
  grouped: false,
});

const seen: { current: Scroll | null } = { current: null };

function Probe(props: {
  readonly anchor: number | null;
  readonly focus: boolean;
  readonly capture: (scroll: Scroll) => void;
}): ReactNode {
  const scroll = useFeedScroll(ITEMS, props.anchor, props.focus);
  const { capture } = props;
  useEffect(() => {
    capture(scroll);
  });
  return null;
}

function layoutAt(y: number): {
  readonly nativeEvent: { readonly layout: { readonly y: number } };
} {
  return { nativeEvent: { layout: { y } } };
}

let render: (anchor: number | null, focus?: boolean) => FakeFlashListRef<FeedItem>;
let frames: (() => void)[] = [];

function runFrames(): void {
  act(() => {
    const due = frames;
    frames = [];
    for (const frame of due) frame();
  });
}

beforeEach(() => {
  frames = [];
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('requestAnimationFrame', (callback: () => void): number => frames.push(callback));
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
  const list = fakeFlashListRef<FeedItem>();
  const capture = (scroll: Scroll): void => {
    const { listRef } = scroll;
    listRef.current = list;
    seen.current = scroll;
  };
  render = (anchor, focus = false): FakeFlashListRef<FeedItem> => {
    act(() => {
      root.render(createElement(Probe, { anchor, focus, capture }));
    });
    return list;
  };
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('transcript feed scrolling on a recycling list', () => {
  it('jumps to the anchored line once, at the reading position, without animation', () => {
    const list = render(11);
    seen.current?.anchorReady();
    runFrames();
    seen.current?.jump();
    expect(list.calls).toEqual([
      { method: 'scrollToIndex', args: { index: 2, animated: false, viewPosition: 0.4 } },
    ]);
  });

  it('jumps again when the anchor changes', () => {
    const list = render(10);
    seen.current?.jump();
    render(12);
    seen.current?.jump();
    expect(list.calls).toEqual([
      { method: 'scrollToIndex', args: { index: 3, animated: false, viewPosition: 0.4 } },
      { method: 'scrollToIndex', args: { index: 1, animated: false, viewPosition: 0.4 } },
    ]);
  });

  it('does not jump without an anchor or for an anchor that is not loaded', () => {
    const list = render(null);
    seen.current?.jump();
    render(999);
    seen.current?.jump();
    expect(list.calls).toEqual([]);
  });

  it('returns to the lines below the page header on request and on focus', () => {
    const list = render(null, true);
    seen.current?.layout(layoutAt(180));
    expect(list.calls).toEqual([
      { method: 'scrollToOffset', args: { offset: 180, animated: false } },
    ]);
    seen.current?.top();
    expect(list.calls.at(-1)).toEqual({
      method: 'scrollToOffset',
      args: { offset: 180, animated: false },
    });
  });
});
