import type { PlannerAlarmRow } from '@smarteverything/domain';
import { notify } from '../../../components/toast-store';
import type { PlannerPerson } from './person';
import { keyedQueues, useQueuedSaves, type QueuedSaves } from './save-queue';
import { plannerWrites, type AlarmChange } from './writes';

export class AlarmGoneError extends Error {
  override readonly name = 'AlarmGoneError';

  constructor(readonly alarmId: string) {
    super('That alarm was deleted before the change was saved.');
  }
}

export const alarmQueueOf = keyedQueues<AlarmChange>((store, person, alarmId) => {
  const writes = plannerWrites(store, person);
  return {
    event: 'planner_alarm.save',
    send: (change): Promise<PlannerAlarmRow> => {
      const row = store.get().tables.planner_alarms.byId[alarmId];
      if (row === undefined) return Promise.reject(new AlarmGoneError(alarmId));
      return writes.updateAlarm(row, change);
    },
    failed: (error): void => {
      notify({ message: 'Couldn’t change that alarm', error, tone: 'critical' });
    },
  };
});

export type AlarmSaves = QueuedSaves<AlarmChange>;

export function useAlarmSaves(person: PlannerPerson, alarmId: string | null): AlarmSaves {
  return useQueuedSaves(alarmQueueOf, person, alarmId);
}

export interface ShownAlarm {
  readonly alarm: PlannerAlarmRow;
  readonly save: (change: AlarmChange) => void;
}

export function useShownAlarm(person: PlannerPerson, row: PlannerAlarmRow): ShownAlarm {
  const { unsaved, save } = useAlarmSaves(person, row.id);
  return { alarm: unsaved === null ? row : { ...row, ...unsaved }, save };
}
