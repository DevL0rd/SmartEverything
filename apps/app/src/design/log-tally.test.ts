import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Logger, type LogRecord } from '@smarteverything/logging';
import { LogTally, errorFields, hashText } from './log-tally';

describe('LogTally', () => {
  const records: LogRecord[] = [];

  beforeEach(() => {
    vi.useFakeTimers();
    records.length = 0;
    Logger.configure({
      level: 'debug',
      sink: (record) => {
        records.push(record);
      },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    Logger.reset();
  });

  it('flushes one summary with the counts and extra fields after the window', () => {
    const tally = new LogTally(new Logger('app.design'), 'test.summarised', 1000, () => ({
      live: 3,
    }));
    tally.bump('a');
    tally.bump('a');
    tally.bump('b', 5);
    expect(records).toHaveLength(0);
    vi.advanceTimersByTime(1000);
    expect(records).toHaveLength(1);
    expect(records[0]?.payload).toEqual({ a: 2, b: 5, live: 3, windowMs: 1000 });
  });

  it('counts nothing and logs nothing below the debug level', () => {
    Logger.configure({ level: 'info' });
    const tally = new LogTally(new Logger('app.design'), 'test.summarised', 1000);
    tally.bump('a');
    vi.advanceTimersByTime(2000);
    expect(records).toHaveLength(0);
  });

  it('describes failures and hashes text deterministically', () => {
    expect(errorFields(new TypeError('boom'))).toEqual({
      errorName: 'TypeError',
      errorMessage: 'boom',
    });
    expect(errorFields('plain')).toEqual({ errorMessage: 'plain' });
    expect(hashText('abc')).toBe(hashText('abc'));
    expect(hashText('abc')).not.toBe(hashText('abd'));
  });
});
