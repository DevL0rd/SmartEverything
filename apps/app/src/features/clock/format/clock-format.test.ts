import { act, createElement, useSyncExternalStore } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface Fake {
  status: string;
  missing: boolean;
  readonly listeners: Set<() => void>;
}

const fake = vi.hoisted((): Fake => ({
  status: 'live',
  missing: true,
  listeners: new Set<() => void>(),
}));

function notify(): void {
  for (const listener of fake.listeners) listener();
}

function subscribe(listener: () => void): () => void {
  fake.listeners.add(listener);
  return () => {
    fake.listeners.delete(listener);
  };
}

const savePref = vi.hoisted(() => vi.fn());

vi.mock('../../../store/prefs', () => ({
  PREFS: { clockFormat: 'clock-format' },
  prefOf: (): { status: string } => ({ status: 'absent' }),
  savePref,
}));

vi.mock('../../../store/clock-format', () => ({
  useHour24: (): boolean => true,
}));

vi.mock('../../../store/selectors', () => ({
  useSyncStatus: (): { status: string } => ({
    status: useSyncExternalStore(subscribe, () => fake.status),
  }),
}));

vi.mock('../../../store/store-context', () => ({
  useEntityStore: (): object => ({}),
  useStoreSelector: (): boolean => useSyncExternalStore(subscribe, () => fake.missing),
}));

const { ClockFormatHost } = await import('./clock-format');

function refuseSave(): void {
  fake.missing = false;
  notify();
  queueMicrotask(() => {
    fake.missing = true;
    notify();
  });
}

async function settle(): Promise<void> {
  for (let round = 0; round < 10; round += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

describe('ClockFormatHost', () => {
  let root: Root;

  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal('window', {
      event: undefined,
      document: { activeElement: null, body: null },
      HTMLIFrameElement: Date,
    });
    fake.status = 'live';
    fake.missing = true;
    savePref.mockReset();
    savePref.mockImplementation(refuseSave);
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

  it('saves a refused clock format once per connection, not in a loop', async () => {
    act(() => {
      root.render(createElement(ClockFormatHost));
    });
    await settle();
    expect(savePref).toHaveBeenCalledTimes(1);
    expect(fake.missing).toBe(true);
  });

  it('tries again on the next connection', async () => {
    act(() => {
      root.render(createElement(ClockFormatHost));
    });
    await settle();
    act(() => {
      fake.status = 'offline';
      notify();
    });
    act(() => {
      fake.status = 'live';
      notify();
    });
    await settle();
    expect(savePref).toHaveBeenCalledTimes(2);
  });
});
