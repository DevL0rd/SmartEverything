import {
  BOTTLE_LOW_BATTERY_PCT,
  bottleChargesFromBattery,
  bottleFaultName,
  bottleFilterStatusOf,
  type BottleSyncUpload,
  type DeviceRow,
} from '@smarteverything/domain';
import type { BottleLogsRepository, StoredUv } from '../../store/repositories/bottle-logs';
import type { BottleReadingsRepository } from '../../store/repositories/bottle-readings';
import type { LocalDeviceEntry } from '../../store/repositories/local-devices';
import type { Store } from '../../store/store';
import type { HomeClock } from './clock';
import type { BottleEntryConfig } from './config';
import type { DrinkItem } from './drinks';
import { IMPORT_AGE_MS, drinkEvents, type EventBatch } from './events';
import { SNAP, type Snapshots } from './snapshots';
import { batteryPointsOf } from './summary';
import { dayTotalsOf, goalMlOf, hydrationRecords } from './water';

interface EventContext {
  readonly store: Store;
  readonly readings: BottleReadingsRepository;
  readonly logs: BottleLogsRepository;
  readonly snapshots: Snapshots;
  readonly clock: HomeClock;
  readonly now: () => Date;
  readonly entry: LocalDeviceEntry;
  readonly device: DeviceRow;
  readonly config: BottleEntryConfig;
  readonly upload: BottleSyncUpload;
}

interface SavedFacts {
  readonly drinks: readonly DrinkItem[];
  readonly rows: {
    readonly uv: readonly StoredUv[];
    readonly faults: readonly { readonly at: number; readonly type: string }[];
  };
  readonly previousState: string | null;
  readonly previousBattery: number | null;
}

const MS_PER_SECOND = 1000;

const DAY_MS = 86_400_000;

const RECENT_DAYS = 14;

function goalEvent(ctx: EventContext, batch: EventBatch, saved: SavedFacts): void {
  const profileId = ctx.config.binding.profileId;
  const added = saved.drinks.filter((item) => item.kind === 'drink');
  if (profileId === null || added.length === 0) {
    return;
  }
  const now = ctx.now();
  const today = ctx.clock.dayOf(now);
  const goalMl = goalMlOf(ctx.store.profiles.byId(profileId));
  const total = dayTotalsOf(
    hydrationRecords(ctx.store, profileId, { from: today, to: today }),
    goalMl,
  ).find((day) => day.day === today)?.totalMl;
  const addedToday = added
    .filter((item) => ctx.clock.dayOf(new Date(item.at * MS_PER_SECOND)) === today)
    .reduce((sum, item) => sum + item.ml, 0);
  if (total !== undefined && total >= goalMl && total - addedToday < goalMl) {
    batch.add(
      'activity',
      now,
      { activity: 'goal_reached', ml: total, goalMl, profileId },
      `goal:${profileId}:${today}`,
    );
  }
}

function cleanEvents(ctx: EventContext, batch: EventBatch, saved: SavedFacts): void {
  const now = ctx.now();
  for (const row of saved.rows.uv) {
    if (now.getTime() - row.at * MS_PER_SECOND <= IMPORT_AGE_MS) {
      batch.add(
        'activity',
        new Date(row.at * MS_PER_SECOND),
        { activity: 'uv_clean', mode: row.mode, socPct: row.socPct },
        `uv:${String(row.at)}`,
      );
    }
  }
  for (const row of saved.rows.faults) {
    batch.add(
      'fault',
      new Date(row.at * MS_PER_SECOND),
      { fault: row.type, name: bottleFaultName(row.type) },
      `fault:${String(row.at)}:${row.type}`,
    );
  }
}

function chargingEvents(ctx: EventContext, batch: EventBatch, saved: SavedFacts): void {
  const state = ctx.snapshots.get(ctx.device.id, SNAP.uiState)?.value.state ?? null;
  const pct = ctx.logs.newestBattery(ctx.device.id)?.pct ?? null;
  const at = new Date(ctx.upload.endedAt);
  if (state === 'charging' && saved.previousState !== 'charging') {
    batch.add(
      'activity',
      at,
      { activity: 'charging_started', pct },
      `charging:${ctx.upload.endedAt}`,
    );
  }
  if (state === 'charged' && saved.previousState !== 'charged') {
    batch.add(
      'activity',
      at,
      { activity: 'charging_finished', pct },
      `charged:${ctx.upload.endedAt}`,
    );
  }
}

function crossedLow(ctx: EventContext, saved: SavedFacts, pct: number | null): boolean {
  const alert =
    ctx.snapshots.get(ctx.device.id, SNAP.lowBattery)?.value.alertPct ?? BOTTLE_LOW_BATTERY_PCT;
  if (pct === null || pct > alert) {
    return false;
  }
  const wasAbove = saved.previousBattery === null || saved.previousBattery > alert;
  const state = ctx.snapshots.get(ctx.device.id, SNAP.uiState)?.value.state;
  return wasAbove || (state === 'battery_low' && saved.previousState !== 'battery_low');
}

function batteryLowEvent(ctx: EventContext, batch: EventBatch, saved: SavedFacts): void {
  const pct = ctx.logs.newestBattery(ctx.device.id)?.pct ?? null;
  if (!crossedLow(ctx, saved, pct)) {
    return;
  }
  const lastCharge = bottleChargesFromBattery(batteryPointsOf(ctx, ctx.device.id)).at(-1);
  batch.add(
    'maintenance',
    ctx.now(),
    { maintenance: 'battery_low', pct },
    `battery_low:${lastCharge?.endAt ?? 'none'}`,
  );
}

function filterDueEvent(ctx: EventContext, batch: EventBatch): void {
  const installedOn = ctx.config.filter.installedOn;
  if (installedOn === null) {
    return;
  }
  const now = ctx.now();
  const since = Math.floor(Date.parse(`${installedOn}T00:00:00Z`) / MS_PER_SECOND);
  const nowSeconds = Math.floor(now.getTime() / MS_PER_SECOND);
  const status = bottleFilterStatusOf(
    ctx.config.filter,
    ctx.readings.drunkMl(ctx.device.id, { from: since, to: nowSeconds }),
    ctx.readings.drunkMl(ctx.device.id, {
      from: nowSeconds - Math.floor((RECENT_DAYS * DAY_MS) / MS_PER_SECOND),
      to: nowSeconds,
    }),
    ctx.clock.dayOf(now),
  );
  if (status?.due === true) {
    batch.add(
      'maintenance',
      now,
      { maintenance: 'filter_due', litres: Math.round(status.litresUsed), days: status.daysUsed },
      `filter_due:${installedOn}`,
    );
  }
}

export function eventsOf(ctx: EventContext, batch: EventBatch, saved: SavedFacts): void {
  drinkEvents(batch, saved.drinks, ctx.config.binding.profileId, ctx.now());
  goalEvent(ctx, batch, saved);
  cleanEvents(ctx, batch, saved);
  chargingEvents(ctx, batch, saved);
  batteryLowEvent(ctx, batch, saved);
  filterDueEvent(ctx, batch);
}
