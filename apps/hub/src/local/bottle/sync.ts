import {
  bottleSerialOf,
  type BottleLog,
  type BottleSyncPlan,
  type BottleSyncUpload,
  type DeviceEvent,
  type DeviceRow,
} from '@smarteverything/domain';
import type { BottleLogsRepository } from '../../store/repositories/bottle-logs';
import type { BottleReadingsRepository } from '../../store/repositories/bottle-readings';
import type { LocalDeviceEntry } from '../../store/repositories/local-devices';
import type { HostStore } from '../../store/host/host-store';
import { NoteLog } from '../unit-notes';
import { homeClock, type HomeClock } from './clock';
import { entryConfigOf, saveConfig, type BottleEntryConfig } from './config';
import { decodeResponses, type Decoded } from './decode';
import { saveDrinks, drinkItemsOf, type DrinkItem } from './drinks';
import { EventBatch } from './events';
import { saveLogs, type NewRows } from './ingest-logs';
import { eventsOf } from './ingest-events';
import { currentQuiet, currentReminder, syncPlanOf, type PlanDeps } from './plan';
import type { PublishInput } from './publisher';
import { basesOf, rememberedUnsupported, settledWrites, type WriteContext } from './writes';
import { curveOf, storeIncoming } from './readings';
import { SNAP, Snapshots } from './snapshots';
import { capOf, isoOfSeconds, levelOf } from './summary';

export interface BottleWorkerDeps {
  readonly store: HostStore;
  readonly readings: BottleReadingsRepository;
  readonly logs: BottleLogsRepository;
  readonly snapshots: Snapshots;
  readonly clock: HomeClock;
  readonly now: () => Date;
  readonly log: NoteLog;
}

export function bottleWorkerDeps(store: HostStore, now: string): BottleWorkerDeps {
  const at = new Date(now);
  return {
    store,
    readings: store.bottleReadings,
    logs: store.bottleLogs,
    snapshots: new Snapshots(store.bottleLogs),
    clock: homeClock(store.settings),
    now: () => at,
    log: new NoteLog(),
  };
}

export function planDepsOf(deps: BottleWorkerDeps): PlanDeps {
  return {
    readings: deps.readings,
    logs: deps.logs,
    snapshots: deps.snapshots,
    now: deps.now,
  };
}

const MS_PER_SECOND = 1000;

interface Saved {
  readonly drinks: readonly DrinkItem[];
  readonly rows: NewRows;
  readonly previousState: string | null;
  readonly previousBattery: number | null;
}

export interface SyncInput {
  readonly device: DeviceRow;
  readonly entry: LocalDeviceEntry;
  readonly clientId: string;
  readonly upload: BottleSyncUpload;
  readonly now: string;
}

export interface SyncOutcome {
  readonly entry: LocalDeviceEntry;
  readonly events: readonly DeviceEvent[];
  readonly publish: PublishInput;
  readonly observed: Record<string, string>;
  readonly plan: BottleSyncPlan;
}

interface Upload {
  readonly device: DeviceRow;
  readonly entry: LocalDeviceEntry;
  readonly config: BottleEntryConfig;
  readonly clientId: string;
  readonly upload: BottleSyncUpload;
  readonly decoded: Decoded;
}

function secondsOf(iso: string): number {
  return Math.floor(Date.parse(iso) / MS_PER_SECOND);
}

function observedOf(
  deviceId: string,
  deps: Pick<BottleWorkerDeps, 'snapshots'>,
  upload: BottleSyncUpload,
): Record<string, string> {
  const values: Record<string, string> = {
    lastSyncOutcome: upload.outcome,
    link: upload.outcome === 'ok' ? 'asleep' : 'sync_failed',
  };
  if (upload.outcome !== 'asleep') {
    values['lastSeenAt'] = upload.endedAt;
  }
  if (upload.outcome === 'ok') {
    values['lastSyncAt'] = upload.endedAt;
  }
  const firmware = deps.snapshots.get(deviceId, SNAP.dis)?.value.firmware;
  if (firmware !== undefined && firmware !== null) {
    values['firmware'] = firmware;
  }
  return values;
}

function saveSync(deps: BottleWorkerDeps, context: Upload): void {
  const { upload } = context;
  deps.logs.addSync(context.device.id, {
    startedAt: upload.startedAt,
    endedAt: upload.endedAt,
    cause: upload.trigger,
    outcome: upload.outcome,
    detail: upload.detail,
    requests: upload.responses.length,
    answered: upload.responses.filter((response) => response.hex !== null && !response.timedOut)
      .length,
    rssi: upload.rssi,
    clientId: context.clientId,
  });
}

function saveReads(deps: BottleWorkerDeps, context: Upload): void {
  const { device, upload, decoded } = context;
  if (upload.dis !== null) {
    deps.snapshots.save(device.id, SNAP.dis, upload.endedAt, upload.dis);
  }
  for (const read of upload.batteryReads) {
    deps.logs.addBattery(device.id, {
      at: secondsOf(read.at),
      pct: read.pct,
      source: read.pushed ? 'notify' : 'read',
    });
  }
  for (const apply of decoded.applies) {
    apply(deps.snapshots, device.id);
  }
}

function saveReadings(deps: BottleWorkerDeps, context: Upload): DrinkItem[] {
  const { device, entry, config, decoded } = context;
  const incoming = storeIncoming(deps, device.id, curveOf(config), decoded.logs.tof);
  const outcome = saveDrinks(
    { store: deps.store, readings: deps.readings, clock: deps.clock, log: deps.log },
    { deviceId: device.id, serial: bottleSerialOf(entry.externalId), binding: config.binding },
    drinkItemsOf(incoming.rows),
  );
  return incoming.replayed ? [] : [...outcome.created];
}

function saveSyncedLogs(deps: BottleWorkerDeps, context: Upload): void {
  const { device, upload, decoded } = context;
  const stamps: Record<string, string> = {
    ...(deps.snapshots.get(device.id, SNAP.logSync)?.value ?? {}),
  };
  decoded.logsFetched.forEach((log: BottleLog) => {
    stamps[log] = upload.endedAt;
  });
  deps.snapshots.save(device.id, SNAP.logSync, upload.endedAt, stamps);
}

function save(deps: BottleWorkerDeps, context: Upload): Saved {
  const { device, entry, config, upload, decoded } = context;
  const previousState = deps.snapshots.get(device.id, SNAP.uiState)?.value.state ?? null;
  const previousBattery = deps.logs.newestBattery(device.id)?.pct ?? null;
  const bases = basesOf(deps, device.id);
  saveSync(deps, context);
  saveReads(deps, context);
  const rows = saveLogs(deps.logs, device.id, decoded.logs);
  const drinks = saveReadings(deps, context);
  saveSyncedLogs(deps, context);
  const writes: WriteContext = { deps, deviceId: device.id, config, upload, decoded };
  saveConfig(deps.store, entry, {
    ...config,
    desired: settledWrites(writes, bases),
    unsupported: rememberedUnsupported(writes),
  });
  return { drinks, rows, previousState, previousBattery };
}

function publishOf(
  deps: BottleWorkerDeps,
  context: Upload,
  config: BottleEntryConfig,
): PublishInput {
  const { device, entry, upload } = context;
  const newestDrink = deps.readings.drinksPage(device.id, { before: null, limit: 1 })[0];
  const newestUv = deps.logs.newestUv(device.id);
  return {
    externalId: entry.externalId,
    at: upload.endedAt,
    level: levelOf(deps, device.id, config),
    cap: capOf(deps, device.id),
    link: upload.outcome === 'ok' ? 'asleep' : 'sync_failed',
    lastSeenAt: upload.outcome === 'asleep' ? null : upload.endedAt,
    lastDrinkAt: newestDrink === undefined ? null : isoOfSeconds(newestDrink.at),
    lastUvAt: newestUv === undefined ? null : isoOfSeconds(newestUv.at),
    firmware: deps.snapshots.get(device.id, SNAP.dis)?.value.firmware ?? null,
    rssi: upload.rssi,
    reminder:
      deps.snapshots.get(device.id, SNAP.reminder) === undefined
        ? null
        : currentReminder(deps, device.id),
    quiet:
      deps.snapshots.get(device.id, SNAP.quiet) === undefined
        ? null
        : currentQuiet(deps, device.id),
  };
}

export function syncBottle(deps: BottleWorkerDeps, input: SyncInput): SyncOutcome {
  const { device, entry, upload } = input;
  const decoded = decodeResponses(upload.responses);
  for (const item of decoded.unreadable) {
    deps.log.warn('bottle.response_unreadable', {
      device: device.id,
      name: item.name,
      reason: item.reason,
    });
  }
  const context: Upload = {
    device,
    entry,
    config: entryConfigOf(entry),
    clientId: input.clientId,
    upload,
    decoded,
  };
  const saved = save(deps, context);
  const fresh = deps.store.localDevices.byExternalId(entry.externalId);
  const config = entryConfigOf(fresh);
  const batch = new EventBatch(entry.externalId, deps.log);
  eventsOf({ ...deps, entry, device, config, upload }, batch, saved);
  return {
    entry: fresh,
    events: batch.finish(),
    publish: publishOf(deps, context, config),
    observed: observedOf(device.id, deps, upload),
    plan: syncPlanOf(planDepsOf(deps), { entry: fresh, deviceId: device.id }),
  };
}
