import { Logger, type LogRecord } from '@smarteverything/logging';
import { afterEach, describe, expect, it } from 'vitest';
import { CountSummary } from '../src/providers/count-summary';
import { RepeatLog } from '../src/providers/repeat-log';

function harness(): { repeat: RepeatLog; records: LogRecord[]; tick: (ms: number) => void } {
  const records: LogRecord[] = [];
  Logger.configure({ level: 'trace', sink: (record) => records.push(record) });
  let clock = 1000;
  const repeat = new RepeatLog(new Logger('hub.test'), 100, () => clock);
  return {
    repeat,
    records,
    tick: (ms: number): void => {
      clock += ms;
    },
  };
}

describe('RepeatLog', () => {
  afterEach(() => {
    Logger.reset();
  });

  it('logs the first occurrence at once and counts the repeats inside the window', () => {
    const { repeat, records, tick } = harness();
    repeat.warn('thing.refused', 'a', { did: '1' });
    tick(10);
    repeat.warn('thing.refused', 'a', { did: '1' });
    repeat.warn('thing.refused', 'a', { did: '1' });
    expect(records).toHaveLength(1);
    tick(100);
    repeat.warn('thing.refused', 'a', { did: '1' });
    expect(records).toHaveLength(2);
    expect(records[1]?.payload).toMatchObject({ did: '1', suppressed: 2, windowMs: 100 });
  });

  it('keeps separate tallies per key', () => {
    const { repeat, records } = harness();
    repeat.info('thing.refused', 'a');
    repeat.debug('thing.refused', 'b');
    expect(records).toHaveLength(2);
  });
});

describe('CountSummary', () => {
  afterEach(() => {
    Logger.reset();
  });

  it('flushes the counts of one window as a single record once the window has passed', () => {
    const records: LogRecord[] = [];
    Logger.configure({ level: 'trace', sink: (record) => records.push(record) });
    let clock = 0;
    const summary = new CountSummary(new Logger('hub.test'), 'thing.summary', {
      context: { id: 'x' },
      windowMs: 100,
      now: (): number => clock,
    });
    summary.count('text');
    summary.count('text');
    expect(records).toHaveLength(0);
    clock = 150;
    summary.count('state');
    expect(records).toHaveLength(1);
    expect(records[0]?.payload).toMatchObject({
      id: 'x',
      windowMs: 150,
      counts: { text: 2, state: 1 },
    });
  });
});
