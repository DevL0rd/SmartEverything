import { TEST_AUTHOR } from '../support/automation-author';
import {
  SIGNAL_SOURCES,
  type AutomationRow,
  type AutomationV2,
  type RowChange,
} from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { onlyRunBookkeeping } from '../../src/automations/changes';
import { AutomationEngine } from '../../src/automations/engine';
import type { StartRequest } from '../../src/automations/run-task';
import { eventSignal, stateSignal } from '../../src/signals/sources/device';
import { FakeClock } from '../support/fake-clock';
import { captureLogs, testLogger, type CapturedLogs } from '../support/logs';
import { testStore, type TestStore } from '../support/store';

const LAMP = '1a000000-0000-4000-8000-000000000001';
const NOW = '2026-10-08T10:00:00.000Z';
const EVENT_ID = '1c000000-0000-4000-8000-000000000001';

const LAMP_ON = { do: 'set', target: { device: LAMP }, control: 'power', to: true } as const;

interface Bench {
  readonly opened: TestStore;
  readonly clock: FakeClock;
  readonly engine: AutomationEngine;
  readonly started: StartRequest[];
  readonly stopped: { count: number };
  readonly holds: { value: boolean };
}

let logs: CapturedLogs;

beforeEach(() => {
  logs = captureLogs();
});

let bench: Bench | undefined;

afterEach(async () => {
  bench?.engine.stop();
  await bench?.opened.close();
  bench = undefined;
});

async function open(start = NOW): Promise<Bench> {
  const opened = await testStore();
  const clock = new FakeClock(start);
  const started: StartRequest[] = [];
  const stopped = { count: 0 };
  const holds = { value: true };
  const engine = new AutomationEngine({
    store: opened.store,
    runner: {
      start: (request): never => {
        started.push(request);
        throw new Error('The test runner does not run.');
      },
    },
    world: { holds: (): boolean => holds.value },
    armers: [],
    sources: (): typeof SIGNAL_SOURCES => SIGNAL_SOURCES,
    stopRuns: (): void => {
      stopped.count += 1;
    },
    clock,
    log: testLogger(),
  });
  bench = { opened, clock, engine, started, stopped, holds };
  return bench;
}

function save(
  setup: Bench,
  definition: AutomationV2,
  extra: { readonly enabled?: boolean; readonly name?: string } = {},
): AutomationRow {
  return setup.opened.store.automations.create({
    name: extra.name ?? 'Rule',
    enabled: extra.enabled ?? true,
    definition,
    origin: null,
    author: TEST_AUTHOR,
  });
}

describe('AutomationEngine signals', () => {
  it('starts a run when a device state enters the triggering comparison and not again while it holds', async () => {
    const setup = await open();
    const row = save(setup, {
      when: [
        {
          on: 'signal',
          source: 'device',
          kind: 'state',
          subject: LAMP,
          field: 'power',
          test: { is: 'eq', to: true },
        },
      ],
      steps: [{ do: 'notify', message: 'on' }],
    });
    setup.engine.reload();
    const change = (value: boolean, previous: boolean): void => {
      setup.engine.signal(
        stateSignal({ deviceId: LAMP, capability: 'power', value, previous }, NOW),
      );
    };
    change(true, false);
    change(true, true);
    change(false, true);
    change(true, false);
    expect(setup.started.map((request) => request.subject.id)).toStrictEqual([row.id, row.id]);
  });

  it('does not start a run when its onlyIf does not hold', async () => {
    const setup = await open();
    save(setup, {
      when: [{ on: 'signal', source: 'event', kind: 'button' }],
      onlyIf: { all: [] },
      steps: [LAMP_ON],
    });
    setup.engine.reload();
    setup.holds.value = false;
    setup.engine.signal(
      eventSignal({ id: EVENT_ID, deviceId: null, kind: 'button', occurredAt: NOW, details: {} }),
    );
    expect(setup.started).toStrictEqual([]);
    setup.holds.value = true;
    setup.engine.signal(
      eventSignal({ id: EVENT_ID, deviceId: null, kind: 'button', occurredAt: NOW, details: {} }),
    );
    expect(setup.started).toHaveLength(1);
  });

  it('does nothing before it has loaded', async () => {
    const setup = await open();
    save(setup, { when: [{ on: 'signal', source: 'event', kind: 'button' }], steps: [LAMP_ON] });
    setup.engine.signal(
      eventSignal({ id: EVENT_ID, deviceId: null, kind: 'button', occurredAt: NOW, details: {} }),
    );
    expect(setup.started).toStrictEqual([]);
  });
});

describe('AutomationEngine timers', () => {
  it('schedules time, sun and interval triggers to their next occurrence and reschedules after each run', async () => {
    const setup = await open('2026-10-08T05:00:00.000Z');
    setup.opened.store.settings.updateHome({
      time_zone: 'Europe/Berlin',
      latitude: 52.52,
      longitude: 13.405,
    });
    save(setup, {
      when: [
        { on: 'time', at: '07:30', days: [4] },
        { on: 'every', minutes: 60 },
        { on: 'sun', event: 'sunset' },
      ],
      steps: [LAMP_ON],
    });
    setup.engine.reload();
    expect(setup.clock.pending()).toHaveLength(3);
    expect(setup.clock.pending()[0]).toBe('2026-10-08T05:30:00.000Z');
    expect(setup.clock.pending()[1]).toBe('2026-10-08T06:00:00.000Z');
    setup.clock.advanceTo('2026-10-08T06:00:00.000Z');
    expect(setup.started).toHaveLength(2);
    expect(setup.clock.pending()).toContain('2026-10-15T05:30:00.000Z');
    expect(setup.clock.pending()).toContain('2026-10-08T07:00:00.000Z');
    setup.engine.stop();
    expect(setup.clock.pending()).toStrictEqual([]);
    expect(setup.stopped.count).toBe(1);
  });

  it('records why a sun trigger cannot be scheduled for a home without a location, once', async () => {
    const setup = await open();
    const message =
      'MissingLocationError: A sunrise or sunset trigger needs the home latitude and longitude; the home has none set.';
    const row = save(setup, { when: [{ on: 'sun', event: 'sunrise' }], steps: [LAMP_ON] });
    setup.engine.reload();
    expect(setup.clock.pending()).toStrictEqual([]);
    expect(setup.opened.store.automations.byId(row.id).last_error).toBe(message);
    const stamp = setup.opened.store.automations.byId(row.id).updated_at;
    setup.engine.reload();
    expect(setup.opened.store.automations.byId(row.id).updated_at).toBe(stamp);
  });

  it('reports a sun trigger that never comes', async () => {
    const setup = await open('2026-01-01T00:00:00.000Z');
    setup.opened.store.settings.updateHome({ latitude: 90, longitude: 0 });
    save(setup, { when: [{ on: 'sun', event: 'sunrise' }], steps: [LAMP_ON] });
    setup.engine.reload();
    expect(setup.clock.pending()).toStrictEqual([]);
    expect(logs.events()).toContain('automation.never_due');
  });
});

describe('AutomationEngine loading', () => {
  it('skips disabled automations and records unknown signals without arming them', async () => {
    const setup = await open();
    save(
      setup,
      { when: [{ on: 'signal', source: 'event', kind: 'button' }], steps: [LAMP_ON] },
      { enabled: false, name: 'Off' },
    );
    const unknown = save(
      setup,
      { when: [{ on: 'signal', source: 'event', kind: 'no_such_kind' }], steps: [LAMP_ON] },
      { name: 'Unknown' },
    );
    setup.engine.reload();
    setup.engine.signal(
      eventSignal({ id: EVENT_ID, deviceId: null, kind: 'button', occurredAt: NOW, details: {} }),
    );
    expect(setup.started).toStrictEqual([]);
    expect(setup.opened.store.automations.byId(unknown.id).last_error).toContain(
      'UnknownSignalError',
    );
  });

  it('refuses an invalid home time zone', async () => {
    const setup = await open();
    setup.opened.store.settings.updateHome({ time_zone: 'Mars/Base' });
    expect(() => {
      setup.engine.reload();
    }).toThrow('not an IANA time zone');
  });
});

describe('onlyRunBookkeeping', () => {
  const row: AutomationRow = {
    id: '1c000000-0000-4000-8000-000000000001',
    name: 'A',
    enabled: true,
    revision: 1,
    definition: { a: 1 },
    origin: null,
    author: null,
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
