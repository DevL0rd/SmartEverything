import {
  LAUNDRY_EVENT_FAMILY,
  LAUNDRY_NOTICE_WORDING,
  UNLOAD_PENDING_KEY,
  laundryNoticeOf,
  laundryNoticeOn,
  type EventRow,
  type LaundryNoticeKind,
  type LaundryNotices,
  type RowChange,
  type StateRow,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { Cancel, Clock } from '../clock';
import type { DeviceNotice } from '../extensions/device-notices';

const MINUTE_MS = 60_000;

const MAINTENANCE_NOTICES: Readonly<Record<string, LaundryNoticeKind>> = {
  detergent: 'detergent',
  softener: 'softener',
  filter: 'filter',
};

export interface LaundryNotifierPorts {
  readonly notices: () => LaundryNotices;
  readonly machineName: (deviceId: string) => string | null;
  readonly pendingUnloads: () => readonly StateRow[];
  readonly clock: Pick<Clock, 'now' | 'at'>;
  readonly raise: (notice: DeviceNotice) => void;
  readonly log: Logger;
}

export function eventNoticeOf(row: EventRow): LaundryNoticeKind | null {
  if (row.details['family'] !== LAUNDRY_EVENT_FAMILY) {
    return null;
  }
  if (row.kind === 'cycle_finished') {
    return row.details['outcome'] === 'completed' ? 'finished' : null;
  }
  if (row.kind === 'fault') {
    return 'fault';
  }
  const item = row.details['item'];
  return row.kind === 'maintenance' && typeof item === 'string'
    ? (MAINTENANCE_NOTICES[item] ?? null)
    : null;
}

export function isPendingUnload(row: StateRow | null): boolean {
  return row?.capability === UNLOAD_PENDING_KEY && row.value === true;
}

export class LaundryNotifier {
  private readonly waits = new Map<string, Cancel>();

  constructor(private readonly ports: LaundryNotifierPorts) {}

  start(): void {
    for (const row of this.ports.pendingUnloads()) {
      if (isPendingUnload(row)) {
        this.wait(row, 'resumed');
      }
    }
  }

  stop(): void {
    for (const cancel of this.waits.values()) {
      cancel();
    }
    this.waits.clear();
  }

  changed(change: RowChange): void {
    if (change.table === 'events') {
      const notice = change.operation === 'INSERT' ? this.eventNotice(change.record) : null;
      if (notice !== null) {
        this.send(notice.deviceId, notice.kind);
      }
    } else if (change.table === 'device_state') {
      this.unloadChanged(change.record, change.oldRecord);
    }
  }

  private eventNotice(
    row: EventRow | null,
  ): { readonly deviceId: string; readonly kind: LaundryNoticeKind } | null {
    if (row?.device_id === null || row === null) {
      return null;
    }
    const kind = eventNoticeOf(row);
    return kind === null ? null : { deviceId: row.device_id, kind };
  }

  private unloadChanged(record: StateRow | null, before: StateRow | null): void {
    const row = record ?? before;
    if (row?.capability !== UNLOAD_PENDING_KEY) {
      return;
    }
    if (record === null || !isPendingUnload(record)) {
      this.cancel(row.device_id);
    } else if (!isPendingUnload(before)) {
      this.wait(record, 'started');
    }
  }

  private wait(row: StateRow, why: 'started' | 'resumed'): void {
    const deviceId = row.device_id;
    this.cancel(deviceId);
    const minutes = laundryNoticeOf(this.ports.notices(), deviceId).unloadMinutes;
    const due = new Date(Date.parse(row.observed_at) + minutes * MINUTE_MS);
    if (why === 'resumed' && due.getTime() <= this.ports.clock.now().getTime()) {
      this.ports.log.info('laundry.unload_notice_passed', { deviceId, due: due.toISOString() });
      return;
    }
    const cancel = this.ports.clock.at(due, () => {
      this.waits.delete(deviceId);
      this.send(deviceId, 'unload');
    });
    this.waits.set(deviceId, cancel);
    this.ports.log.debug('laundry.unload_notice_waiting', { deviceId, minutes, why });
  }

  private cancel(deviceId: string): void {
    this.waits.get(deviceId)?.();
    this.waits.delete(deviceId);
  }

  private send(deviceId: string, kind: LaundryNoticeKind): void {
    if (!laundryNoticeOn(this.ports.notices(), deviceId, kind)) {
      this.ports.log.info('laundry.notice_off', { deviceId, notice: kind });
      return;
    }
    const machine = this.ports.machineName(deviceId);
    if (machine === null) {
      this.ports.log.warn('laundry.notice_unknown_device', { deviceId, notice: kind });
      return;
    }
    const wording = LAUNDRY_NOTICE_WORDING[kind];
    this.ports.raise({
      title: wording.label,
      body: wording.body(machine),
      data: { kind: 'device_notice', notice: kind, deviceId },
    });
    this.ports.log.info('laundry.notice_raised', { deviceId, notice: kind });
  }
}
