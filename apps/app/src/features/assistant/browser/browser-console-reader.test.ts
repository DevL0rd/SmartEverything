import { act, createElement, useEffect, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeFlashListRef, type FakeFlashListRef } from '../../../test-support/flash-list';
import type {
  ConsolePage,
  ConsoleRecord,
  PreviewDiagnostics,
} from './browser-diagnostics-contract';
import {
  useConsoleReader,
  type ConsoleReader,
  type ScrollGeometry,
} from './browser-console-reader';

const controller: PreviewDiagnostics = {
  read: () => {
    throw new Error('unused');
  },
  subscribe: () => () => undefined,
  loadOlder: () => Promise.reject(new Error('unused')),
  capture: () => Promise.reject(new Error('unused')),
  clearCache: () => Promise.resolve(),
  clearStorage: () => Promise.resolve(),
  clearCookies: () => Promise.resolve(),
  setVisible: (): void => undefined,
  dispose: (): void => undefined,
};

function record(id: number): ConsoleRecord {
  return {
    id: `r${String(id)}`,
    time: '10:00:00',
    level: 'info',
    message: `message ${String(id)}`,
    source: null,
    stack: null,
    truncatedBytes: 0,
  };
}

function pageOf(count: number): ConsolePage {
  return {
    kind: 'ready',
    documentId: 'doc',
    epoch: 'e1',
    records: Array.from({ length: count }, (_, index) => record(index)),
    errors: 0,
    previousCursor: null,
    omittedRecords: 0,
    delivery: 'none',
  };
}

function scrollAt(offset: number): ScrollGeometry {
  return {
    nativeEvent: {
      contentOffset: { y: offset },
      contentSize: { height: 1000 },
      layoutMeasurement: { height: 240 },
    },
  };
}

const seen: { current: ConsoleReader | null } = { current: null };
let list: FakeFlashListRef<ConsoleRecord>;
let render: (count: number) => void;

function Probe(props: {
  readonly page: ConsolePage;
  readonly capture: (reader: ConsoleReader) => void;
}): ReactNode {
  const reader = useConsoleReader(props.page, controller);
  const { capture } = props;
  useEffect(() => {
    capture(reader);
  });
  return null;
}

function reader(): ConsoleReader {
  if (seen.current === null) throw new Error('not rendered');
  return seen.current;
}

beforeEach(() => {
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
  list = fakeFlashListRef<ConsoleRecord>();
  const capture = (next: ConsoleReader): void => {
    const { listRef } = next;
    listRef.current = list;
    seen.current = next;
  };
  render = (count): void => {
    act(() => {
      root.render(createElement(Probe, { page: pageOf(count), capture }));
    });
  };
  render(3);
  list.calls.length = 0;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const END = { method: 'scrollToEnd', args: { animated: false } };

describe('console log tail-follow on a recycling list', () => {
  it('scrolls to the end when entries arrive and when the content resizes while following', () => {
    render(5);
    expect(list.calls).toEqual([END]);
    act(() => {
      reader().resize();
    });
    expect(list.calls).toEqual([END, END]);
  });

  it('stays following while the reader is within a few pixels of the end', () => {
    act(() => {
      reader().scroll(scrollAt(1000 - 240 - 10));
    });
    expect(reader().hasNew).toBe(false);
    render(4);
    expect(list.calls).toEqual([END]);
  });

  it('pauses when scrolled away: new entries no longer move the list and are offered', () => {
    act(() => {
      reader().scroll(scrollAt(100));
    });
    render(6);
    act(() => {
      reader().resize();
    });
    expect(list.calls).toEqual([]);
    expect(reader().page.records).toHaveLength(3);
    expect(reader().hasNew).toBe(true);
  });

  it('returns to following and jumps to the newest entry on resume', () => {
    act(() => {
      reader().scroll(scrollAt(100));
    });
    render(6);
    act(() => {
      reader().resume();
    });
    expect(reader().page.records).toHaveLength(6);
    expect(list.calls).toContainEqual(END);
  });
});
