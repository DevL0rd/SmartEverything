import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { SmartThingsCommand } from '../src/bindings';
import {
  MAX_COMMANDS_PER_REQUEST,
  nextRequestAt,
  outcomesOf,
  pruneHistory,
  RATE_WINDOW_MS,
  REQUESTS_PER_WINDOW,
  takeBatch,
  type QueuedCommand,
} from '../src/command-batching';
import { SmartThingsResponseError } from '../src/errors';

function commands(count: number): readonly SmartThingsCommand[] {
  return Array.from({ length: count }, (_, index) => ({
    component: 'main',
    capability: 'switch',
    command: `c${String(index)}`,
  }));
}

function queued(ticket: string, count: number): QueuedCommand<string> {
  return { ticket, commands: commands(count) };
}

describe('batching commands', () => {
  it('follows the documented limits', () => {
    expect(MAX_COMMANDS_PER_REQUEST).toBe(10);
    expect(REQUESTS_PER_WINDOW).toBe(12);
    expect(RATE_WINDOW_MS).toBe(60_000);
  });

  it('puts whole requests into one batch up to ten commands', () => {
    const { batch, rest } = takeBatch([queued('a', 4), queued('b', 6), queued('c', 1)]);
    expect(batch.tickets).toEqual(['a', 'b']);
    expect(batch.commands).toHaveLength(10);
    expect(rest.map((entry) => entry.ticket)).toEqual(['c']);
  });

  it('never splits one request, even one larger than a batch', () => {
    const { batch, rest } = takeBatch([queued('big', 12), queued('next', 1)]);
    expect(batch.tickets).toEqual(['big']);
    expect(batch.commands).toHaveLength(12);
    expect(rest.map((entry) => entry.ticket)).toEqual(['next']);
  });

  it('keeps the order and loses nothing', () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: 1, max: 10 }), { maxLength: 20 }), (sizes) => {
        let queue = sizes.map((size, index) => queued(String(index), size));
        const order: string[] = [];
        while (queue.length > 0) {
          const { batch, rest } = takeBatch(queue);
          expect(batch.tickets.length).toBeGreaterThan(0);
          expect(batch.commands.length).toBeLessThanOrEqual(MAX_COMMANDS_PER_REQUEST);
          order.push(...batch.tickets);
          queue = [...rest];
        }
        expect(order).toEqual(sizes.map((_, index) => String(index)));
      }),
    );
  });

  it('takes nothing from an empty queue', () => {
    expect(takeBatch([])).toEqual({ batch: { tickets: [], commands: [] }, rest: [] });
  });
});

describe('the per-device rate limit', () => {
  const minute = Array.from({ length: 12 }, (_, index) => 1000 + index * 1000);

  it('sends at once while fewer than twelve requests went out in the last minute', () => {
    expect(nextRequestAt(minute.slice(0, 11), 12_000)).toBe(12_000);
    expect(nextRequestAt([], 5)).toBe(5);
  });

  it('waits until the oldest of the last twelve leaves the window', () => {
    expect(nextRequestAt(minute, 13_000)).toBe(61_000);
    expect(nextRequestAt([500, ...minute], 13_000)).toBe(61_000);
  });

  it('forgets requests older than a minute', () => {
    expect(nextRequestAt(minute, 61_000)).toBe(61_000);
    expect(pruneHistory([1000, 2000, 3000], 61_000)).toEqual([2000, 3000]);
    expect(pruneHistory([1000, 1001], 61_000)).toEqual([1001]);
  });

  it('never allows more than twelve requests in any minute', () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: 0, max: 5000 }), { maxLength: 40 }), (gaps) => {
        let now = 0;
        let history: readonly number[] = [];
        const sent: number[] = [];
        for (const gap of gaps) {
          now = Math.max(now + gap, nextRequestAt(history, now + gap));
          history = [...pruneHistory(history, now), now];
          sent.push(now);
        }
        for (const at of sent) {
          expect(
            sent.filter((other) => other > at - RATE_WINDOW_MS && other <= at).length,
          ).toBeLessThanOrEqual(12);
        }
      }),
    );
  });
});

describe('command results', () => {
  it('reads one result per command', () => {
    expect(
      outcomesOf(
        {
          results: [
            { id: 'a', status: 'ACCEPTED' },
            { id: 'b', status: 'FAILED' },
          ],
        },
        2,
      ),
    ).toEqual([{ status: 'ACCEPTED' }, { status: 'FAILED' }]);
  });

  it('refuses a malformed answer or one with the wrong number of results', () => {
    expect(() => outcomesOf({ results: [{ id: 'a', status: 'DONE' }] }, 1)).toThrow(
      SmartThingsResponseError,
    );
    expect(() => outcomesOf({ results: 'none' }, 1)).toThrow(
      'The SmartThings command response did not have the expected shape: results.',
    );
    expect(() => outcomesOf({ results: [] }, 1)).toThrow(
      'The SmartThings command response did not have the expected shape: expected 1 results.',
    );
  });
});
