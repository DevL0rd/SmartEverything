import {
  BOTTLE_UV_REFUSALS,
  bottleMayStartUv,
  bottleNoticePending,
  bottleSessionsOf,
  secondsOfBottleClock,
  type BottleLink,
  type BottleReadQuery,
  type BottleStatusView,
  type BottleToday,
  type BottleView,
  type DeviceRow,
} from '@smarteverything/domain';
import { standingOf } from './access';
import { filterStatusOf } from './filter';
import { entryConfigOf, type BottleEntryConfig } from './config';
import { reminderOfCap, quietOfCap } from './convert';
import { phoneClientsOf } from './actions';
import { SNAP } from './snapshots';
import { capOf, isoOfSeconds, levelOf, orientationSnapshotOf } from './summary';
import { statsView } from './views-stats';
import { careView, diagnosticsView, settingsView } from './views-care';
import {
  DAY_SECONDS,
  dayWindow,
  drinkRowOf,
  readingRowOf,
  secondsOf,
  MS_PER_SECOND,
  type ViewContext,
  type ViewDeps,
} from './view-deps';
import { dayTotalsOf, goalMlOf, hourlyOf, hydrationRecords } from './water';
import type { LocalDeviceEntry } from '../../store/repositories/local-devices';
import { bottleDayAfter } from '@smarteverything/domain';

const DEFAULT_PACE = { from: 7 * 60, to: 23 * 60 } as const;

const PAGE = 50;

const SESSION_DAYS = 60;

const MINUTES_PER_DAY = 1440;

const MODEL_NAMES: Readonly<Record<string, string>> = {
  purevis2: 'PureVis 2',
  iq: 'BRITA iQ cap',
};

function modelName(model: string): string {
  const slug = model.slice(model.lastIndexOf('.') + 1);
  return MODEL_NAMES[slug] ?? model;
}

function paceWindow(deps: ViewDeps, deviceId: string): { from: number; to: number } {
  const read = deps.snapshots.get(deviceId, SNAP.reminder)?.value;
  if (read?.state !== 'interval_fixed') {
    return DEFAULT_PACE;
  }
  const reminder = reminderOfCap(read);
  const from = (secondsOfBottleClock(reminder.from) / 60) % MINUTES_PER_DAY;
  const to = secondsOfBottleClock(reminder.to) / 60;
  return to > from ? { from, to } : DEFAULT_PACE;
}

function todayOf(context: ViewContext, profileId: string): BottleToday {
  const { deps, device } = context;
  const now = deps.now();
  const day = deps.clock.dayOf(now);
  const goalMl = goalMlOf(deps.store.profiles.byId(profileId));
  const records = hydrationRecords(deps.store, profileId, {
    from: bottleDayAfter(day, -1),
    to: day,
  });
  const total = dayTotalsOf(records, goalMl).find((entry) => entry.day === day);
  const window = dayWindow(deps, day);
  const drinks = deps.readings.drinks(device.id, window);
  const pace = paceWindow(deps, device.id);
  const newest = deps.readings.drinksPage(device.id, { before: null, limit: 1 })[0];
  return {
    day,
    goalMl,
    totalMl: total?.totalMl ?? 0,
    bottleMl: total?.bottleMl ?? 0,
    loggedMl: total?.loggedMl ?? 0,
    otherMl: total?.otherMl ?? 0,
    hourly: hourlyOf(records, day),
    drinks: drinks.filter((item) => item.kind === 'drink').map((item) => drinkRowOf(deps, item)),
    fills: drinks.filter((item) => item.kind === 'fill').map((item) => drinkRowOf(deps, item)),
    levels: deps.readings.window(device.id, window).map(readingRowOf),
    lastDrinkAt: newest === undefined ? null : isoOfSeconds(newest.at),
    paceFromMinute: pace.from,
    paceToMinute: pace.to,
  };
}

function linkOf(
  context: ViewContext,
  config: BottleEntryConfig,
  last: { readonly outcome: string } | undefined,
): BottleLink {
  const { deps, device } = context;
  if (deps.syncing(device.id)) {
    return 'syncing';
  }
  const holder = deps.holder(device)?.clientId ?? null;
  if (phoneClientsOf(deps.store, config.binding.profileId, holder).length === 0) {
    return 'no_phone';
  }
  return last !== undefined && last.outcome !== 'ok' && last.outcome !== 'asleep'
    ? 'sync_failed'
    : 'asleep';
}

export function uvRefusalOf(cap: BottleStatusView['cap']): string | null {
  if (cap.fault !== null) {
    return BOTTLE_UV_REFUSALS.fault;
  }
  if (cap.interlock) {
    return BOTTLE_UV_REFUSALS.interlock;
  }
  if (cap.locked) {
    return BOTTLE_UV_REFUSALS.locked;
  }
  return cap.charging === 'charging' ? BOTTLE_UV_REFUSALS.charging : null;
}

function filterOf(context: ViewContext, config: BottleEntryConfig): BottleStatusView['filter'] {
  const { deps, device } = context;
  const now = deps.now();
  return filterStatusOf(
    deps.readings,
    { deviceId: device.id, now, today: deps.clock.dayOf(now) },
    config,
  );
}

function identityOf(
  context: ViewContext,
  config: BottleEntryConfig,
): Pick<BottleStatusView, 'deviceId' | 'name' | 'room' | 'model' | 'body'> {
  const { device } = context;
  return {
    deviceId: device.id,
    name: device.display_name ?? device.name,
    room: config.room,
    model: modelName(config.model),
    body: config.body,
  };
}

function bindingOf(
  context: ViewContext,
  config: BottleEntryConfig,
): Pick<BottleStatusView, 'person' | 'boundBy' | 'noticePending' | 'mayStartUv' | 'maySettings'> {
  const { deps, viewer } = context;
  const { binding } = config;
  const person = binding.profileId === null ? null : deps.store.profiles.byId(binding.profileId);
  return {
    person: person === null ? null : { id: person.id, name: person.name },
    boundBy: binding.boundBy === null ? null : deps.store.profiles.byId(binding.boundBy).name,
    noticePending: bottleNoticePending(binding, viewer.profileId),
    mayStartUv: bottleMayStartUv(binding, {
      owner: viewer.role === 'owner',
      profileId: viewer.profileId,
    }),
    maySettings: standingOf(viewer, config) !== 'none',
  };
}

function syncBlock(
  context: ViewContext,
  config: BottleEntryConfig,
): Pick<
  BottleStatusView,
  | 'link'
  | 'lastSeenAt'
  | 'lastSyncAt'
  | 'lastSyncOutcome'
  | 'lastSyncDetail'
  | 'firstSyncPending'
  | 'holder'
> {
  const { deps, device, viewer } = context;
  const last = deps.logs.syncs(device.id, 1)[0];
  const seen = deps.logs.syncs(device.id, 5).find((sync) => sync.outcome !== 'asleep');
  const holder = deps.holder(device);
  return {
    link: linkOf(context, config, last),
    lastSeenAt: seen?.endedAt ?? null,
    lastSyncAt: last?.endedAt ?? null,
    lastSyncOutcome: last === undefined ? null : syncOutcome(last.outcome),
    lastSyncDetail: last?.detail ?? null,
    firstSyncPending: last === undefined,
    holder:
      holder === null
        ? null
        : { name: holder.clientName, isYou: holder.clientId === viewer.clientId },
  };
}

function settingsBlock(
  context: ViewContext,
  config: BottleEntryConfig,
): Pick<BottleStatusView, 'reminder' | 'quiet' | 'pending' | 'filter'> {
  const { deps, device } = context;
  const reminder = deps.snapshots.get(device.id, SNAP.reminder);
  const quiet = deps.snapshots.get(device.id, SNAP.quiet);
  return {
    reminder: reminder === undefined ? null : reminderOfCap(reminder.value),
    quiet: quiet === undefined ? null : quietOfCap(quiet.value),
    pending: { reminder: config.desired.reminder !== null, quiet: config.desired.quiet !== null },
    filter: filterOf(context, config),
  };
}

function healthBlock(
  context: ViewContext,
): Pick<BottleStatusView, 'clockDriftSeconds' | 'firmware' | 'historyFrom'> {
  const { deps, device } = context;
  const oldest = deps.readings.oldestAt(device.id);
  return {
    clockDriftSeconds: deps.snapshots.get(device.id, SNAP.timeDrift)?.value.driftSeconds ?? null,
    firmware: deps.snapshots.get(device.id, SNAP.dis)?.value.firmware ?? null,
    historyFrom: oldest === null ? null : isoOfSeconds(oldest),
  };
}

function statusView(context: ViewContext, entry: LocalDeviceEntry): BottleStatusView {
  const { deps, device, viewer } = context;
  const config = entryConfigOf(entry);
  const cap = capOf(deps, device.id);
  return {
    view: 'status',
    ...identityOf(context, config),
    ...syncBlock(context, config),
    ...bindingOf(context, config),
    ...settingsBlock(context, config),
    ...healthBlock(context),
    level: levelOf(deps, device.id, config),
    cap,
    orientation: orientationSnapshotOf(deps, device.id),
    uv: uvOf(context),
    today: todayOf(context, config.binding.profileId ?? viewer.profileId),
    uvRefusal: uvRefusalOf(cap),
  };
}

function syncOutcome(outcome: string): 'ok' | 'disconnected' | 'asleep' | 'refused' | 'unreadable' {
  switch (outcome) {
    case 'disconnected':
    case 'unreadable':
    case 'asleep':
    case 'refused':
      return outcome;
    default:
      return 'ok';
  }
}

function uvOf(context: ViewContext): BottleStatusView['uv'] {
  const row = context.deps.logs.newestUv(context.device.id);
  return { lastAt: row === undefined ? null : isoOfSeconds(row.at), lastMode: row?.mode ?? null };
}

function page(query: BottleReadQuery): { readonly before: number | null; readonly limit: number } {
  return {
    before: query.before === undefined ? null : secondsOf(query.before),
    limit: (query.limit ?? PAGE) + 1,
  };
}

function drinksView(context: ViewContext, query: BottleReadQuery): BottleView {
  const { deps, device } = context;
  if (query.day !== undefined) {
    const rows = deps.readings.drinks(device.id, dayWindow(deps, query.day));
    return { view: 'drinks', drinks: rows.map((row) => drinkRowOf(deps, row)), more: false };
  }
  const { before, limit } = page(query);
  const rows = deps.readings.drinksPage(device.id, { before, limit });
  return {
    view: 'drinks',
    drinks: rows.slice(0, limit - 1).map((row) => drinkRowOf(deps, row)),
    more: rows.length === limit,
  };
}

function readingsView(context: ViewContext, query: BottleReadQuery): BottleView {
  const { deps, device } = context;
  if (query.day !== undefined) {
    const rows = deps.readings.window(device.id, dayWindow(deps, query.day));
    return { view: 'readings', readings: rows.map(readingRowOf), more: false };
  }
  const { before, limit } = page(query);
  const rows = deps.readings.page(device.id, { before, limit });
  return {
    view: 'readings',
    readings: rows.slice(0, limit - 1).map(readingRowOf),
    more: rows.length === limit,
  };
}

function sessionsView(context: ViewContext, query: BottleReadQuery): BottleView {
  const { deps, device } = context;
  const to = Math.floor(deps.now().getTime() / MS_PER_SECOND);
  const rows = deps.readings
    .window(device.id, { from: to - SESSION_DAYS * DAY_SECONDS, to })
    .map(readingRowOf);
  const limit = query.limit ?? PAGE;
  const sessions = bottleSessionsOf(rows).filter(
    (session) => query.before === undefined || session.startedAt < query.before,
  );
  return { view: 'sessions', sessions: sessions.slice(0, limit), more: sessions.length > limit };
}

export function readView(
  context: ViewContext,
  entry: LocalDeviceEntry,
  query: BottleReadQuery,
): BottleView {
  switch (query.view) {
    case 'status':
      return statusView(context, entry);
    case 'drinks':
      return drinksView(context, query);
    case 'readings':
      return readingsView(context, query);
    case 'sessions':
      return sessionsView(context, query);
    case 'stats':
      return statsView(context, entry, query.range ?? 'week');
    case 'care':
      return careView(context, entry);
    case 'settings':
      return settingsView(context, entry);
    case 'diagnostics':
      return diagnosticsView(context, entry);
  }
}

export type { DeviceRow };
