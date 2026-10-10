import {
  BODY_READING_ROW,
  type Attribution,
  type BodyComposition,
  type BodyReadingRow,
} from '@smarteverything/domain';
import type { SQLInputValue } from 'node:sqlite';
import { z } from 'zod';
import { storedRow } from '../codec';
import { assignments, found, moment, type StoreContext } from '../context';
import { jsonText } from '../sql';

const STORED_READING = storedRow(BODY_READING_ROW, { json: ['composition'] });

const SELECT = `select r.id, r.device_id, r.profile_id, r.measured_at, r.weight_kg, r.impedance_low,
  r.impedance_high, r.heart_rate, r.scale_user, r.attribution, r.bmi, r.composition, r.version,
  (select max(w.written_at) from body_reading_writes w where w.reading_id = r.id)
    as saved_to_health_connect_at,
  r.created_at, r.updated_at
  from body_readings r`;

export interface ScaleMeasurement {
  readonly deviceId: string;
  readonly measuredAt: string;
  readonly scaleUser: number;
  readonly weightKg: number | null;
  readonly heartRate: number | null;
  readonly impedance: number | null;
}

export interface ReadingOwner {
  readonly profileId: string | null;
  readonly attribution: Attribution;
  readonly bmi: number | null;
  readonly composition: BodyComposition | null;
}

export interface Merged {
  readonly before: BodyReadingRow | undefined;
  readonly after: BodyReadingRow;
}

const LAST_WEIGHT = z.object({ profile_id: z.string(), weight_kg: z.number() });

function impedancesOf(
  before: BodyReadingRow | undefined,
  impedance: number | null,
): { readonly low: number | null; readonly high: number | null } {
  const known = [before?.impedance_low, before?.impedance_high, impedance].filter(
    (value): value is number => typeof value === 'number',
  );
  const distinct = [...new Set(known)].sort((left, right) => right - left);
  return { low: distinct[0] ?? null, high: distinct[1] ?? null };
}

type MeasuredValues = Pick<
  BodyReadingRow,
  'weight_kg' | 'heart_rate' | 'impedance_low' | 'impedance_high' | 'scale_user'
>;

function valuesOf(
  before: BodyReadingRow | undefined,
  measurement: ScaleMeasurement,
): MeasuredValues {
  const impedances = impedancesOf(before, measurement.impedance);
  return {
    weight_kg: measurement.weightKg ?? before?.weight_kg ?? null,
    heart_rate: measurement.heartRate ?? before?.heart_rate ?? null,
    impedance_low: impedances.low,
    impedance_high: impedances.high,
    scale_user: measurement.scaleUser,
  };
}

function unchanged(before: BodyReadingRow, values: MeasuredValues): boolean {
  return (
    before.weight_kg === values.weight_kg &&
    before.heart_rate === values.heart_rate &&
    before.impedance_low === values.impedance_low &&
    before.impedance_high === values.impedance_high &&
    before.scale_user === values.scale_user
  );
}

export class BodyReadingsRepository {
  constructor(private readonly context: StoreContext) {}

  recent(limit: number): BodyReadingRow[] {
    return this.context.sql.all(
      STORED_READING,
      `${SELECT} order by r.measured_at desc limit $limit`,
      { limit },
    );
  }

  byId(id: string): BodyReadingRow {
    return found(
      this.context.sql.get(STORED_READING, `${SELECT} where r.id = $id`, { id }),
      'body reading',
      id,
    );
  }

  merge(measurement: ScaleMeasurement): Merged {
    return this.context.write(() => {
      const before = this.context.sql.get(
        STORED_READING,
        `${SELECT} where r.device_id = $deviceId and r.measured_at = $measuredAt`,
        { deviceId: measurement.deviceId, measuredAt: moment(measurement.measuredAt) },
      );
      const values = valuesOf(before, measurement);
      if (before !== undefined && unchanged(before, values)) {
        return { before, after: before };
      }
      const id = before?.id ?? this.insert(measurement);
      this.set(id, values);
      return { before, after: this.publish(id, before) };
    });
  }

  own(id: string, owner: ReadingOwner): Merged {
    return this.context.write(() => {
      const before = this.byId(id);
      this.set(id, {
        profile_id: owner.profileId,
        attribution: owner.attribution,
        bmi: owner.bmi,
        composition: owner.composition === null ? null : jsonText(owner.composition),
        version: before.version + 1,
      });
      return { before, after: this.publish(id, before) };
    });
  }

  ofProfile(profileId: string): BodyReadingRow[] {
    return this.context.sql.all(
      STORED_READING,
      `${SELECT} where r.profile_id = $profileId and r.attribution not in ('pending', 'ignored')
       order by r.measured_at`,
      { profileId },
    );
  }

  lastWeights(since: string): ReadonlyMap<string, number> {
    const rows = this.context.sql.all(
      LAST_WEIGHT,
      `select profile_id, weight_kg from body_readings
       where profile_id is not null and weight_kg is not null and measured_at >= $since
         and attribution not in ('pending', 'ignored')
       order by measured_at`,
      { since: moment(since) },
    );
    return new Map(rows.map((row) => [row.profile_id, row.weight_kg]));
  }

  outbox(profileId: string, sourceId: string): BodyReadingRow[] {
    return this.context.sql.all(
      STORED_READING,
      `${SELECT} where r.profile_id = $profileId and r.weight_kg is not null
         and r.attribution not in ('pending', 'ignored')
         and not exists (select 1 from body_reading_writes w
           where w.reading_id = r.id and w.source_id = $sourceId and w.version >= r.version)
       order by r.measured_at limit 200`,
      { profileId, sourceId },
    );
  }

  written(sourceId: string, id: string, version: number): void {
    this.context.write(() => {
      const before = this.byId(id);
      this.context.sql.run(
        'note the Health Connect write',
        `insert into body_reading_writes (reading_id, source_id, version, written_at)
         values ($id, $sourceId, $version, $now)
         on conflict (reading_id, source_id) do update set version = excluded.version,
           written_at = excluded.written_at`,
        { id, sourceId, version, now: this.context.now() },
      );
      this.publish(id, before);
    });
  }

  private insert(measurement: ScaleMeasurement): string {
    const id = this.context.newId();
    const now = this.context.now();
    this.context.sql.run(
      'add the body reading',
      `insert into body_readings (id, device_id, measured_at, attribution, created_at, updated_at)
       values ($id, $deviceId, $measuredAt, 'pending', $now, $now)`,
      { id, deviceId: measurement.deviceId, measuredAt: moment(measurement.measuredAt), now },
    );
    return id;
  }

  private set(id: string, values: Readonly<Record<string, SQLInputValue>>): void {
    const set = assignments({ ...values, updated_at: this.context.now() });
    this.context.sql.run(
      'change the body reading',
      `update body_readings set ${set.text} where id = $id`,
      {
        ...set.parameters,
        id,
      },
    );
  }

  private publish(id: string, before: BodyReadingRow | undefined): BodyReadingRow {
    const after = this.byId(id);
    this.context.changed(
      'body_readings',
      before === undefined ? 'INSERT' : 'UPDATE',
      after,
      before ?? null,
    );
    return after;
  }
}
