import { act, createElement, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDrivePages, type CursorPage, type DrivePages } from './pages';

interface Page extends CursorPage {
  readonly cursor: string | null;
}

interface Read {
  readonly cursor: string | null;
  readonly signal: AbortSignal;
  readonly answer: () => void;
}

const NEXT: Readonly<Record<string, string | null>> = { first: 'p2', p2: 'p3', p3: null };

const KEY = ['drive', 'pages-test'] as const;

let reads: Read[] = [];
let waiting = new Set<Read>();
const seen: { latest: DrivePages<Page> | null } = { latest: null };
let client: QueryClient;
let root: Root;

function read(cursor: string | null, signal: AbortSignal): Promise<Page> {
  return new Promise((resolve, reject) => {
    const call: Read = {
      cursor,
      signal,
      answer: () => {
        waiting.delete(call);
        resolve({ cursor, next: NEXT[cursor ?? 'first'] ?? null });
      },
    };
    reads.push(call);
    waiting.add(call);
    signal.addEventListener(
      'abort',
      () => {
        waiting.delete(call);
        reject(new Error('The page read was cancelled.'));
      },
      { once: true },
    );
  });
}

function Harness(): null {
  const pages = useDrivePages<Page>({ queryKey: KEY, read });
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = pages;
  useEffect(() => {
    seen.latest = pages;
  });
  useEffect(() => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);
  return null;
}

async function settle(): Promise<void> {
  for (let turn = 0; turn < 50; turn += 1) {
    await act(async () => {
      await new Promise((done) => setTimeout(done, 0));
    });
    const next = [...waiting][0];
    if (next === undefined) return;
    await act(async () => {
      next.answer();
      await Promise.resolve();
    });
  }
  throw new Error('The page loop never settled.');
}

async function tick(): Promise<void> {
  await act(async () => {
    await new Promise((done) => setTimeout(done, 0));
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('window', {
    event: undefined,
    document: { activeElement: null, body: null },
    HTMLIFrameElement: Date,
  });
  reads = [];
  waiting = new Set();
  seen.latest = null;
  client = new QueryClient();
  root = createRoot({
    nodeType: 1,
    tagName: 'DIV',
    ownerDocument: null,
    addEventListener: (): void => undefined,
  });
  act(() => {
    root.render(createElement(QueryClientProvider, { client }, createElement(Harness)));
  });
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  client.clear();
  vi.unstubAllGlobals();
});

describe('Drive page loops', () => {
  it('hands each page read the query signal', async () => {
    await settle();
    expect(reads.map((call) => call.cursor)).toEqual([null, 'p2', 'p3']);
    expect(reads.every((call) => call.signal instanceof AbortSignal)).toBe(true);
    expect(seen.latest?.data?.pages.map((page) => page.cursor)).toEqual([null, 'p2', 'p3']);
  });

  it('stops a refetch loop that a newer invalidation cancelled', async () => {
    await settle();
    const before = reads.length;
    await act(async () => {
      void client.invalidateQueries({ queryKey: KEY });
      await Promise.resolve();
    });
    await tick();
    const cancelled = reads.slice(before);
    expect(cancelled.map((call) => call.cursor)).toEqual([null]);
    await act(async () => {
      void client.invalidateQueries({ queryKey: KEY });
      await Promise.resolve();
    });
    await settle();
    const stale = cancelled[0];
    if (stale === undefined) throw new Error('The first refetch never read a page.');
    expect(stale.signal.aborted).toBe(true);
    expect(reads.filter((call) => call.signal === stale.signal)).toHaveLength(1);
    expect(reads.slice(before).map((call) => call.cursor)).toEqual([null, null, 'p2', 'p3']);
    expect(seen.latest?.data?.pages.map((page) => page.cursor)).toEqual([null, 'p2', 'p3']);
  });

  it('stops the page loop of a query that lost its last observer', async () => {
    await settle();
    const before = reads.length;
    await act(async () => {
      void client.invalidateQueries({ queryKey: KEY });
      await Promise.resolve();
    });
    await tick();
    act(() => {
      root.render(createElement(QueryClientProvider, { client }, null));
    });
    await settle();
    expect(reads.slice(before).map((call) => call.cursor)).toEqual([null]);
    expect(reads.at(-1)?.signal.aborted).toBe(true);
  });
});
