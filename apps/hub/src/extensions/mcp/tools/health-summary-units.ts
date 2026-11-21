import {
  HEALTH_METRICS,
  localDayOf,
  type HealthRecord,
  type HealthRecordType,
  type ProfileRow,
} from '@smarteverything/domain';
import { DAY_MS } from '../../../metrics/minute';
import { profileIdOf, roleOfCaller, type Caller } from '../../../server/auth';
import { storeUnit } from '../../../store/host/unit';
import type { Store } from '../../../store/store';
import type { HealthRange } from './health-summary';

const RECORDS_PER_PERSON = 300;

const RECORD_TYPES = [
  'Nutrition',
  'Hydration',
  'BloodPressure',
  'BloodGlucose',
  'BodyTemperature',
  'BasalBodyTemperature',
  'BodyFat',
  'LeanBodyMass',
  'BoneMass',
  'BodyWaterMass',
  'BasalMetabolicRate',
  'Height',
  'MindfulnessSession',
  'MenstruationFlow',
  'MenstruationPeriod',
  'OvulationTest',
  'CervicalMucus',
  'IntermenstrualBleeding',
  'SexualActivity',
] as const satisfies readonly HealthRecordType[];

export interface HealthSummaryAsk {
  readonly caller: Caller;
  readonly input: HealthRange;
  readonly onlyProfileId: string | null;
}

function inRange(record: HealthRecord, range: HealthRange): boolean {
  const day = localDayOf(record);
  return day >= range.from && day <= range.to;
}

function recordsOf(store: Store, profileId: string, range: HealthRange): Record<string, unknown>[] {
  const window = {
    types: RECORD_TYPES,
    from: new Date(Date.parse(range.from) - DAY_MS).toISOString(),
    to: new Date(Date.parse(range.to) + 2 * DAY_MS).toISOString(),
  };
  return store.health
    .records(window, profileId)
    .filter((record) => inRange(record, range))
    .slice(-RECORDS_PER_PERSON)
    .map((record) => ({
      type: record.type,
      day: localDayOf(record),
      start: record.startTime,
      end: record.endTime,
      source: record.sourceApp,
      data: record.data,
    }));
}

function readableProfiles(store: Store, caller: Caller): readonly ProfileRow[] {
  return roleOfCaller(caller) === 'owner'
    ? store.profiles.list()
    : [store.profiles.byId(profileIdOf(caller))];
}

function healthSummary(
  store: Store,
  { caller, input, onlyProfileId }: HealthSummaryAsk,
): Record<string, unknown> {
  return {
    people: readableProfiles(store, caller)
      .filter((profile) => onlyProfileId === null || profile.id === onlyProfileId)
      .map((profile) => ({
        person: profile.name,
        days: store.health
          .dailyRange(profile.id, input.from, input.to, input.metrics ?? HEALTH_METRICS)
          .map((row) => ({ day: row.day, metric: row.metric, value: row.value, unit: row.unit })),
        ...(input.records ? { records: recordsOf(store, profile.id, input) } : {}),
      })),
  };
}

export const MCP_HEALTH_SUMMARY_UNIT = storeUnit(healthSummary);
