import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PREVIEW_LOG_RECORD_MAX_BYTES,
  type NativeBrowserDiagnostic,
} from '@smarteverything/domain';
import { BrowserDiagnostics, type DiagnosticsHost } from '../src/browser-diagnostics.js';

const PNG = Buffer.alloc(64);
PNG.writeUInt32BE(800, 16);
PNG.writeUInt32BE(600, 20);

interface Harness {
  readonly diagnostics: BrowserDiagnostics;
  readonly events: NativeBrowserDiagnostic[];
  readonly clears: string[];
  readonly navigate: () => void;
  readonly log: (level: string, message: string, source?: string) => void;
  readonly shown: (value: boolean) => void;
  readonly closePage: () => void;
}

function harness(): Harness {
  const events: NativeBrowserDiagnostic[] = [];
  const clears: string[] = [];
  let navigated = (): void => undefined;
  let logged = (_level: string, _message: string, _source: string): void => undefined;
  let windowChanged = (): void => undefined;
  const state = { shown: true, closed: false };
  const host: DiagnosticsHost = {
    windowShown: (): boolean => state.shown,
    pageClosed: (): boolean => state.closed,
    bounds: (): { readonly width: number; readonly height: number } => ({
      width: 800,
      height: 600,
    }),
    send: (event): void => {
      events.push(event);
    },
    onNavigate: (listener): void => {
      navigated = listener;
    },
    onConsole: (listener): void => {
      logged = listener;
    },
    onWindowChange: (listener): void => {
      windowChanged = listener;
    },
    onClosed: (): void => undefined,
    clear: (what): Promise<void> => {
      clears.push(what);
      return Promise.resolve();
    },
    capturePng: (): Promise<Buffer> => Promise.resolve(PNG),
  };
  return {
    diagnostics: new BrowserDiagnostics(host, 'tab'),
    events,
    clears,
    navigate: (): void => {
      navigated();
    },
    log: (level, message, source = 'page.js:3'): void => {
      logged(level, message, source);
    },
    shown: (value): void => {
      state.shown = value;
      windowChanged();
    },
    closePage: (): void => {
      state.closed = true;
    },
  };
}
function currentEpoch(events: readonly NativeBrowserDiagnostic[]): string {
  const epoch = events.find((event) => event.kind === 'epoch');
  if (epoch === undefined) throw new Error('no epoch was announced');
  return epoch.epoch;
}

describe('browser console and capture', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('batches console records for the document that is open', () => {
    const { diagnostics, events, navigate, log } = harness();
    diagnostics.layout(true);
    navigate();
    log('error', 'boom');
    log('warning', 'careful');
    vi.advanceTimersByTime(50);
    const records = events.flatMap((event) => (event.kind === 'records' ? event.records : []));
    expect(records.map((record) => [record.id, record.level, record.message])).toEqual([
      [1, 'error', 'boom'],
      [2, 'warning', 'careful'],
    ]);
  });

  it('truncates an oversized entry instead of refusing it', () => {
    const { diagnostics, events, navigate, log } = harness();
    diagnostics.layout(true);
    navigate();
    log('info', 'x'.repeat(PREVIEW_LOG_RECORD_MAX_BYTES * 2));
    vi.advanceTimersByTime(50);
    const records = events.flatMap((event) => (event.kind === 'records' ? event.records : []));
    const record = records[0];
    expect(events.some((event) => event.kind === 'record-refused')).toBe(false);
    expect(record?.truncatedBytes).toBeGreaterThan(0);
    expect(Buffer.byteLength(JSON.stringify(record))).toBeLessThanOrEqual(
      PREVIEW_LOG_RECORD_MAX_BYTES,
    );
  });

  it('keeps a record with an oversized source within the record limit', () => {
    const { diagnostics, events, navigate, log } = harness();
    diagnostics.layout(true);
    navigate();
    log('info', 'short', 'u'.repeat(PREVIEW_LOG_RECORD_MAX_BYTES * 2));
    vi.advanceTimersByTime(50);
    const records = events.flatMap((event) => (event.kind === 'records' ? event.records : []));
    expect(Buffer.byteLength(JSON.stringify(records[0]))).toBeLessThanOrEqual(
      PREVIEW_LOG_RECORD_MAX_BYTES,
    );
  });

  it('captures while the app window is visible even without focus', async () => {
    const { diagnostics, events, navigate } = harness();
    diagnostics.layout(true);
    navigate();
    const pixels = await diagnostics.perform(currentEpoch(events), 'capture');
    expect(pixels).toMatchObject({ width: 800, height: 600, scale: 1, mime: 'image/png' });
  });

  it('refuses a capture when the app window is hidden', async () => {
    const { diagnostics, events, navigate, shown } = harness();
    diagnostics.layout(true);
    navigate();
    shown(false);
    await expect(diagnostics.perform(currentEpoch(events), 'capture')).rejects.toThrow(
      'not showing',
    );
  });

  it('clears website data whether or not the preview is showing', async () => {
    const { diagnostics, events, clears, navigate, shown } = harness();
    navigate();
    shown(false);
    const epoch = currentEpoch(events);
    await diagnostics.perform(epoch, 'clear-cache');
    await diagnostics.perform(epoch, 'clear-cookies');
    await diagnostics.perform(epoch, 'clear-storage');
    expect(clears).toEqual(['cache', 'cookies', 'storage']);
  });

  it('refuses an action for a document that has been replaced', async () => {
    const { diagnostics, events, navigate } = harness();
    diagnostics.layout(true);
    navigate();
    const stale = currentEpoch(events);
    navigate();
    await expect(diagnostics.perform(stale, 'clear-cache')).rejects.toThrow('changed');
  });

  it('replays the current document to a listener that subscribes late', () => {
    const { diagnostics, events, navigate, log } = harness();
    diagnostics.layout(true);
    navigate();
    log('info', 'early');
    vi.advanceTimersByTime(50);
    events.length = 0;
    diagnostics.replay();
    expect(events.map((event) => event.kind)).toEqual([
      'epoch',
      'availability',
      'records',
      'snapshot',
    ]);
  });
});
