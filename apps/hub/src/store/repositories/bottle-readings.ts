import {
  BOTTLE_READING_KINDS,
  BOTTLE_VERDICTS,
  type BottleReadingKind,
  type BottleVerdict,
} from '@smarteverything/domain';
import { z } from 'zod';
import type { StoreContext } from '../context';

const COUNT = z.number().int().nonnegative();

const READING = z
  .object({
    at: COUNT,
    trigger_type: z.string(),
    distance_mm: COUNT,
    kcps: COUNT,
    led_ohm: z.number(),
    verdict: z.enum(BOTTLE_VERDICTS),
    volume_ml: COUNT.nullable(),
    kind: z.enum(BOTTLE_READING_KINDS),
    event_ml: COUNT.nullable(),
    drunk_ml: COUNT.nullable(),
  })
  .transform((row) => ({
    at: row.at,
    trigger: row.trigger_type,
    distanceMm: row.distance_mm,
    kcps: row.kcps,
    ledOhm: row.led_ohm,
    verdict: row.verdict,
    volumeMl: row.volume_ml,
    kind: row.kind,
    eventMl: row.event_ml,
    drunkMl: row.drunk_ml,
  }));

export interface StoredReading {
  readonly at: number;
  readonly trigger: string;
  readonly distanceMm: number;
  readonly kcps: number;
  readonly ledOhm: number;
  readonly verdict: BottleVerdict;
  readonly volumeMl: number | null;
  readonly kind: BottleReadingKind;
  readonly eventMl: number | null;
  readonly drunkMl: number | null;
}

const COLUMNS =
  'at, trigger_type, distance_mm, kcps, led_ohm, verdict, volume_ml, kind, event_ml, drunk_ml';

const DRINK = z
  .object({
    at: COUNT,
    kind: z.enum(['drink', 'fill']),
    ml: COUNT,
    level_ml: COUNT.nullable(),
    profile_id: z.string().nullable(),
    entry_id: z.string().nullable(),
  })
  .transform((row) => ({
    at: row.at,
    kind: row.kind,
    ml: row.ml,
    levelMl: row.level_ml,
    profileId: row.profile_id,
    entryId: row.entry_id,
  }));

export interface StoredDrink {
  readonly at: number;
  readonly kind: 'drink' | 'fill';
  readonly ml: number;
  readonly levelMl: number | null;
  readonly profileId: string | null;
  readonly entryId: string | null;
}

const COUNTS = z.object({ verdict: z.string(), kind: z.string(), total: COUNT });

const EXTREME = z.object({ at: COUNT.nullable() });

const SUM = z.object({ total: z.number().nullable() });

const KCPS = z.object({ kcps: COUNT });

const VERSION = z.object({ version: COUNT });

interface ReadingWindow {
  readonly from: number;
  readonly to: number;
}

interface ReadingPage {
  readonly before: number | null;
  readonly limit: number;
}

export class BottleReadingsRepository {
  constructor(private readonly context: StoreContext) {}

  insert(deviceId: string, row: StoredReading): boolean {
    return (
      this.context.sql.run(
        'save the bottle reading',
        `insert or ignore into bottle_readings (device_id, ${COLUMNS})
         values ($deviceId, $at, $trigger, $distance, $kcps, $led, $verdict, $volume, $kind, $eventMl, $drunkMl)`,
        {
          deviceId,
          at: row.at,
          trigger: row.trigger,
          distance: row.distanceMm,
          kcps: row.kcps,
          led: row.ledOhm,
          verdict: row.verdict,
          volume: row.volumeMl,
          kind: row.kind,
          eventMl: row.eventMl,
          drunkMl: row.drunkMl,
        },
      ) > 0
    );
  }

  rederived(deviceId: string, row: StoredReading): void {
    this.context.sql.run(
      'save the recomputed bottle reading',
      `update bottle_readings set verdict = $verdict, volume_ml = $volume, kind = $kind,
         event_ml = $eventMl, drunk_ml = $drunkMl
       where device_id = $deviceId and at = $at and trigger_type = $trigger and distance_mm = $distance`,
      {
        deviceId,
        at: row.at,
        trigger: row.trigger,
        distance: row.distanceMm,
        verdict: row.verdict,
        volume: row.volumeMl,
        kind: row.kind,
        eventMl: row.eventMl,
        drunkMl: row.drunkMl,
      },
    );
  }

  remove(deviceId: string, row: Pick<StoredReading, 'at' | 'trigger' | 'distanceMm'>): void {
    this.context.sql.run(
      'remove the undecided bottle reading',
      `delete from bottle_readings
       where device_id = $deviceId and at = $at and trigger_type = $trigger and distance_mm = $distance`,
      { deviceId, at: row.at, trigger: row.trigger, distance: row.distanceMm },
    );
  }

  window(deviceId: string, window: ReadingWindow): StoredReading[] {
    return this.context.sql.all(
      READING,
      `select ${COLUMNS} from bottle_readings
       where device_id = $deviceId and at >= $from and at <= $to
       order by at, trigger_type, distance_mm`,
      { deviceId, from: window.from, to: window.to },
    );
  }

  all(deviceId: string): StoredReading[] {
    return this.window(deviceId, { from: 0, to: Number.MAX_SAFE_INTEGER });
  }

  page(deviceId: string, page: ReadingPage): StoredReading[] {
    return this.context.sql.all(
      READING,
      `select ${COLUMNS} from bottle_readings
       where device_id = $deviceId and ($before is null or at < $before)
       order by at desc, trigger_type, distance_mm limit $limit`,
      { deviceId, before: page.before, limit: page.limit },
    );
  }

  newestAccepted(deviceId: string): StoredReading | undefined {
    return this.context.sql.get(
      READING,
      `select ${COLUMNS} from bottle_readings
       where device_id = $deviceId and verdict = 'accepted' and volume_ml is not null
       order by at desc, trigger_type, distance_mm limit 1`,
      { deviceId },
    );
  }

  newestAt(deviceId: string, notAfter: number): number | null {
    return (
      this.context.sql.get(
        EXTREME,
        'select max(at) as at from bottle_readings where device_id = $deviceId and at <= $notAfter',
        { deviceId, notAfter },
      )?.at ?? null
    );
  }

  oldestAt(deviceId: string): number | null {
    return (
      this.context.sql.get(
        EXTREME,
        `select min(at) as at from bottle_readings
         where device_id = $deviceId and verdict <> 'clock_invalid'`,
        { deviceId },
      )?.at ?? null
    );
  }

  qualityCounts(deviceId: string): {
    accepted: number;
    small: number;
    rejected: number;
    clockInvalid: number;
  } {
    const rows = this.context.sql.all(
      COUNTS,
      `select verdict, kind, count(*) as total from bottle_readings
       where device_id = $deviceId group by verdict, kind`,
      { deviceId },
    );
    const sum = (match: (row: z.infer<typeof COUNTS>) => boolean): number =>
      rows.filter(match).reduce((total, row) => total + row.total, 0);
    return {
      accepted: sum((row) => row.verdict === 'accepted' && row.kind !== 'small'),
      small: sum((row) => row.verdict === 'accepted' && row.kind === 'small'),
      rejected: sum((row) => row.verdict !== 'accepted' && row.verdict !== 'clock_invalid'),
      clockInvalid: sum((row) => row.verdict === 'clock_invalid'),
    };
  }

  recentKcps(deviceId: string, count: number): number[] {
    return this.context.sql
      .all(
        KCPS,
        `select kcps from bottle_readings where device_id = $deviceId
         order by at desc, trigger_type limit $count`,
        { deviceId, count },
      )
      .map((row) => row.kcps)
      .reverse();
  }

  insertDrink(deviceId: string, drink: StoredDrink): boolean {
    return (
      this.context.sql.run(
        'save the bottle drink',
        `insert or ignore into bottle_drinks (device_id, at, kind, ml, level_ml, profile_id, entry_id)
         values ($deviceId, $at, $kind, $ml, $level, $profile, $entry)`,
        {
          deviceId,
          at: drink.at,
          kind: drink.kind,
          ml: drink.ml,
          level: drink.levelMl,
          profile: drink.profileId,
          entry: drink.entryId,
        },
      ) > 0
    );
  }

  attachEntry(deviceId: string, at: number, kind: 'drink' | 'fill', entryId: string): void {
    this.context.sql.run(
      'link the bottle drink to its water entry',
      'update bottle_drinks set entry_id = $entryId where device_id = $deviceId and at = $at and kind = $kind',
      { deviceId, at, kind, entryId },
    );
  }

  setDrinkMl(deviceId: string, at: number, kind: 'drink' | 'fill', ml: number): void {
    this.context.sql.run(
      'correct the bottle drink',
      'update bottle_drinks set ml = $ml where device_id = $deviceId and at = $at and kind = $kind',
      { deviceId, at, kind, ml },
    );
  }

  entryVersion(entryId: string): number | null {
    return (
      this.context.sql.get(
        VERSION,
        'select version from health_entries where id = $entryId and deleted_at is null',
        { entryId },
      )?.version ?? null
    );
  }

  drink(deviceId: string, at: number, kind: 'drink' | 'fill'): StoredDrink | undefined {
    return this.context.sql.get(
      DRINK,
      `select at, kind, ml, level_ml, profile_id, entry_id from bottle_drinks
       where device_id = $deviceId and at = $at and kind = $kind`,
      { deviceId, at, kind },
    );
  }

  drinks(deviceId: string, window: ReadingWindow): StoredDrink[] {
    return this.context.sql.all(
      DRINK,
      `select at, kind, ml, level_ml, profile_id, entry_id from bottle_drinks
       where device_id = $deviceId and at >= $from and at <= $to order by at, kind`,
      { deviceId, from: window.from, to: window.to },
    );
  }

  drinksPage(deviceId: string, page: ReadingPage): StoredDrink[] {
    return this.context.sql.all(
      DRINK,
      `select at, kind, ml, level_ml, profile_id, entry_id from bottle_drinks
       where device_id = $deviceId and ($before is null or at < $before)
       order by at desc, kind limit $limit`,
      { deviceId, before: page.before, limit: page.limit },
    );
  }

  drunkMl(deviceId: string, window: ReadingWindow): number {
    return (
      this.context.sql.get(
        SUM,
        `select sum(d.ml) as total from bottle_drinks d
         left join health_entries e on e.id = d.entry_id and e.deleted_at is null
         where d.device_id = $deviceId and d.kind = 'drink' and d.at >= $from and d.at <= $to
           and (d.entry_id is null or e.id is not null)`,
        { deviceId, from: window.from, to: window.to },
      )?.total ?? 0
    );
  }
}
