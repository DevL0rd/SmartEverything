import { describe, expect, it } from 'vitest';
import {
  SCHEDULE_LIMITS,
  SCHEDULE_STEPS,
  SCHEDULE_TIMING,
  isScheduleActive,
  type ScheduleState,
} from '../src';

const parseTiming = (value: unknown): boolean => SCHEDULE_TIMING.safeParse(value).success;

describe('C30 schedule timing', () => {
  it('knows a moment or a clock time, seconds from now, a series and explicit times', () => {
    expect([
      parseTiming({ kind: 'at', at: '2026-10-08T14:00:00+02:00' }),
      parseTiming({ kind: 'at', at: '08:30' }),
      parseTiming({ kind: 'at', at: 'tomorrow' }),
      parseTiming({ kind: 'in', seconds: 240 }),
      parseTiming({ kind: 'in', seconds: 0 }),
      parseTiming({ kind: 'series', everySeconds: 10, count: 100 }),
      parseTiming({ kind: 'series', everySeconds: 9, count: 3 }),
      parseTiming({ kind: 'series', everySeconds: 60, count: 101 }),
      parseTiming({ kind: 'times', times: ['2026-10-08T10:00:00Z'] }),
      parseTiming({ kind: 'times', times: [] }),
    ]).toStrictEqual([true, true, false, true, false, true, false, false, true, false]);
  });

  it('allows at most a year ahead for a relative time', () => {
    expect(parseTiming({ kind: 'in', seconds: SCHEDULE_LIMITS.horizonSeconds })).toBe(true);
    expect(parseTiming({ kind: 'in', seconds: SCHEDULE_LIMITS.horizonSeconds + 1 })).toBe(false);
  });
});

describe('C30 schedule steps', () => {
  it('runs tools, AI turns and waits, and defaults stop-on-failure to off', () => {
    const steps = SCHEDULE_STEPS.parse([
      { kind: 'tool', tool: 'control_devices', args: {} },
      { kind: 'wait', seconds: 30 },
      { kind: 'ai', prompt: 'Say hi' },
    ]);
    expect(steps.map((step) => step.kind)).toStrictEqual(['tool', 'wait', 'ai']);
    expect(steps[0]).toMatchObject({ stopOnFailure: false });
    expect(steps[2]).toMatchObject({ chatId: null, stopOnFailure: false });
  });

  it('needs at least one step, at most fifty, and waits of at most a week', () => {
    expect(SCHEDULE_STEPS.safeParse([]).success).toBe(false);
    expect(
      SCHEDULE_STEPS.safeParse(Array.from({ length: 51 }, () => ({ kind: 'wait', seconds: 1 })))
        .success,
    ).toBe(false);
    expect(
      SCHEDULE_STEPS.safeParse([{ kind: 'wait', seconds: SCHEDULE_LIMITS.waitSeconds + 1 }])
        .success,
    ).toBe(false);
  });
});

describe('C30 schedule states', () => {
  it('is active while scheduled, running or waiting and finished otherwise', () => {
    const states: ScheduleState[] = [
      'scheduled',
      'running',
      'waiting',
      'done',
      'failed',
      'cancelled',
    ];
    expect(states.map(isScheduleActive)).toStrictEqual([true, true, true, false, false, false]);
  });
});
