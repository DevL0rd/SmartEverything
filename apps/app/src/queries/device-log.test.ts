import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import {
  API_ENDPOINTS as E,
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

const RUN: LiveChange = { ...BASE, table: 'automation_runs', record: null };
const ROOM: LiveChange = { ...BASE, table: 'rooms', record: null };
const DELETED_EVENT: LiveChange = { ...BASE, operation: 'DELETE', table: 'events', record: null };

beforeEach(() => {
  calls.length = 0;
});

describe('the device log read', () => {
  it('asks the hub for this device, with the page cursor only when given', async () => {
    await readDeviceLog(OVEN, 20);
    await readDeviceLog(OVEN, 20, NOW);
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

  it('refreshes every log when an automation run changes, because effects arrive late', () => {
    const client = seeded();
    invalidateDeviceLogs(client, [RUN]);
    expect(stale(client, OVEN)).toBe(true);
    expect(stale(client, LAMP)).toBe(true);
  });

  it('leaves everything alone for unrelated tables and deletes', () => {
    const client = seeded();
    invalidateDeviceLogs(client, [ROOM, DELETED_EVENT]);
    expect(stale(client, OVEN)).toBe(false);
    expect(stale(client, LAMP)).toBe(false);
  });
});
