import type { LogPayload } from '@smarteverything/logging';
import { z } from 'zod';
import type { Sql } from '../sql';
import { recomputeSleepFigures } from './sleep-asleep-minutes';

const SESSION = z.object({ record_id: z.string(), data: z.string() });

const STAGE = z.looseObject({ startTime: z.string(), endTime: z.string(), stage: z.number() });

const DATA = z.looseObject({ stages: z.array(STAGE) });

type Stage = z.infer<typeof STAGE>;

function distinctStages(stages: readonly Stage[]): Stage[] {
  const seen = new Set<string>();
  return stages.filter((stage) => {
    const key = JSON.stringify([stage.startTime, stage.endTime, stage.stage]);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

export function dedupeSleepStages(sql: Sql): LogPayload {
  const sessions = sql.all(
    SESSION,
    `select record_id, data from health_records
     where record_type = 'SleepSession' and json_type(data, '$.stages') = 'array'`,
  );
  let records = 0;
  let removed = 0;
  for (const session of sessions) {
    const data = DATA.parse(JSON.parse(session.data));
    const stages = distinctStages(data.stages);
    if (stages.length === data.stages.length) {
      continue;
    }
    records += 1;
    removed += data.stages.length - stages.length;
    sql.run(
      'remove the duplicate sleep stages',
      'update health_records set data = $data where record_id = $recordId',
      { recordId: session.record_id, data: JSON.stringify({ ...data, stages }) },
    );
  }
  return {
    sleepRecordsRepaired: records,
    duplicateStagesRemoved: removed,
    ...recomputeSleepFigures(sql),
  };
}
