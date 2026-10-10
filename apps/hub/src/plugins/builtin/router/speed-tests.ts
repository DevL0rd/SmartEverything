import { SPEED_TEST_RESULT, type SpeedTestResult } from '@smarteverything/domain';
import type { PluginRecords } from '../contract';

const SPEED_TESTS_KEPT = 20;

export function listSpeedTests(records: PluginRecords): SpeedTestResult[] {
  return records
    .list()
    .flatMap(({ value }) => {
      const parsed = SPEED_TEST_RESULT.safeParse(value);
      return parsed.success ? [parsed.data] : [];
    })
    .sort((left, right) => right.at.localeCompare(left.at));
}

export function saveSpeedTest(records: PluginRecords, result: SpeedTestResult): void {
  records.put(result.id, { ...result });
  for (const old of listSpeedTests(records).slice(SPEED_TESTS_KEPT)) {
    records.remove(old.id);
  }
}
