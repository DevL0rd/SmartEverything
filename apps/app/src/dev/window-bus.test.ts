import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Logger, type LogRecord } from '@smarteverything/logging';

const records: LogRecord[] = [];

vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'performance', 'Date'] });
const { addContributor, setScreen } = await import('./window-bus');
const { functionNames } = await import('./bridge-probe');
const { TimelineTally } = await import('./observer-probe');

beforeEach(() => {
  records.length = 0;
  Logger.configure({ sink: (record) => records.push(record), level: 'debug' });
});

function windows(): Readonly<Record<string, unknown>>[] {
  return records.filter((record) => record.event === 'perf.window').map((record) => record.payload);
}

describe('window bus', () => {
  it('logs one window per interval with every contributor, and a window per route change', () => {
    setScreen('home');
    let calls = 0;
    const remove = addContributor('test', {
      fields: () => {
        calls += 1;
        return { calls };
      },
      details: () => [
        { kind: 'probe', top: 'a:1/2/0' },
        { kind: 'empty', top: '' },
      ],
    });
    vi.advanceTimersByTime(5000);
    vi.advanceTimersByTime(1000);
    setScreen('assistant/chat');
    vi.advanceTimersByTime(5000);
    remove();
    vi.advanceTimersByTime(10000);
    expect(windows().map((w) => [w['screen'], w['calls']])).toEqual([
      ['home', 1],
      ['home', 2],
      ['assistant/chat', 3],
    ]);
    expect(records.filter((record) => record.event === 'perf.detail')).toHaveLength(3);
  });
});

describe('native module functions', () => {
  it('finds own and prototype functions and skips the event emitter API', () => {
    class Base {
      request(): number {
        return 1;
      }
      addListener(): void {
        return undefined;
      }
    }
    const module = Object.assign(new Base(), { configure: (): number => 2, value: 3 });
    expect(functionNames(module).sort()).toEqual(['configure', 'request']);
  });

  it('leaves exported native classes unwrapped so they stay constructible', () => {
    class NativeRequest {
      cancel(): void {
        return undefined;
      }
    }
    const module = { NativeRequest, start: (): number => 1 };
    expect(functionNames(module)).toEqual(['start']);
  });
});

describe('timeline tally', () => {
  it('sums long tasks, slow taps and connection time from performance entries', () => {
    const tally = new TimelineTally();
    const entry = (
      entryType: string,
      duration: number,
      extra: Readonly<Record<string, number>> = {},
      name = 'x',
    ): PerformanceEntry =>
      Object.assign(
        { name, entryType, startTime: 10, duration, toJSON: (): object => ({}) },
        extra,
      );
    tally.add(entry('longtask', 120));
    tally.add(entry('event', 180, { processingStart: 70 }));
    tally.add(
      entry(
        'resource',
        90,
        { connectStart: 1, secureConnectionStart: 5, connectEnd: 25, encodedBodySize: 2048 },
        '/api/home',
      ),
    );
    expect(tally.fields()).toMatchObject({
      obsLt: 1,
      obsLtMax: 120,
      evN: 1,
      evSlow: 1,
      evMaxMs: 180,
      evDelayMax: 60,
      resN: 1,
      resKb: 2,
      connMs: 24,
      tlsMs: 20,
    });
  });
});
