import {
  bottleDayAfter,
  bottleDayOfInstant,
  bottleMinuteOfInstant,
  bottleStatsOf,
  type BottleStatDrink,
  type BottleStatFill,
  type BottleStats,
  type BottleStatsRange,
  type BottleView,
  type DeviceRow,
} from '@smarteverything/domain';
import type { LocalDeviceEntry } from '../../store/repositories/local-devices';
import { entryConfigOf } from './config';
import { DAY_SECONDS, MS_PER_SECOND, type ViewContext } from './view-deps';
import { dayTotalsOf, goalMlOf, hourlyOf, hydrationRecords } from './water';

const HISTORY_DAYS = 730;

const DRINK_DAYS = 400;

export class StatsCache {
  private version = 0;
  private readonly entries = new Map<
    string,
    { readonly version: number; readonly value: BottleView }
  >();

  invalidate(): void {
    this.version += 1;
  }

  async get(key: string, compute: () => Promise<BottleView>): Promise<BottleView> {
    const known = this.entries.get(key);
    if (known?.version === this.version) {
      return known.value;
    }
    const version = this.version;
    const value = await compute();
    if (version === this.version) {
      this.entries.set(key, { version, value });
    }
    return value;
  }
}

interface Request {
  readonly entry: LocalDeviceEntry;
  readonly range: BottleStatsRange;
  readonly profileId: string;
  readonly today: string;
}

function compute(context: ViewContext, request: Request): BottleStats {
  const { entry, range, profileId, today } = request;
  const { deps, device } = context;
  const config = entryConfigOf(entry);
  const goalMl = goalMlOf(deps.store.profiles.byId(profileId));
  const records = hydrationRecords(deps.store, profileId, {
    from: bottleDayAfter(today, -HISTORY_DAYS),
    to: today,
  });
  const offset = deps.clock.offsetOf(deps.now());
  const to = Math.floor(deps.now().getTime() / MS_PER_SECOND);
  const stored = deps.readings.drinks(device.id, { from: to - DRINK_DAYS * DAY_SECONDS, to });
  const localised = stored.map((item) => {
    const iso = new Date(item.at * MS_PER_SECOND).toISOString();
    return {
      item,
      day: bottleDayOfInstant(iso, offset),
      minute: bottleMinuteOfInstant(iso, offset),
    };
  });
  const drinks: BottleStatDrink[] = localised
    .filter(
      ({ item }) =>
        item.kind === 'drink' &&
        (item.profileId === profileId || config.binding.profileId === null),
    )
    .map(({ item, day, minute }) => ({ day, minute, ml: item.ml }));
  const fills: BottleStatFill[] = localised
    .filter(({ item }) => item.kind === 'fill')
    .map(({ item, day }) => ({ day, ml: item.ml }));
  const todayHours = hourlyOf(records, today);
  const yesterdayHours = hourlyOf(records, bottleDayAfter(today, -1));
  return bottleStatsOf({
    range,
    today,
    goalMl,
    days: dayTotalsOf(records, goalMl),
    drinks,
    fills,
    hours: todayHours.map((todayMl, hour) => ({ todayMl, yesterdayMl: yesterdayHours[hour] ?? 0 })),
  });
}

export function statsView(
  context: ViewContext,
  entry: LocalDeviceEntry,
  range: BottleStatsRange,
): BottleStats {
  const { deps, viewer } = context;
  const config = entryConfigOf(entry);
  const profileId = config.binding.profileId ?? viewer.profileId;
  const today = deps.clock.dayOf(deps.now());
  return compute(context, { entry, range, profileId, today });
}

export function statsKey(
  device: Pick<DeviceRow, 'id'>,
  profileId: string,
  range: BottleStatsRange,
  today: string,
): string {
  return `${device.id}|${profileId}|${range}|${today}`;
}
