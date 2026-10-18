import type { ScheduleRow } from '@smarteverything/domain';
import type { ScheduleSave } from './actions';
import { powerActions, powerVerbOf, stepsOf } from './steps';
import { upcomingOf } from './view';
import { timingOf, type When } from './when';

export const SLEEP_MINUTES: readonly number[] = [15, 30, 60, 90, 120];

export const SLEEP_LABEL = 'Sleep timer';

function isSleepTimer(row: ScheduleRow, deviceId: string): boolean {
  return (
    row.label === SLEEP_LABEL &&
    row.steps.length === 1 &&
    row.device_ids.length === 1 &&
    row.device_ids[0] === deviceId &&
    powerVerbOf(row.steps, deviceId) === 'Off'
  );
}

export function sleepTimerOf(rows: readonly ScheduleRow[], deviceId: string): ScheduleRow | null {
  return upcomingOf(rows).find((row) => isSleepTimer(row, deviceId)) ?? null;
}

export function sleepSave(deviceId: string, when: When, activeId: string | null): ScheduleSave {
  const timing = timingOf(when);
  return activeId === null
    ? {
        kind: 'create',
        body: {
          label: SLEEP_LABEL,
          timing,
          steps: stepsOf(powerActions(deviceId, false)),
        },
      }
    : { kind: 'update', id: activeId, body: { timing } };
}
