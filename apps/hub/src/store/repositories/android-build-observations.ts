import {
  ANDROID_APP_BUILD_REPORT,
  APP_UPDATE_RECORDED_OUTCOME,
  type AndroidAppBuildReport,
  type AndroidAppObservation,
  type AppUpdateRecordedOutcome,
} from '@smarteverything/domain';
import { z } from 'zod';
import type { StoreContext } from '../context';
import { SQL_JSON, jsonText } from '../sql';

const STORED = z.strictObject({
  build: SQL_JSON.pipe(ANDROID_APP_BUILD_REPORT),
  observedAt: z.string(),
  outcome: SQL_JSON.pipe(APP_UPDATE_RECORDED_OUTCOME).nullable(),
});

export class AndroidBuildObservationsRepository {
  constructor(private readonly context: StoreContext) {}

  read(clientId: string): AndroidAppObservation | null {
    const row = this.context.sql.get(
      STORED,
      'select build, observed_at as observedAt, outcome from android_build_observations where client_id = $clientId',
      { clientId },
    );
    return row === undefined
      ? null
      : { ...row.build, observedAt: row.observedAt, lastOutcome: row.outcome };
  }

  save(clientId: string, build: AndroidAppBuildReport, observedAt: string): void {
    this.context.sql.run(
      'save the observed Android build',
      `insert into android_build_observations (client_id, build, observed_at)
       values ($clientId, $build, $observedAt)
       on conflict (client_id) do update set build = excluded.build, observed_at = excluded.observed_at`,
      { clientId, build: jsonText(build), observedAt },
    );
  }

  saveOutcome(clientId: string, outcome: AppUpdateRecordedOutcome): boolean {
    return (
      this.context.sql.run(
        'save the latest Android update outcome',
        'update android_build_observations set outcome = $outcome where client_id = $clientId',
        { clientId, outcome: jsonText(outcome) },
      ) > 0
    );
  }
}
