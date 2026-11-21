import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, type InfiniteData } from '@tanstack/react-query';
import {
  AUTOMATION_RUN_ID,
  API_ENDPOINTS as E,
  type AutomationRunSummary,
  type CommandRow,
  type DeviceLogEntry,
  type EventRow,
  type HistoryRow,
  type LiveChange,
} from '@smarteverything/domain';
import { deviceLogKey } from './keys';

const OVEN = '00000000-0000-4000-8000-000000000001';
const LAMP = '00000000-0000-4000-8000-000000000002';
const NOW = '2026-10-18T12:00:00.000Z';
const SOON = '2026-10-18T12:00:01.000Z';
const LATER = '2026-10-18T12:10:00.000Z';
const KETTLE = '00000000-0000-4000-8000-0000000000a1';
const BLINDS = '00000000-0000-4000-8000-0000000000a2';

interface Call {
  readonly path: string;
  readonly params: unknown;
  readonly query: unknown;
}

const calls: Call[] = [];

vi.mock('../api/transport', () => ({
  api: (): {
    call: (endpoint: { path: string }, input: { params: unknown; query: unknown }) => unknown;
  } => ({
    call: (endpoint, input): Promise<never[]> => {
      calls.push({ path: endpoint.path, params: input.params, query: input.query });
      return Promise.resolve([]);
    },
  }),
}));

const { invalidateDeviceLogs, readDeviceLog } = await import('./device-log');

function seeded(): QueryClient {
  const client = new QueryClient();
  for (const id of [OVEN, LAMP]) {
    client.setQueryData<DeviceLogEntry[]>(deviceLogKey(id, 1), []);
    client.setQueryData<DeviceLogEntry[]>(deviceLogKey(id, 'pages'), []);
  }
  return client;
}

function stale(client: QueryClient, id: string): boolean {
  return (
    client.getQueryState(deviceLogKey(id, 1))?.isInvalidated === true &&
    client.getQueryState(deviceLogKey(id, 'pages'))?.isInvalidated === true
  );
}

const BASE = { type: 'change', operation: 'INSERT', oldRecord: null, seq: 1 } as const;

function commandChange(deviceId: string): LiveChange {
  const record: CommandRow = {
    id: '00000000-0000-4000-8000-0000000000c1',
    device_id: deviceId,
    capability: 'power',
    value: true,
    status: 'succeeded',
    source: 'app',
    result: null,
    error: null,
    requested_by: null,
    created_at: NOW,
    started_at: null,
    finished_at: null,
    expires_at: NOW,
  };
  return { ...BASE, table: 'commands', record };
}

function eventChange(deviceId: string): LiveChange {
  const record: EventRow = {
    id: '00000000-0000-4000-8000-0000000000e1',
    device_id: deviceId,
    kind: 'button',
    occurred_at: NOW,
    details: {},
    acknowledged_at: null,
    created_at: NOW,
  };
  return { ...BASE, table: 'events', record };
}

function stateChange(deviceId: string, value: boolean | number): LiveChange {
  const record: HistoryRow = {
    id: 1,
    device_id: deviceId,
    capability: 'power',
    value,
    observed_at: NOW,
  };
  return { ...BASE, table: 'state_history', record };
}

function run(status: AutomationRunSummary['status'], createdAt = SOON): AutomationRunSummary {
  return {
    id: AUTOMATION_RUN_ID.parse('90000000-0000-4000-8000-000000000001'),
    automation_id: KETTLE,
    revision: 1,
    owner_profile_id: null,
    control_key: null,
    parent_run_id: null,
    status,
    mode: 'live',
    plan_hash: 'hash',
    current_node: null,
    started_by: null,
    steps: 0,
    commands: 0,
    iterations: 0,
    active_paths: [],
    wake_at: null,
    error: null,
    created_at: createdAt,
    started_at: null,
    finished_at: null,
  };
}

function runInserted(record: AutomationRunSummary): LiveChange {
  return { ...BASE, table: 'automation_runs', record };
}

function runUpdated(
  before: AutomationRunSummary['status'],
  after: AutomationRunSummary['status'],
  createdAt = SOON,
): LiveChange {
  return {
    ...BASE,
    operation: 'UPDATE',
    table: 'automation_runs',
    record: run(after, createdAt),
    oldRecord: run(before, createdAt),
  };
}

const PRESS: DeviceLogEntry = {
  at: NOW,
  kind: 'press',
  title: 'Pressed',
  cause: { kind: 'button' },
};

function pressWith(automationId: string, outcome: 'running' | 'ok'): DeviceLogEntry {
  return {
    ...PRESS,
    at: '2026-10-18T11:00:00.000Z',
    effects: [{ title: 'Boil', automationId, outcome }],
  };
}

function withEntries(client: QueryClient, id: string, entries: DeviceLogEntry[]): void {
  client.setQueryData<DeviceLogEntry[]>(deviceLogKey(id, 1), entries);
  client.setQueryData<InfiniteData<DeviceLogEntry[]>>(deviceLogKey(id, 'pages'), {
    pages: [entries],
    pageParams: [undefined],
  });
}

const RUN: LiveChange = { ...BASE, table: 'automation_runs', record: null };
const ROOM: LiveChange = { ...BASE, table: 'rooms', record: null };
const DELETED_EVENT: LiveChange = { ...BASE, operation: 'DELETE', table: 'events', record: null };

beforeEach(() => {
  calls.length = 0;
});

describe('the device log read', () => {
  it('asks the hub for this device, with the page cursor only when given', async () => {
    const { signal } = new AbortController();
    await readDeviceLog(OVEN, 20, undefined, signal);
    await readDeviceLog(OVEN, 20, NOW, signal);
    expect(calls.map((call) => call.path)).toEqual([E.readDeviceLog.path, E.readDeviceLog.path]);
    expect(calls[0]?.params).toEqual({ deviceId: OVEN });
    expect(calls[0]?.query).toEqual({ limit: 20 });
    expect(calls[1]?.query).toEqual({ limit: 20, to: NOW });
  });
});

describe('the device log live refresh', () => {
  it('refreshes only the device that had a command', () => {
    const client = seeded();
    invalidateDeviceLogs(client, [commandChange(OVEN)]);
    expect(stale(client, OVEN)).toBe(true);
    expect(stale(client, LAMP)).toBe(false);
  });

  it('refreshes on events and on state changes that are not numbers', () => {
    const events = seeded();
    invalidateDeviceLogs(events, [eventChange(LAMP)]);
    expect(stale(events, LAMP)).toBe(true);
    const states = seeded();
    invalidateDeviceLogs(states, [stateChange(OVEN, true)]);
    expect(stale(states, OVEN)).toBe(true);
  });

  it('ignores readings, which the log never lists', () => {
    const client = seeded();
    invalidateDeviceLogs(client, [stateChange(OVEN, 21.5)]);
    expect(stale(client, OVEN)).toBe(false);
  });

  it('leaves every log alone for runs that touch no cached press', () => {
    const client = seeded();
    invalidateDeviceLogs(client, [
      RUN,
      runInserted(run('queued')),
      runUpdated('queued', 'succeeded'),
    ]);
    expect(stale(client, OVEN)).toBe(false);
    expect(stale(client, LAMP)).toBe(false);
  });

  it('ignores updates that keep a run running, even beside a waiting press', () => {
    const client = seeded();
    withEntries(client, OVEN, [pressWith(KETTLE, 'running')]);
    withEntries(client, LAMP, [PRESS]);
    invalidateDeviceLogs(client, [
      runUpdated('queued', 'running'),
      runUpdated('running', 'waiting'),
      runUpdated('waiting', 'running'),
      runUpdated('running', 'paused'),
    ]);
    expect(stale(client, OVEN)).toBe(false);
    expect(stale(client, LAMP)).toBe(false);
  });

  it('refreshes only the log whose press waits on the run that finished', () => {
    const client = seeded();
    withEntries(client, OVEN, [pressWith(KETTLE, 'running')]);
    withEntries(client, LAMP, [pressWith(BLINDS, 'running'), pressWith(KETTLE, 'ok')]);
    invalidateDeviceLogs(client, [runUpdated('running', 'succeeded', LATER)]);
    expect(stale(client, OVEN)).toBe(true);
    expect(stale(client, LAMP)).toBe(false);
  });

  it('refreshes the log of a press made just before a new run', () => {
    const client = seeded();
    withEntries(client, LAMP, [PRESS]);
    invalidateDeviceLogs(client, [runInserted(run('queued'))]);
    expect(stale(client, LAMP)).toBe(true);
    expect(stale(client, OVEN)).toBe(false);
  });

  it('refreshes the press log when a run finishes that its press missed while loading', () => {
    const client = seeded();
    withEntries(client, LAMP, [PRESS]);
    invalidateDeviceLogs(client, [runUpdated('running', 'failed')]);
    expect(stale(client, LAMP)).toBe(true);
  });

  it('leaves a press alone when the new run started outside its window', () => {
    const client = seeded();
    withEntries(client, LAMP, [PRESS]);
    invalidateDeviceLogs(client, [runInserted(run('queued', LATER))]);
    expect(stale(client, LAMP)).toBe(false);
  });

  it('leaves everything alone for unrelated tables and deletes', () => {
    const client = seeded();
    invalidateDeviceLogs(client, [ROOM, DELETED_EVENT]);
    expect(stale(client, OVEN)).toBe(false);
    expect(stale(client, LAMP)).toBe(false);
  });
});
