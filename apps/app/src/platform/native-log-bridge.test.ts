import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Logger, type LogRecord } from '@smarteverything/logging';

const diagnostics = vi.hoisted(() => ({
  setLogLevel: vi.fn((_level: string) => true),
  addListener: vi.fn(),
  present: false,
}));

vi.mock('expo', () => ({
  NativeModule: Object,
  requireOptionalNativeModule: (): typeof diagnostics | null =>
    diagnostics.present ? diagnostics : null,
}));

import {
  forwardNativeLog,
  startNativeLogBridge,
  syncNativeLogLevel,
} from '../../modules/health-connect/src/native-log';

describe('native log bridge', () => {
  const records: LogRecord[] = [];

  beforeEach(() => {
    records.length = 0;
    Logger.configure({
      level: 'trace',
      sink: (record) => {
        records.push(record);
      },
    });
  });

  afterEach(() => {
    Logger.reset();
  });

  it('forwards a native record under the native scope with its level and payload', () => {
    forwardNativeLog({
      level: 'warn',
      scope: 'hub-route',
      event: 'probe.failed',
      at: 10,
      seq: 3,
      thread: 'main',
      durationMs: 42,
      errorName: 'SocketTimeoutException',
      scopeId: 'native:server:abcd1234',
    });
    expect(records).toHaveLength(1);
    const [record] = records;
    expect(record?.scope).toBe('app.native');
    expect(record?.level).toBe('warn');
    expect(record?.event).toBe('probe.failed');
    expect(record?.payload).toMatchObject({
      nativeScope: 'hub-route',
      nativeDurationMs: 42,
      nativeSeq: 3,
      errorName: 'SocketTimeoutException',
    });
  });

  it('keeps the logger from throwing on an invalid native event name', () => {
    expect(() => {
      forwardNativeLog({ level: 'info', scope: 'x', event: 'Bad Name' });
    }).not.toThrow();
    expect(records[0]?.event).toBe('log.invalid_event');
    expect(records[0]?.payload).toMatchObject({ receivedEvent: 'Bad Name' });
  });

  it('renames fields the redactor would blank and survives malformed input', () => {
    forwardNativeLog({ level: 'debug', scope: 'hub-socket', event: 'socket.closed', code: 1006 });
    expect(records[0]?.payload).toMatchObject({ native_code: 1006 });
    expect(() => {
      forwardNativeLog('nonsense');
      forwardNativeLog(null);
    }).not.toThrow();
  });

  it('maps native error records to the error level', () => {
    forwardNativeLog({ level: 'error', scope: 'native-guard', event: 'entry.failed', entry: 'x' });
    expect(records[0]?.level).toBe('error');
  });

  it('pushes the level once at start and again only when it changes, without a timer', () => {
    vi.useFakeTimers();
    Logger.configure({ level: 'info' });
    syncNativeLogLevel();
    expect(diagnostics.setLogLevel).not.toHaveBeenCalled();
    diagnostics.present = true;
    startNativeLogBridge();
    expect(diagnostics.setLogLevel.mock.calls).toEqual([['info']]);
    expect(diagnostics.addListener).toHaveBeenCalledWith('onLog', forwardNativeLog);
    vi.advanceTimersByTime(60_000);
    syncNativeLogLevel();
    expect(diagnostics.setLogLevel).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    Logger.configure({ level: 'debug' });
    syncNativeLogLevel();
    expect(diagnostics.setLogLevel.mock.calls).toEqual([['info'], ['debug']]);
    vi.useRealTimers();
  });
});
