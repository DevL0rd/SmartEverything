import {
  LAUNDRY_STATUSES,
  NO_FAULT,
  UNLOAD_PENDING_KEY,
  LaundryValueError,
  faultAdvice,
  isLaundryValueRole,
  laundryValuesOf,
  presentDevice,
  type CapabilityRole,
  type DeviceEvent,
  type DeviceRow,
  type JsonValue,
  type LaundryRoleSource,
  type LaundryValues,
  type Provider,
  type StateChange,
  type StateUpdate,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import { CountSummary } from '../providers/count-summary';
import type { DeviceRecord } from '../database/port';
import {
  endOccurrence,
  finishDetails,
  isDeviceReportedEnd,
  openCycleOf,
  programFacts,
  startDetails,
  startOccurrence,
  type CycleOutcome,
  type HistoryRow,
  type OpenCycle,
} from './cycle-events';

export interface CycleTrackerPorts {
  readonly device: (deviceId: string) => DeviceRow | undefined;
  readonly value: (deviceId: string, key: string) => JsonValue | undefined;
  readonly record: (provider: Provider, event: DeviceEvent) => void;
  readonly push: (provider: Provider, update: StateUpdate) => void;
  readonly history: (deviceId: string) => readonly HistoryRow[];
  readonly now: () => Date;
  readonly log: Logger;
}

interface Tracked {
  readonly device: DeviceRow;
  readonly sources: readonly LaundryRoleSource[];
  readonly roles: ReadonlyMap<string, CapabilityRole>;
}

interface Finished {
  readonly startedAt: string | null;
  readonly occurrence: string;
}

const RUNNING_STATUSES: ReadonlySet<string> = new Set(['Paused', 'Busy']);
const COMPLETED_STATUSES: ReadonlySet<string> = new Set(['Completed', 'Clean Cavity Completed']);

const MILLISECONDS_PER_HOUR = 3_600_000;
const CONSUMABLE_RENOTIFY_MS = 6 * MILLISECONDS_PER_HOUR;
const DUPLICATE_END_WINDOW_MS = 10 * 60_000;
const DELAY = 'Delay';

interface Consumable {
  readonly item: string;
  readonly bad: JsonValue;
  readonly state: string;
}

const CONSUMABLES: Readonly<Partial<Record<CapabilityRole, Consumable>>> = {
  detergent_level: { item: 'detergent', bad: 'Low', state: 'low' },
  softener_level: { item: 'softener', bad: 'Low', state: 'low' },
  filter_clean: { item: 'filter', bad: true, state: 'needs_cleaning' },
};

function statusOf(status: JsonValue): string {
  if (typeof status !== 'string' || !LAUNDRY_STATUSES.some((known) => known === status)) {
    throw new LaundryValueError('laundry_status', LAUNDRY_STATUSES.join(' | '), status);
  }
  return status;
}

function minutesOf(value: JsonValue | undefined): number | null {
  return typeof value === 'number' && value > 0 ? value : null;
}

export class CycleTracker {
  private readonly tracked = new Map<
    string,
    { readonly updatedAt: string; readonly laundry: Tracked | null }
  >();
  private readonly notified = new Map<string, number | null>();
  private readonly finished = new Map<string, Finished>();
  private readonly tally: CountSummary;

  constructor(private readonly ports: CycleTrackerPorts) {
    this.tally = new CountSummary(ports.log, 'laundry.change_summary');
  }

  observe(change: StateChange): void {
    if (change.previous === undefined || change.previous === null || change.value === null) {
      return;
    }
    try {
      this.apply(change.deviceId, change.capability, change.previous, change.value);
    } catch (cause) {
      this.ports.log.error('laundry.change_failed', cause, {
        deviceId: change.deviceId,
        capability: change.capability,
      });
    }
  }

  claim(device: DeviceRecord, event: DeviceEvent): boolean {
    if (!isDeviceReportedEnd(event)) {
      return false;
    }
    try {
      this.reported(device, event);
    } catch (cause) {
      this.ports.log.error('laundry.event_failed', cause, { deviceId: device.id });
    }
    return true;
  }

  private apply(deviceId: string, key: string, previous: JsonValue, value: JsonValue): void {
    const laundry = this.laundryOf(deviceId);
    const role = laundry?.roles.get(key);
    if (role === undefined || laundry === null) {
      return;
    }
    if (role === 'laundry_status') {
      this.status(laundry, previous, value);
      return;
    }
    if (role === 'fault') {
      this.fault(laundry, value);
      return;
    }
    if (role === 'door_state') {
      if (value === 'Open') this.unloadPending(laundry, false);
      return;
    }
    const consumable = CONSUMABLES[role];
    if (consumable === undefined) {
      return;
    }
    this.consumable(laundry, consumable, value === consumable.bad);
  }

  private laundryOf(deviceId: string): Tracked | null {
    const device = this.ports.device(deviceId);
    if (device === undefined) {
      this.tracked.delete(deviceId);
      return null;
    }
    const known = this.tracked.get(deviceId);
    if (known?.updatedAt === device.updated_at) {
      return known.laundry;
    }
    const laundry = trackedOf(device);
    this.tracked.set(deviceId, { updatedAt: device.updated_at, laundry });
    return laundry;
  }

  private status(laundry: Tracked, previous: JsonValue, current: JsonValue): void {
    const was = statusOf(previous);
    const is = statusOf(current);
    if (RUNNING_STATUSES.has(is) && !RUNNING_STATUSES.has(was)) {
      this.start(laundry);
    } else if (RUNNING_STATUSES.has(was) && is !== DELAY && !RUNNING_STATUSES.has(is)) {
      this.end(laundry, this.outcomeAt(laundry, is), 'state');
    } else if (was === DELAY && !RUNNING_STATUSES.has(is)) {
      this.tally.count('delay_cancelled');
    }
  }

  private outcomeAt(laundry: Tracked, status: string): CycleOutcome {
    if (COMPLETED_STATUSES.has(status)) {
      return 'completed';
    }
    const values = this.valuesOf(laundry);
    const washed = values.laundry_phase === 'Washing Completed' || values.remaining_minutes === 0;
    return washed ? 'completed' : 'stopped';
  }

  private valuesOf(laundry: Tracked): LaundryValues {
    return laundryValuesOf(laundry.sources, (key) => this.ports.value(laundry.device.id, key));
  }

  private start(laundry: Tracked): void {
    const { device } = laundry;
    const startedAt = this.ports.now().toISOString();
    const values = this.valuesOf(laundry);
    const options = Object.fromEntries(
      (['wash_temperature', 'spin_speed', 'rinse_count'] as const).flatMap((role) =>
        values[role] === undefined ? [] : [[role, values[role]] as const],
      ),
    );
    const facts = programFacts(values.laundry_program);
    this.finished.delete(device.id);
    this.unloadPending(laundry, false);
    this.record(device, {
      kind: 'activity',
      occurredAt: startedAt,
      occurrence: startOccurrence(device.id, startedAt),
      details: startDetails(startedAt, facts, minutesOf(values.remaining_minutes), options),
    });
    this.ports.log.info('laundry.cycle_started', { deviceId: device.id, program: facts.program });
  }

  private end(laundry: Tracked, outcome: CycleOutcome, source: string): void {
    const { device } = laundry;
    const open = openCycleOf(this.ports.history(device.id));
    const marker = this.finished.get(device.id);
    const repeated =
      marker === undefined
        ? open === null && this.finishedRecently(device.id)
        : open === null || marker.startedAt === open.startedAt;
    if (repeated) {
      this.tally.count('duplicate_end');
      return;
    }
    this.finish(laundry, open, outcome, source);
  }

  private finishedRecently(deviceId: string): boolean {
    const latest = this.ports
      .history(deviceId)
      .find((row) => row.kind === 'cycle_finished' && row.details['family'] === 'laundry');
    return (
      latest !== undefined &&
      this.ports.now().getTime() - Date.parse(latest.occurredAt) < DUPLICATE_END_WINDOW_MS
    );
  }

  private finish(
    laundry: Tracked,
    open: OpenCycle | null,
    outcome: CycleOutcome,
    source: string,
  ): void {
    const { device } = laundry;
    const finishedAt = this.ports.now().toISOString();
    const facts = programFacts(this.valuesOf(laundry).laundry_program);
    const occurrence = endOccurrence(device.id, open?.startedAt ?? finishedAt);
    this.finished.set(device.id, { startedAt: open?.startedAt ?? null, occurrence });
    this.record(device, {
      kind: 'cycle_finished',
      occurredAt: finishedAt,
      occurrence,
      details: finishDetails({ open, fallback: facts, outcome, finishedAt, source }),
    });
    this.unloadPending(laundry, true);
    this.ports.log.info('laundry.cycle_finished', {
      deviceId: device.id,
      outcome,
      source,
      measured: open !== null,
    });
  }

  private unloadPending(laundry: Tracked, pending: boolean): void {
    const { device } = laundry;
    if (!pending && this.ports.value(device.id, UNLOAD_PENDING_KEY) !== true) {
      return;
    }
    this.ports.push(device.provider, {
      externalId: device.external_id,
      capability: UNLOAD_PENDING_KEY,
      value: pending,
      observedAt: this.ports.now().toISOString(),
    });
  }

  private reported(device: DeviceRecord, event: DeviceEvent): void {
    const laundry = this.laundryOf(device.id);
    if (laundry === null) {
      this.tally.count('report_unmatched');
      return;
    }
    if (event.details['miotEvent'] === 'wash-end-log') {
      this.enrich(laundry, event);
      return;
    }
    this.end(laundry, 'completed', 'lan-push');
  }

  private enrich(laundry: Tracked, event: DeviceEvent): void {
    const marker = this.finished.get(laundry.device.id);
    if (marker === undefined) {
      this.tally.count('log_unmatched');
      return;
    }
    this.record(laundry.device, {
      kind: 'cycle_finished',
      occurredAt: event.occurredAt,
      occurrence: marker.occurrence,
      details: Object.fromEntries(
        Object.entries(event.details).filter(([name]) => name !== 'miotEvent'),
      ),
    });
  }

  private fault(laundry: Tracked, value: JsonValue): void {
    if (typeof value !== 'string') {
      throw new LaundryValueError('fault', 'a fault name', value);
    }
    const advice = value === NO_FAULT ? null : faultAdvice(value);
    if (advice === null) {
      return;
    }
    this.record(laundry.device, {
      kind: 'fault',
      occurredAt: this.ports.now().toISOString(),
      details: {
        family: 'laundry',
        source: 'state',
        raw: value,
        code: advice.code,
        title: advice.title,
        advice: advice.advice,
      },
    });
    this.tally.count('fault');
  }

  private consumable(laundry: Tracked, consumable: Consumable, bad: boolean): void {
    const key = `${laundry.device.id}|${consumable.item}`;
    const now = this.ports.now().getTime();
    const goodSince = this.notified.get(key);
    if (!bad) {
      if (goodSince === null) {
        this.notified.set(key, now);
      }
      return;
    }
    if (
      goodSince !== undefined &&
      (goodSince === null || now - goodSince < CONSUMABLE_RENOTIFY_MS)
    ) {
      this.notified.set(key, null);
      return;
    }
    this.notified.set(key, null);
    this.maintenance(laundry, consumable);
  }

  private maintenance(laundry: Tracked, consumable: Consumable): void {
    this.record(laundry.device, {
      kind: 'maintenance',
      occurredAt: this.ports.now().toISOString(),
      details: {
        family: 'laundry',
        source: 'state',
        item: consumable.item,
        state: consumable.state,
      },
    });
    this.tally.count(`maintenance_${consumable.item}`);
  }

  private record(
    device: DeviceRow,
    event: Pick<DeviceEvent, 'kind' | 'occurredAt' | 'details'> & { occurrence?: string },
  ): void {
    this.ports.record(device.provider, { externalId: device.external_id, ...event });
  }
}

function trackedOf(device: DeviceRow): Tracked | null {
  const presentation = presentDevice(device);
  if (presentation.family !== 'laundry') {
    return null;
  }
  const sources = presentation.capabilities.map(({ key, role }) => ({ key, role }));
  const roles = new Map(
    sources.flatMap(({ key, role }) => (isLaundryValueRole(role) ? [[key, role] as const] : [])),
  );
  return { device, sources, roles };
}
