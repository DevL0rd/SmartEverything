import type { QueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import type { EventRow, LiveChange, RecordingRow } from '@smarteverything/domain';
import type { CameraDay } from '../api/media';
import { cameraSnapshotKey } from './keys';
import { background } from '@smarteverything/logging';

const CAMERA_DAY_PREFIX = ['window', 'camera-day'] as const;

export function cameraDayKey(
  start: string,
  end: string,
  deviceIds: readonly string[],
): readonly ['window', 'camera-day', string, string, string] {
  return [...CAMERA_DAY_PREFIX, start, end, [...deviceIds].sort().join(',')];
}

const CAMERA_DAY_KEY = z.tuple([
  z.literal('window'),
  z.literal('camera-day'),
  z.string(),
  z.string(),
  z.string(),
]);

interface Timed {
  readonly id: string;
  readonly device_id: string | null;
}

function upsert<R extends Timed>(rows: readonly R[], row: R, removed: boolean): R[] {
  const others = rows.filter((candidate) => candidate.id !== row.id);
  return removed ? others : [row, ...others];
}

function inWindow(at: string, start: string, end: string): boolean {
  return at >= start && at < end;
}

type DayRow =
  | { readonly table: 'events'; readonly row: EventRow; readonly removed: boolean }
  | { readonly table: 'recordings'; readonly row: RecordingRow; readonly removed: boolean };

function dayRowOf(change: LiveChange): DayRow | null {
  if (change.table === 'events') {
    const row = change.record ?? change.oldRecord;
    return row === null ? null : { table: 'events', row, removed: change.record === null };
  }
  if (change.table === 'recordings') {
    const row = change.record ?? change.oldRecord;
    return row === null ? null : { table: 'recordings', row, removed: change.record === null };
  }
  return null;
}

function patched(day: CameraDay, change: DayRow): CameraDay {
  return change.table === 'events'
    ? { ...day, events: upsert(day.events, change.row, change.removed) }
    : { ...day, recordings: upsert(day.recordings, change.row, change.removed) };
}

function atOf(change: DayRow): string {
  return change.table === 'events' ? change.row.occurred_at : change.row.started_at;
}

export function patchCameraDays(client: QueryClient, changes: readonly LiveChange[]): void {
  const rows = changes.flatMap((change) => {
    const row = dayRowOf(change);
    return row === null ? [] : [row];
  });
  if (rows.length === 0) {
    return;
  }
  for (const query of client.getQueryCache().findAll({ queryKey: CAMERA_DAY_PREFIX })) {
    const key = CAMERA_DAY_KEY.safeParse(query.queryKey);
    if (!key.success) {
      continue;
    }
    const [, , start, end, ids] = key.data;
    const devices = new Set(ids.split(','));
    const relevant = rows.filter(
      (row) =>
        row.row.device_id !== null &&
        devices.has(row.row.device_id) &&
        inWindow(atOf(row), start, end),
    );
    if (relevant.length > 0) {
      client.setQueryData<CameraDay>(query.queryKey, (day) =>
        day === undefined ? day : relevant.reduce(patched, day),
      );
    }
  }
}

export function refreshSnapshots(client: QueryClient, changes: readonly LiveChange[]): void {
  const devices = new Set(
    changes.flatMap((change) => {
      if (change.table !== 'events' || change.operation !== 'INSERT') {
        return [];
      }
      const deviceId = change.record?.device_id ?? null;
      return deviceId === null ? [] : [deviceId];
    }),
  );
  for (const deviceId of devices) {
    background(
      client.invalidateQueries({ queryKey: cameraSnapshotKey(deviceId) }),
      'queries.invalidate_failed',
    );
  }
}
