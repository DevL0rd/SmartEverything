import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DeviceLogEntry } from '@smarteverything/domain';

interface Counts {
  ticker: number;
  entry: DeviceLogEntry | undefined;
}

const counts: Counts = vi.hoisted(() => ({ ticker: 0, entry: undefined }));

vi.mock('react-native', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  Text: (): null => null,
  View: (): null => null,
}));

vi.mock('./use-device-log', () => ({
  useLatestLogEntry: (): DeviceLogEntry | undefined => {
    counts.ticker += 1;
    return counts.entry;
  },
  useDeviceLogPages: (): undefined => undefined,
}));

const { LogTicker } = await import('./log-ticker');

const ENTRY: DeviceLogEntry = {
  at: '2026-10-18T11:00:00.000Z',
  kind: 'change',
  title: 'Turned on',
  cause: { kind: 'device' },
};

const BUDGET = { mount: 1, sameProps: 0, otherDevice: 1 } as const;

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
  counts.ticker = 0;
  counts.entry = undefined;
});

describe('the ticker render budget', () => {
  it('renders once on mount, not again for an identical parent render, once for another device', () => {
    counts.entry = ENTRY;
    const root = createRoot({
      nodeType: 1,
      tagName: 'DIV',
      ownerDocument: null,
      addEventListener: (): void => undefined,
    });
    act(() => {
      root.render(createElement(LogTicker, { deviceId: 'a', live: true }));
    });
    expect(counts.ticker).toBe(BUDGET.mount);
    act(() => {
      root.render(createElement(LogTicker, { deviceId: 'a', live: true }));
    });
    expect(counts.ticker).toBe(BUDGET.mount + BUDGET.sameProps);
    act(() => {
      root.render(createElement(LogTicker, { deviceId: 'b', live: true }));
    });
    expect(counts.ticker).toBe(BUDGET.mount + BUDGET.sameProps + BUDGET.otherDevice);
    act(() => {
      root.unmount();
    });
  });
});
