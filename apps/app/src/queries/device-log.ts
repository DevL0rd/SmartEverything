import type { InfiniteData, QueryClient } from '@tanstack/react-query';
import {
  API_ENDPOINTS as E,
  PRESS_EFFECT_WINDOW_MS,
  PRESS_RUN_CLOCK_LEAD_MS,
  RUN_EFFECT_OUTCOMES,
  type AutomationRunSummary,
  type DeviceLogEntry,
  type LiveChange,
} from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { api } from '../api/transport';
import { DEVICE_LOG_PREFIX } from './keys';

export function readDeviceLog(
  deviceId: string,
  limit: number,
  to: string | undefined,
  signal: AbortSignal,
): Promise<DeviceLogEntry[]> {
  return api().call(
    E.readDeviceLog,
    { params: { deviceId }, query: { limit, ...(to === undefined ? {} : { to }) } },
    { signal },
  );
}

type CachedLog = DeviceLogEntry[] | InfiniteData<DeviceLogEntry[]>;

interface RunTouch {
  readonly run: AutomationRunSummary;
  readonly settled: boolean;
}

function loggedDevice(change: LiveChange): string | null {
  if (change.record === null) {
    return null;
  }
  if (change.table === 'commands' || change.table === 'events') {
    return change.record.device_id;
  }
  if (change.table === 'state_history' && typeof change.record.value !== 'number') {
    return change.record.device_id;
  }
  return null;
}

function runTouch(change: LiveChange): RunTouch | null {
  if (change.table !== 'automation_runs' || change.record === null) {
    return null;
  }
  if (change.operation === 'INSERT') {
    return { run: change.record, settled: false };
  }
  if (change.operation !== 'UPDATE' || change.oldRecord === null) {
    return null;
  }
  const before = RUN_EFFECT_OUTCOMES[change.oldRecord.status];
  const after = RUN_EFFECT_OUTCOMES[change.record.status];
  return before === after ? null : { run: change.record, settled: true };
}

function cachedEntries(data: CachedLog | undefined): readonly DeviceLogEntry[] {
  if (data === undefined) {
    return [];
  }
  return Array.isArray(data) ? data : data.pages.flat();
}

function pressNear(entry: DeviceLogEntry, run: AutomationRunSummary): boolean {
  if (entry.kind !== 'press') {
    return false;
  }
  const pressedAt = Date.parse(entry.at);
  const started = Date.parse(run.created_at);
  return (
    started >= pressedAt - PRESS_RUN_CLOCK_LEAD_MS && started <= pressedAt + PRESS_EFFECT_WINDOW_MS
  );
}

function awaitsRun(entry: DeviceLogEntry, run: AutomationRunSummary): boolean {
  return (
    entry.effects?.some(
      (effect) => effect.automationId === run.automation_id && effect.outcome === 'running',
    ) === true
  );
}

function touchedBy(entries: readonly DeviceLogEntry[], touches: readonly RunTouch[]): boolean {
  return entries.some((entry) =>
    touches.some(({ run, settled }) => pressNear(entry, run) || (settled && awaitsRun(entry, run))),
  );
}

function runDevices(client: QueryClient, touches: readonly RunTouch[], into: Set<string>): void {
  if (touches.length === 0) {
    return;
  }
  for (const [key, data] of client.getQueriesData<CachedLog>({ queryKey: DEVICE_LOG_PREFIX })) {
    if (touchedBy(cachedEntries(data), touches)) {
      into.add(String(key[2]));
    }
  }
}

function loggedDevices(client: QueryClient, changes: readonly LiveChange[]): ReadonlySet<string> {
  const devices = new Set<string>();
  const touches: RunTouch[] = [];
  for (const change of changes) {
    const device = loggedDevice(change);
    if (device !== null) {
      devices.add(device);
    }
    const touch = runTouch(change);
    if (touch !== null) {
      touches.push(touch);
    }
  }
  runDevices(client, touches, devices);
  return devices;
}

export function invalidateDeviceLogs(client: QueryClient, changes: readonly LiveChange[]): void {
  const devices = loggedDevices(client, changes);
  if (devices.size === 0) {
    return;
  }
  background(
    client.invalidateQueries({
      queryKey: DEVICE_LOG_PREFIX,
      predicate: (query) => devices.has(String(query.queryKey[2])),
    }),
    'queries.invalidate_failed',
  );
}
