import type { JsonValue } from '@smarteverything/domain';
import { beforeEach, describe, expect, it } from 'vitest';
import { ActionRunner, UnknownSceneError } from '../src/automations/actions';
import type { AutomationRow, RowChange } from '@smarteverything/domain';
import { onlyRunBookkeeping } from '../src/automations/changes';
import { type AutomationRun, AutomationEngine } from '../src/automations/engine';
import type { AutomationRecord, CommandRow } from '../src/database/port';
import { AutomationAiSlot } from '../src/automations/automation-ai';
import { eventSignal, stateSignal } from '../src/signals/sources/device';
import { FakeClock } from './support/fake-clock';
import { FakeDatabase } from './support/fake-database';
import { nextId } from './support/ids';
import { captureLogs, testLogger, type CapturedLogs } from './support/logs';

const LAMP = '1a000000-0000-4000-8000-000000000001';
const SENSOR = '1a000000-0000-4000-8000-000000000002';
const SCENE = '1b000000-0000-4000-8000-000000000001';
const NOW = '2026-10-08T10:00:00.000Z';
const EVENT_ID = '1c000000-0000-4000-8000-000000000001';

interface Setup {
  db: FakeDatabase;
  clock: FakeClock;
  engine: AutomationEngine;
  submitted: CommandRow[];
  notes: string[];
  runs: AutomationRun[];
  state: Map<string, JsonValue>;
}

function automation(
  definition: unknown,
  overrides: Partial<AutomationRecord> = {},
): AutomationRecord {
  return {
    id: nextId(),
    name: 'Rule',
    enabled: true,
    definition,
    runCount: 0,
    lastError: null,
    ...overrides,
  };
}

const lampOn = { type: 'command', deviceId: LAMP, capability: 'power', value: true };
const all = { mode: 'all', items: [] };

function setup(start = '2026-10-08T10:00:00.000Z'): Setup {
  const db = new FakeDatabase();
  const clock = new FakeClock(start);
  const submitted: CommandRow[] = [];
  const notes: string[] = [];
  const state = new Map<string, JsonValue>();
  const runs: AutomationRun[] = [];
  const engine: AutomationEngine = new AutomationEngine({
    store: db,
    recordRun: (run): void => {
      runs.push(run);
    },
    actions: () => actions,
    valueOf: (deviceId, capability) => state.get(`${deviceId}|${capability}`),
    forecast: () => null,
    armers: [],
    clock,
    log: testLogger(),
  });
  const actions = new ActionRunner({
    store: db,
    submit: (rows): void => {
      submitted.push(...rows);
    },
    sceneActions: (sceneId): ReturnType<AutomationEngine['sceneActions']> =>
      engine.sceneActions(sceneId),
    notify: (origin, message): void => {
      notes.push(`${origin.name}: ${message}`);
    },
    ai: new AutomationAiSlot(),
    clock,
  });
  return { db, clock, engine, submitted, notes, runs, state };
}

async function settle(): Promise<void> {
  for (let turn = 0; turn < 5; turn += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

let logs: CapturedLogs;

beforeEach(() => {
  logs = captureLogs();
});

describe('AutomationEngine', () => {
  it('runs a state-triggered automation when the comparison becomes true and records the run', async () => {
    const { db, engine, submitted, runs } = setup();
    const rule = automation(
      {
        triggers: [
          {
            type: 'state',
            deviceId: SENSOR,
            capability: 'temperature',
            comparison: { operator: 'gt', value: 25 },
          },
        ],
        conditions: all,
        actions: [lampOn, { type: 'delay', seconds: 2 }, { type: 'notify', message: 'Warm' }],
      },
      { runCount: 4 },
    );
    db.automations = [rule];
    await engine.reload();
    engine.signal(
      stateSignal({ deviceId: SENSOR, capability: 'temperature', value: 26, previous: 24 }, NOW),
    );
    engine.signal(
      stateSignal({ deviceId: SENSOR, capability: 'temperature', value: 27, previous: 26 }, NOW),
    );
    await settle();
    expect(
      submitted.map((row) => [row.device_id, row.capability, row.value, row.source]),
    ).toStrictEqual([[LAMP, 'power', true, 'automation']]);
    expect(db.automationChanges).toStrictEqual([
      {
        id: rule.id,
        change: { lastRunAt: '2026-10-08T10:00:00.000Z', runCount: 5, lastError: null },
      },
    ]);
    expect(runs).toStrictEqual([
      {
        automationId: rule.id,
        name: 'Rule',
        startedAt: '2026-10-08T10:00:00.000Z',
        durationMs: 0,
        error: null,
      },
    ]);
  });

  it('delays and notifies between actions', async () => {
    const { db, engine, clock, notes } = setup();
    db.automations = [
      automation(
        {
          triggers: [{ type: 'event', deviceId: null, kind: 'doorbell' }],
          conditions: all,
          actions: [
            { type: 'delay', seconds: 3 },
            { type: 'notify', message: 'Someone is at the door' },
          ],
        },
        { name: 'Door' },
      ),
    ];
    await engine.reload();
    engine.signal(
      eventSignal({
        id: EVENT_ID,
        deviceId: SENSOR,
        kind: 'doorbell',
        occurredAt: NOW,
        details: {},
      }),
    );
    engine.signal(
      eventSignal({ id: EVENT_ID, deviceId: SENSOR, kind: 'motion', occurredAt: NOW, details: {} }),
    );
    await settle();
    expect(clock.sleeps).toStrictEqual([3000]);
    expect(notes).toStrictEqual(['Door: Someone is at the door']);
  });

  it('checks conditions against the current state before running', async () => {
    const { db, engine, submitted, state } = setup();
    db.automations = [
      automation({
        triggers: [{ type: 'event', deviceId: null, kind: 'motion' }],
        conditions: {
          mode: 'all',
          items: [
            {
              type: 'state',
              deviceId: LAMP,
              capability: 'power',
              comparison: { operator: 'eq', value: false },
            },
          ],
        },
        actions: [lampOn],
      }),
    ];
    await engine.reload();
    state.set(`${LAMP}|power`, true);
    engine.signal(
      eventSignal({ id: EVENT_ID, deviceId: null, kind: 'motion', occurredAt: NOW, details: {} }),
    );
    await settle();
    expect(submitted).toHaveLength(0);
    state.set(`${LAMP}|power`, false);
    engine.signal(
      eventSignal({ id: EVENT_ID, deviceId: null, kind: 'motion', occurredAt: NOW, details: {} }),
    );
    await settle();
    expect(submitted).toHaveLength(1);
  });

  it('runs a scene as its device commands with the scene as their source', async () => {
    const { db, engine, submitted } = setup();
    db.scenes = [
      {
        id: SCENE,
        actions: [lampOn, { ...lampOn, deviceId: SENSOR, capability: 'power', value: false }],
      },
    ];
    db.automations = [
      automation({
        triggers: [{ type: 'event', deviceId: null, kind: 'button' }],
        conditions: all,
        actions: [{ type: 'scene', sceneId: SCENE }],
      }),
    ];
    await engine.reload();
    engine.signal(
      eventSignal({ id: EVENT_ID, deviceId: null, kind: 'button', occurredAt: NOW, details: {} }),
    );
    await settle();
    expect(submitted.map((row) => [row.device_id, row.source])).toStrictEqual([
      [LAMP, 'scene'],
      [SENSOR, 'scene'],
    ]);
  });

  it('records the named error when an action fails', async () => {
    const { db, engine, runs } = setup();
    const rule = automation({
      triggers: [{ type: 'event', deviceId: null, kind: 'button' }],
      conditions: all,
      actions: [{ type: 'scene', sceneId: SCENE }],
    });
    db.automations = [rule];
    await engine.reload();
    engine.signal(
      eventSignal({ id: EVENT_ID, deviceId: null, kind: 'button', occurredAt: NOW, details: {} }),
    );
    await settle();
    expect(db.automationChanges[0]?.change.lastError).toBe(
      `UnknownSceneError: ${new UnknownSceneError(SCENE).message}`,
    );
    expect(logs.events()).toContain('automation.run.failed');
    expect(runs.map((run) => run.error)).toStrictEqual([
      `UnknownSceneError: ${new UnknownSceneError(SCENE).message}`,
    ]);
  });

  it('logs a run it could not record', async () => {
    const { db, engine } = setup();
    db.automations = [
      automation({
        triggers: [{ type: 'event', deviceId: null, kind: 'button' }],
        conditions: all,
        actions: [lampOn],
      }),
    ];
    await engine.reload();
    db.failNext = 'updateAutomation';
    engine.signal(
      eventSignal({ id: EVENT_ID, deviceId: null, kind: 'button', occurredAt: NOW, details: {} }),
    );
    await settle();
    expect(logs.events()).toContain('automation.run_not_recorded');
  });

  it('schedules time, sun and interval triggers to their next occurrence and reschedules after each run', async () => {
    const { db, engine, clock, submitted } = setup('2026-10-08T05:00:00.000Z');
    db.home = { timeZone: 'Europe/Berlin', latitude: 52.52, longitude: 13.405 };
    db.automations = [
      automation({
        triggers: [
          { type: 'time', at: '07:30', weekdays: [4] },
          { type: 'interval', everyMinutes: 60 },
          { type: 'sun', event: 'sunset', offsetMinutes: 0 },
        ],
        conditions: all,
        actions: [lampOn],
      }),
    ];
    await engine.reload();
    expect(clock.pending()).toHaveLength(3);
    expect(clock.pending()[0]).toBe('2026-10-08T05:30:00.000Z');
    expect(clock.pending()[1]).toBe('2026-10-08T06:00:00.000Z');
    clock.advanceTo('2026-10-08T06:00:00.000Z');
    await settle();
    expect(submitted).toHaveLength(2);
    expect(clock.pending()).toContain('2026-10-15T05:30:00.000Z');
    expect(clock.pending()).toContain('2026-10-08T07:00:00.000Z');
    engine.stop();
    expect(clock.pending()).toStrictEqual([]);
  });

  it('records why a sun trigger cannot be scheduled for a home without a location, once', async () => {
    const { db, engine, clock } = setup();
    const message =
      'MissingLocationError: A sunrise or sunset trigger needs the home latitude and longitude; the home has none set.';
    db.automations = [
      automation({
        triggers: [{ type: 'sun', event: 'sunrise', offsetMinutes: 0 }],
        conditions: all,
        actions: [lampOn],
      }),
      automation(
        {
          triggers: [{ type: 'sun', event: 'sunrise', offsetMinutes: 0 }],
          conditions: all,
          actions: [lampOn],
        },
        { lastError: message },
      ),
    ];
    await engine.reload();
    await settle();
    expect(clock.pending()).toStrictEqual([]);
    expect(db.automationChanges.map((entry) => entry.change.lastError)).toStrictEqual([message]);
  });

  it('reports a sun trigger that never comes', async () => {
    const { db, engine, clock } = setup('2026-01-01T00:00:00.000Z');
    db.home = { timeZone: 'UTC', latitude: 90, longitude: 0 };
    db.automations = [
      automation({
        triggers: [{ type: 'sun', event: 'sunrise', offsetMinutes: 0 }],
        conditions: all,
        actions: [lampOn],
      }),
    ];
    await engine.reload();
    expect(clock.pending()).toStrictEqual([]);
    expect(logs.events()).toContain('automation.never_due');
  });

  it('skips disabled automations and records invalid definitions without running them', async () => {
    const { db, engine, submitted } = setup();
    const invalid = automation({ triggers: [], conditions: all, actions: [lampOn] });
    db.automations = [
      automation(
        {
          triggers: [{ type: 'event', deviceId: null, kind: 'button' }],
          conditions: all,
          actions: [lampOn],
        },
        { enabled: false },
      ),
      invalid,
    ];
    await engine.reload();
    engine.signal(
      eventSignal({ id: EVENT_ID, deviceId: null, kind: 'button', occurredAt: NOW, details: {} }),
    );
    await settle();
    expect(submitted).toStrictEqual([]);
    expect(db.automationChanges).toStrictEqual([
      {
        id: invalid.id,
        change: {
          lastError:
            'InvalidAutomationError: triggers: Too small: expected array to have >=1 items',
        },
      },
    ]);
    db.automations = [
      {
        ...invalid,
        lastError: 'InvalidAutomationError: triggers: Too small: expected array to have >=1 items',
      },
    ];
    await engine.reload();
    expect(db.automationChanges).toHaveLength(1);
  });

  it('drops invalid scenes and refuses an invalid home time zone', async () => {
    const { db, engine } = setup();
    db.scenes = [{ id: SCENE, actions: [{ type: 'delay', seconds: 1 }] }];
    await engine.reload();
    expect(engine.sceneActions(SCENE)).toBeUndefined();
    expect(logs.events()).toContain('scene.invalid');
    db.home = { timeZone: 'Mars/Base', latitude: null, longitude: null };
    await expect(engine.reload()).rejects.toThrow('not an IANA time zone');
  });

  it('does nothing before it has loaded', () => {
    const { engine, submitted } = setup();
    engine.signal(
      eventSignal({ id: EVENT_ID, deviceId: null, kind: 'button', occurredAt: NOW, details: {} }),
    );
    expect(submitted).toStrictEqual([]);
  });
});

describe('onlyRunBookkeeping', () => {
  const row: AutomationRow = {
    id: '1c000000-0000-4000-8000-000000000001',
    name: 'A',
    enabled: true,
    definition: { a: 1 },
    last_run_at: null,
    last_error: null,
    run_count: 0,
    created_at: '2026-10-08T00:00:00.000Z',
    updated_at: '2026-10-08T00:00:00.000Z',
  };

  function change(
    operation: 'INSERT' | 'UPDATE' | 'DELETE',
    record: AutomationRow | null,
    oldRecord: AutomationRow | null,
  ): RowChange {
    return { type: 'change', table: 'automations', operation, record, oldRecord };
  }

  it('recognises an update that changed nothing the engine uses', () => {
    expect(
      onlyRunBookkeeping(
        change('UPDATE', { ...row, run_count: 3, last_run_at: '2026-10-08T01:00:00.000Z' }, row),
      ),
    ).toBe(true);
  });

  it('treats any other change as one that needs a reload', () => {
    expect(onlyRunBookkeeping(change('UPDATE', row, { ...row, enabled: false }))).toBe(false);
    expect(onlyRunBookkeeping(change('UPDATE', row, { ...row, name: 'B' }))).toBe(false);
    expect(onlyRunBookkeeping(change('UPDATE', row, { ...row, definition: { a: 2 } }))).toBe(false);
    expect(onlyRunBookkeeping(change('INSERT', row, null))).toBe(false);
    expect(onlyRunBookkeeping(change('UPDATE', null, row))).toBe(false);
    expect(onlyRunBookkeeping(change('UPDATE', row, null))).toBe(false);
    expect(
      onlyRunBookkeeping({
        type: 'change',
        table: 'rooms',
        operation: 'UPDATE',
        record: null,
        oldRecord: null,
      }),
    ).toBe(false);
  });
});
