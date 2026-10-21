import { API_ENDPOINTS, type JsonValue, type ScheduleRow } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { useRig } from './support/use-rig';

const rig = useRig();

interface ToolStep {
  readonly kind: 'tool';
  readonly tool: string;
  readonly args: Record<string, JsonValue>;
  readonly stopOnFailure: boolean;
}

function lamp(value: boolean, stopOnFailure = false): ToolStep {
  return {
    kind: 'tool',
    tool: 'device_control',
    args: {
      deviceIds: [rig().ids.lamp], capability: 'power', value,
    },
    stopOnFailure,
  };
}

function failing(stopOnFailure: boolean): ToolStep {
  return {
    kind: 'tool',
    tool: 'device_read',
    args: { deviceId: '0d000000-0000-4000-8000-0000000000aa' },
    stopOnFailure,
  };
}

function lampTwo(value: boolean): ToolStep {
  return {
    kind: 'tool',
    tool: 'device_control',
    args: {
      deviceIds: [rig().ids.lampTwo], capability: 'power', value,
    },
    stopOnFailure: false,
  };
}

async function schedule(
  timing:
    | { kind: 'in'; seconds: number }
    | { kind: 'at'; at: string }
    | { kind: 'series'; everySeconds: number; count: number }
    | { kind: 'times'; times: string[] },
  steps: readonly (ToolStep | { kind: 'wait'; seconds: number })[],
  label: string | null = null,
): Promise<ScheduleRow> {
  const saved = await rig().request(API_ENDPOINTS.createSchedule, {
    body: { label, timing, steps: [...steps] },
  });
  return saved.schedule;
}

async function stateOf(id: string): Promise<ScheduleRow> {
  const rows = await rig().request(API_ENDPOINTS.listSchedules);
  const row = rows.find((candidate) => candidate.id === id);
  if (row === undefined) throw new Error('The schedule is gone.');
  return row;
}

async function reaches(id: string, state: ScheduleRow['state']): Promise<void> {
  await rig().until(async () => (await stateOf(id)).state === state);
}

describe('C30 one-off scheduled actions', () => {
  it('runs after the given seconds, records the step result and finishes', async () => {
    const row = await schedule({ kind: 'in', seconds: 240 }, [lamp(false)], 'Off soon');
    expect(row).toMatchObject({ state: 'scheduled', next_at: '2026-10-08T10:04:00.000Z' });
    rig().clock.advanceTo('2026-10-08T10:03:59.000Z');
    await rig().settle();
    expect(rig().commands()).toHaveLength(0);
    rig().clock.advanceTo('2026-10-08T10:04:00.000Z');
    await reaches(row.id, 'done');
    const done = await stateOf(row.id);
    expect(done.results).toMatchObject([{ occurrence: 0, step: 0, outcome: 'ok', late_ms: 0 }]);
    expect(done.finished_at).not.toBeNull();
    expect(rig().sent()).toStrictEqual([['lamp-1', 'power', false]]);
  });

  it('runs at a clock time at home: today if it is still ahead, otherwise tomorrow', async () => {
    const ahead = await schedule({ kind: 'at', at: '10:30' }, [lamp(true)]);
    const passed = await schedule({ kind: 'at', at: '09:00' }, [lampTwo(true)], 'Tomorrow');
    expect([ahead.next_at, passed.next_at]).toStrictEqual([
      '2026-10-08T10:30:00.000Z',
      '2026-10-09T09:00:00.000Z',
    ]);
  });

  it('runs at an exact moment with its offset', async () => {
    const row = await schedule({ kind: 'at', at: '2026-10-08T14:00:00+02:00' }, [lamp(true)]);
    expect(row.next_at).toBe('2026-10-08T12:00:00.000Z');
  });

  it('runs a series every N seconds, a given number of times, one interval from now', async () => {
    const row = await schedule({ kind: 'series', everySeconds: 60, count: 3 }, [lamp(true)]);
    expect(row.occurrences).toStrictEqual([
      '2026-10-08T10:01:00.000Z',
      '2026-10-08T10:02:00.000Z',
      '2026-10-08T10:03:00.000Z',
    ]);
    for (const minute of ['10:01', '10:02', '10:03']) {
      rig().clock.advanceTo(`2026-10-08T${minute}:00.000Z`);
      await rig().until(
        async () => (await stateOf(row.id)).results.length === Number(minute.slice(-2)),
      );
    }
    await reaches(row.id, 'done');
    expect(rig().commands()).toHaveLength(3);
  });

  it('runs at each of several explicit times in order', async () => {
    const row = await schedule(
      { kind: 'times', times: ['2026-10-08T10:05:00Z', '2026-10-08T10:02:00Z'] },
      [lamp(true)],
    );
    expect(row.occurrences).toStrictEqual(['2026-10-08T10:02:00.000Z', '2026-10-08T10:05:00.000Z']);
  });

  it('waits between steps and goes on with the next step afterwards', async () => {
    const row = await schedule({ kind: 'in', seconds: 10 }, [
      lamp(true),
      { kind: 'wait', seconds: 30 },
      lampTwo(true),
    ]);
    rig().clock.advanceTo('2026-10-08T10:00:10.000Z');
    await reaches(row.id, 'waiting');
    expect((await stateOf(row.id)).next_at).toBe('2026-10-08T10:00:40.000Z');
    expect(rig().sent()).toStrictEqual([['lamp-1', 'power', true]]);
    rig().clock.advanceTo('2026-10-08T10:00:40.000Z');
    await reaches(row.id, 'done');
    expect(rig().sent()).toStrictEqual([
      ['lamp-1', 'power', true],
      ['lamp-2', 'power', true],
    ]);
  });

  it('stops the remaining steps of a run when a step marked stop-on-failure fails', async () => {
    const row = await schedule({ kind: 'in', seconds: 10 }, [failing(true), lampTwo(true)]);
    rig().clock.advanceTo('2026-10-08T10:00:10.000Z');
    await reaches(row.id, 'failed');
    const failed = await stateOf(row.id);
    expect(failed.results.map((result) => [result.step, result.outcome])).toStrictEqual([
      [0, 'failed'],
    ]);
    expect(rig().commands()).toHaveLength(0);
  });

  it('goes on with the next step after a failure that is not marked stop-on-failure', async () => {
    const row = await schedule({ kind: 'in', seconds: 10 }, [failing(false), lampTwo(true)]);
    rig().clock.advanceTo('2026-10-08T10:00:10.000Z');
    await reaches(row.id, 'failed');
    const failed = await stateOf(row.id);
    expect(failed.results.map((result) => [result.step, result.outcome])).toStrictEqual([
      [0, 'failed'],
      [1, 'ok'],
    ]);
    expect(rig().sent()).toStrictEqual([['lamp-2', 'power', true]]);
  });

  it('runs an AI step as a turn for the person who scheduled it', async () => {
    const saved = await rig().request(API_ENDPOINTS.createSchedule, {
      body: {
        label: 'Briefing',
        timing: { kind: 'in', seconds: 10 },
        steps: [{ kind: 'ai', prompt: 'Summarise the night', chatId: null, stopOnFailure: false }],
      },
    });
    rig().clock.advanceTo('2026-10-08T10:00:10.000Z');
    await rig().until(async () => (await stateOf(saved.schedule.id)).results.length === 1);
    const [result] = (await stateOf(saved.schedule.id)).results;
    expect([result?.step, result?.outcome, result?.line]).toStrictEqual([
      0,
      'ok',
      'Summarise the night',
    ]);
  });

  it('cancels a waiting action so it never runs', async () => {
    const row = await schedule({ kind: 'in', seconds: 60 }, [lamp(true)]);
    const cancelled = await rig().request(API_ENDPOINTS.cancelSchedule, {
      params: { scheduleId: row.id },
    });
    expect(cancelled.state).toBe('cancelled');
    rig().clock.advanceTo('2026-10-08T10:02:00.000Z');
    await rig().settle();
    expect(rig().commands()).toHaveLength(0);
  });

  it('runs now instead of waiting', async () => {
    const row = await schedule({ kind: 'in', seconds: 3600 }, [lamp(true)]);
    await rig().request(API_ENDPOINTS.runSchedule, {
      params: { scheduleId: row.id },
      body: {},
    });
    rig().clock.advanceTo('2026-10-08T10:00:00.000Z');
    await reaches(row.id, 'done');
    expect(rig().commands()).toHaveLength(1);
  });

  it('changes the timing of an action that has not run, counted from now', async () => {
    const row = await schedule({ kind: 'in', seconds: 600 }, [lamp(true)]);
    const changed = await rig().request(API_ENDPOINTS.updateSchedule, {
      params: { scheduleId: row.id },
      body: { timing: { kind: 'in', seconds: 30 } },
    });
    expect(changed.schedule.next_at).toBe('2026-10-08T10:00:30.000Z');
  });

  it('skips occurrences that were missed while the hub was away and says so', async () => {
    const row = await schedule(
      {
        kind: 'times',
        times: ['2026-10-08T10:01:00Z', '2026-10-08T10:02:00Z', '2026-10-08T10:03:00Z'],
      },
      [lamp(true)],
    );
    rig().clock.jumpTo('2026-10-08T10:10:00.000Z');
    rig().clock.advanceTo('2026-10-08T10:10:00.000Z');
    await reaches(row.id, 'done');
    const outcomes = (await stateOf(row.id)).results.map((result) => [
      result.occurrence,
      result.outcome,
      result.line,
    ]);
    expect(outcomes).toStrictEqual([
      [0, 'missed', 'Skipped 2 missed runs'],
      [2, 'ok', expect.any(String)],
    ]);
  });

  it('keeps finished actions for seven days and then removes them', async () => {
    const first = await schedule({ kind: 'in', seconds: 10 }, [lamp(true)]);
    rig().clock.advanceTo('2026-10-08T10:00:10.000Z');
    await reaches(first.id, 'done');
    const later = await schedule({ kind: 'in', seconds: 8 * 86_400 }, [lampTwo(true)]);
    rig().clock.advanceTo('2026-10-16T10:00:10.000Z');
    await reaches(later.id, 'done');
    const ids = (await rig().request(API_ENDPOINTS.listSchedules)).map((row) => row.id);
    expect(ids).toStrictEqual([later.id]);
  });

  it('refuses a time that has already passed or lies more than a year ahead', async () => {
    const passed = await rig().refused(API_ENDPOINTS.createSchedule, {
      body: { timing: { kind: 'at', at: '2026-10-08T09:00:00Z' }, steps: [lamp(true)] },
    });
    const tooFar = await rig().refused(API_ENDPOINTS.createSchedule, {
      body: { timing: { kind: 'at', at: '2028-10-08T09:00:00Z' }, steps: [lamp(true)] },
    });
    expect([passed.status, passed.message]).toStrictEqual([400, 'That time has already passed.']);
    expect(tooFar.message).toContain('at most a year ahead');
  });

  it('refuses a step whose tool would be refused and saves nothing', async () => {
    const refusal = await rig().refused(API_ENDPOINTS.createSchedule, {
      body: {
        timing: { kind: 'in', seconds: 60 },
        steps: [{ kind: 'tool', tool: 'no_such_tool', args: {}, stopOnFailure: false }],
      },
    });
    expect(refusal.status).toBe(400);
    expect(refusal.message).toContain('Step 1');
    expect(await rig().request(API_ENDPOINTS.listSchedules)).toHaveLength(0);
  });

  it('lists a finished action only after it is cancelled or done, and removes only finished ones', async () => {
    const row = await schedule({ kind: 'in', seconds: 60 }, [lamp(true)]);
    const active = await rig().refused(API_ENDPOINTS.removeSchedule, {
      params: { scheduleId: row.id },
    });
    expect(active.status).toBe(409);
    await rig().request(API_ENDPOINTS.cancelSchedule, { params: { scheduleId: row.id } });
    await rig().request(API_ENDPOINTS.removeSchedule, { params: { scheduleId: row.id } });
    expect(await rig().request(API_ENDPOINTS.listSchedules)).toHaveLength(0);
  });
});
