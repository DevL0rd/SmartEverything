import { afterEach, describe, expect, it, vi } from 'vitest';
import { Decisions } from '../../src/automations/driver/decisions';
import { DECISION_WINDOW_MS } from '../../src/store/repositories/automation-decisions';
import type { DroppedRun } from '../../src/store/repositories/automation-decisions';

const BASE = Date.UTC(2026, 9, 19, 9, 0, 0);

function setup(): {
  decisions: Decisions;
  rows: DroppedRun[];
  advance: (ms: number) => void;
} {
  let now = BASE;
  const rows: DroppedRun[] = [];
  const decisions = new Decisions(
    {
      record: (row): void => {
        rows.push(row);
      },
    },
    { now: (): Date => new Date(now) },
  );
  return {
    decisions,
    rows,
    advance: (ms: number): void => {
      now += ms;
    },
  };
}

describe('Decisions windows', () => {
  afterEach((): void => {
    vi.useRealTimers();
  });

  it('writes the aggregated count of an expired window when another key is recorded', (): void => {
    const { decisions, rows, advance } = setup();
    for (let i = 0; i < 50; i += 1) decisions.record('a', 'single_busy');
    expect(rows).toHaveLength(1);
    advance(DECISION_WINDOW_MS);
    decisions.record('b', 'queue_full');
    expect(rows.filter((row) => row.times === 49)).toHaveLength(1);
    decisions.flush();
    expect(rows.filter((row) => row.times === 49)).toHaveLength(1);
  });

  it('writes the aggregated count when the window ends with no further traffic', (): void => {
    vi.useFakeTimers({ now: BASE });
    const rows: DroppedRun[] = [];
    const decisions = new Decisions(
      {
        record: (row): void => {
          rows.push(row);
        },
      },
      { now: (): Date => new Date(Date.now()) },
    );
    for (let i = 0; i < 50; i += 1) decisions.record('a', 'single_busy');
    vi.advanceTimersByTime(DECISION_WINDOW_MS + 1);
    expect(rows.filter((row) => row.times === 49)).toHaveLength(1);
    decisions.flush();
    expect(rows.filter((row) => row.times === 49)).toHaveLength(1);
  });
});
