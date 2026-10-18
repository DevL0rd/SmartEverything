import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ModStreams, type StreamSink } from '../../src/claude/streams';
import type { Clock } from '../../src/clock';
import { testLogger } from '../support/logs';

function movableClock(): { readonly clock: Clock; readonly move: (milliseconds: number) => void } {
  let now = Date.parse('2026-10-18T00:00:00.000Z');
  return {
    clock: {
      now: () => new Date(now),
      at: () => (): void => undefined,
      sleep: () => Promise.resolve(),
    },
    move: (milliseconds: number): void => {
      now += milliseconds;
    },
  };
}

function remembered(streams: ModStreams): number {
  return z.instanceof(Map).parse(Reflect.get(streams, 'recent')).size;
}

function sink(): StreamSink {
  return { write: (): undefined => undefined, close: (): undefined => undefined };
}

describe('ModStreams', () => {
  it('forgets a session once its stream has been closed for longer than the grace period', () => {
    const { clock, move } = movableClock();
    const streams = new ModStreams({
      clock,
      log: testLogger('streams'),
      changed: (): undefined => undefined,
    });
    const closes = Array.from({ length: 50 }, () => new AbortController());
    closes.forEach((close, index) => {
      streams.attach(`session-${String(index)}`, sink(), close.signal);
    });
    expect(streams.sessions()).toHaveLength(50);

    closes.forEach((close) => {
      close.abort();
    });
    move(34_000);
    expect(streams.sessions()).toHaveLength(50);
    expect(streams.has('session-3')).toBe(true);

    move(2000);
    expect(streams.sessions()).toEqual([]);
    expect(streams.has('session-3')).toBe(false);
    expect(remembered(streams)).toBe(0);
  });

  it('keeps a session whose stream is still open past the grace period', () => {
    const { clock, move } = movableClock();
    const streams = new ModStreams({
      clock,
      log: testLogger('streams'),
      changed: (): undefined => undefined,
    });
    const open = new AbortController();
    streams.attach('open', sink(), open.signal);
    const gone = new AbortController();
    streams.attach('gone', sink(), gone.signal);
    gone.abort();
    move(60_000);
    expect(streams.sessions()).toEqual(['open']);
    expect(streams.has('open')).toBe(true);
    expect(remembered(streams)).toBe(1);
  });
});
