import type { LogPayload } from '@smarteverything/logging';
import type { Sql } from '../sql';
import type { Migration } from './migration';

export const SCALE_NO_WEIGHT_KG = 204.7;

function clearNoWeight(sql: Sql): LogPayload {
  const cleared = sql.run(
    'clear the no-weight marker stored as a weigh-in',
    `update body_readings set weight_kg = null, bmi = null, composition = null
     where weight_kg = $marker and attribution in ('pending', 'ignored')`,
    { marker: SCALE_NO_WEIGHT_KG },
  );
  return { cleared };
}

export const SCALE_NO_WEIGHT_MIGRATION: Migration = {
  version: 186,
  name: 'scale-no-weight',
  statements: [],
  backfill: clearNoWeight,
};
