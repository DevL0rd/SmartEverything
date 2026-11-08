import { describe, expect, it } from 'vitest';
import { processExitRecord } from './process-exit-log';

const exit = {
  at: '2026-11-05T01:00:00.000Z',
  status: 0,
  process: 'com.example.app',
  description: null,
};

describe('Android exit logs', () => {
  it.each(['code_15', 'code_16', 'package_state_change', 'package_updated'])(
    'records %s as a normal exit',
    (reason) => {
      const record = processExitRecord({ ...exit, reason });
      expect(record).toMatchObject({ level: 'info', event: 'process.exited' });
      expect(record.failure).toBeUndefined();
    },
  );

  it('records one Java exception with Android’s original timestamp and trace', () => {
    const record = processExitRecord({
      ...exit,
      reason: 'crash',
      nativeTrace: {
        state: 'java',
        name: 'IllegalStateException',
        message: 'Invalid state',
        frame: 'Example.run(Example.java:12)',
      },
    });
    expect(record).toMatchObject({
      timestamp: exit.at,
      level: 'exception',
      event: 'native.uncaught',
      failure: {
        name: 'IllegalStateException',
        message: 'Invalid state',
        stack: 'Example.run(Example.java:12)',
      },
      payload: { processExit: { reason: 'crash', nativeTrace: { state: 'java' } } },
    });
  });

  it('retains native signal details on a process crash', () => {
    const nativeTrace = { state: 'captured', signal: 11, signalCode: 1, frames: [] } as const;
    const record = processExitRecord({
      ...exit,
      reason: 'crash_native',
      nativeTrace: { ...nativeTrace, frames: [] },
    });
    expect(record).toMatchObject({
      level: 'error',
      payload: { processExit: { reason: 'crash_native', nativeTrace } },
    });
  });
});
