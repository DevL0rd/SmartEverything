import type { QueryClient } from '@tanstack/react-query';
import { API_ENDPOINTS as E, type DeviceLogEntry, type LiveChange } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { api } from '../api/transport';
import { DEVICE_LOG_PREFIX } from './keys';

export function readDeviceLog(
  deviceId: string,
  limit: number,
  to?: string,
): Promise<DeviceLogEntry[]> {
  return api().call(E.readDeviceLog, {
    params: { deviceId },
    query: { limit, ...(to === undefined ? {} : { to }) },
  });
}

interface LoggedChanges {
  readonly devices: ReadonlySet<string>;
  readonly all: boolean;
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

function loggedChanges(changes: readonly LiveChange[]): LoggedChanges {
  const devices = new Set<string>();
  let all = false;
  for (const change of changes) {
    all = all || change.table === 'automation_runs';
    const device = loggedDevice(change);
    if (device !== null) {
      devices.add(device);
    }
  }
  return { devices, all };
}

export function invalidateDeviceLogs(client: QueryClient, changes: readonly LiveChange[]): void {
  const { devices, all } = loggedChanges(changes);
  if (!all && devices.size === 0) {
    return;
  }
  background(
    client.invalidateQueries({
      queryKey: DEVICE_LOG_PREFIX,
      predicate: (query) => all || devices.has(String(query.queryKey[2])),
    }),
    'queries.invalidate_failed',
  );
}
