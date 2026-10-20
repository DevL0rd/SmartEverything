import {
  bottleSerialOf,
  type AdapterSink,
  type BottleLog,
  type BottleSyncResult,
  type BottleSyncUpload,
  type ClientRow,
  type DeviceRow,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { BottleLogsRepository } from '../../store/repositories/bottle-logs';
import type { BottleReadingsRepository } from '../../store/repositories/bottle-readings';
import type { LocalDeviceEntry } from '../../store/repositories/local-devices';
import type { Store } from '../../store/store';
import type { HomeClock } from './clock';
import { entryConfigOf, saveConfig, type BottleEntryConfig } from './config';
import { decodeResponses, type Decoded } from './decode';
import { saveDrinks, drinkItemsOf, type DrinkItem } from './drinks';
import { EventBatch } from './events';
import { saveLogs, type NewRows } from './ingest-logs';
import { eventsOf } from './ingest-events';
import type { LocalDevices } from '../local-devices';
import { currentQuiet, currentReminder, syncPlanOf, type PlanDeps } from './plan';
import { basesOf, rememberedUnsupported, settledWrites, type WriteContext } from './writes';
import { publishStates } from './publisher';
import { curveOf, storeIncoming } from './readings';
import { SNAP, type Snapshots } from './snapshots';
import { capOf, isoOfSeconds, levelOf } from './summary';

export interface IngestDeps {
  readonly store: Store;
  readonly readings: BottleReadingsRepository;
  readonly logs: BottleLogsRepository;
  readonly snapshots: Snapshots;
  readonly sink: () => AdapterSink;
  readonly local: Pick<LocalDevices, 'observe'>;
  readonly clock: HomeClock;
  readonly now: () => Date;
  readonly log: Logger;
}

const MS_PER_SECOND = 1000;

interface Saved {
  readonly drinks: readonly DrinkItem[];
  readonly rows: NewRows;
  readonly previousState: string | null;
  readonly previousBattery: number | null;
}

function secondsOf(iso: string): number {
  return Math.floor(Date.parse(iso) / MS_PER_SECOND);
}

export function planDepsOf(deps: IngestDeps): PlanDeps {
  return {
    readings: deps.readings,
    logs: deps.logs,
    snapshots: deps.snapshots,
    now: deps.now,
  };
}

function observedOf(
  deviceId: string,
  deps: Pick<IngestDeps, 'snapshots'>,
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

interface Upload {
  readonly device: DeviceRow;
  readonly entry: LocalDeviceEntry;
  readonly config: BottleEntryConfig;
  readonly clientId: string;
  readonly upload: BottleSyncUpload;
  readonly decoded: Decoded;
}

export class BottleIngest {
  constructor(private readonly deps: IngestDeps) {}

  async process(
    device: DeviceRow,
    entry: LocalDeviceEntry,
    client: Pick<ClientRow, 'id'>,
    upload: BottleSyncUpload,
  ): Promise<BottleSyncResult> {
    const { deps } = this;
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
      clientId: client.id,
      upload,
      decoded,
    };
    const saved = deps.store.write(() => this.save(context));
    await this.afterSave(context, saved);
    const fresh = deps.store.localDevices.byExternalId(entry.externalId);
    return {
      accepted: upload.responses.length,
      plan: syncPlanOf(planDepsOf(deps), { entry: fresh, deviceId: device.id }),
    };
  }

  private save(context: Upload): Saved {
    const { deps } = this;
    const { device, entry, config, upload, decoded } = context;
    const previousState = deps.snapshots.get(device.id, SNAP.uiState)?.value.state ?? null;
    const previousBattery = deps.logs.newestBattery(device.id)?.pct ?? null;
    const bases = basesOf(deps, device.id);
    this.saveSync(context);
    this.saveReads(context);
    const rows = saveLogs(deps.logs, device.id, decoded.logs);
    const drinks = this.saveReadings(context);
    this.saveSyncedLogs(context);
    const writes: WriteContext = { deps, deviceId: device.id, config, upload, decoded };
    saveConfig(deps.store, entry, {
      ...config,
      desired: settledWrites(writes, bases),
      unsupported: rememberedUnsupported(writes),
    });
    return { drinks, rows, previousState, previousBattery };
  }

  private saveSync(context: Upload): void {
    const { upload } = context;
    this.deps.logs.addSync(context.device.id, {
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

  private saveReads(context: Upload): void {
    const { deps } = this;
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

  private saveReadings(context: Upload): DrinkItem[] {
    const { deps } = this;
    const { device, entry, config, decoded } = context;
    const incoming = storeIncoming(deps, device.id, curveOf(config), decoded.logs.tof);
    const outcome = saveDrinks(
      { store: deps.store, readings: deps.readings, clock: deps.clock, log: deps.log },
      { deviceId: device.id, serial: bottleSerialOf(entry.externalId), binding: config.binding },
      drinkItemsOf(incoming.rows),
    );
    return incoming.replayed ? [] : [...outcome.created];
  }

  private saveSyncedLogs(context: Upload): void {
    const { device, upload, decoded } = context;
    const stamps: Record<string, string> = {
      ...(this.deps.snapshots.get(device.id, SNAP.logSync)?.value ?? {}),
    };
    decoded.logsFetched.forEach((log: BottleLog) => {
      stamps[log] = upload.endedAt;
    });
    this.deps.snapshots.save(device.id, SNAP.logSync, upload.endedAt, stamps);
  }

  private async afterSave(context: Upload, saved: Saved): Promise<void> {
    const { deps } = this;
    const { device, entry, upload } = context;
    const config = entryConfigOf(deps.store.localDevices.byExternalId(entry.externalId));
    const batch = new EventBatch(entry.externalId, deps.log);
    eventsOf({ ...deps, entry, device, config, upload }, batch, saved);
    for (const event of batch.finish()) {
      deps.sink().event(event);
    }
    this.publish(context, config);
    await deps.local.observe(entry.externalId, observedOf(device.id, deps, upload));
  }

  private publish(context: Upload, config: BottleEntryConfig): void {
    const { deps } = this;
    const { device, entry, upload } = context;
    const newestDrink = deps.readings.drinksPage(device.id, { before: null, limit: 1 })[0];
    const newestUv = deps.logs.newestUv(device.id);
    publishStates(deps.sink(), {
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
    });
  }
}
