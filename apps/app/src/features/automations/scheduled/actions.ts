import type { ScheduleRow, ScheduleSaved } from '@smarteverything/domain';
import {
  cancelSchedule,
  createSchedule,
  removeSchedule,
  runSchedule,
  updateSchedule,
  type ScheduleEditInput,
  type ScheduleInput,
} from '../../../api/schedules';
import { notify } from '../../../components/toast-store';
import { titleOf } from './view';

export type ScheduleSave =
  | { readonly kind: 'create'; readonly body: ScheduleInput }
  | { readonly kind: 'update'; readonly id: string; readonly body: ScheduleEditInput };

export async function saveScheduled(save: ScheduleSave): Promise<ScheduleRow> {
  const saved: ScheduleSaved =
    save.kind === 'create'
      ? await createSchedule(save.body)
      : await updateSchedule(save.id, save.body);
  return saved.schedule;
}

export function cancelScheduled(row: ScheduleRow): void {
  cancelSchedule(row.id).then(
    () => {
      notify({ message: `Cancelled: ${titleOf(row)}` });
    },
    (error: unknown) => {
      notify({ message: `${titleOf(row)} wasn’t cancelled`, error, tone: 'critical' });
    },
  );
}

export function runScheduledNow(row: ScheduleRow, step?: number): void {
  runSchedule(row.id, step).then(
    () => {
      notify({ message: step === undefined ? `Running ${titleOf(row)}` : 'Running that step' });
    },
    (error: unknown) => {
      notify({ message: `${titleOf(row)} didn’t start`, error, tone: 'critical' });
    },
  );
}

export async function removeScheduled(row: ScheduleRow): Promise<boolean> {
  try {
    await removeSchedule(row.id);
    return true;
  } catch (error) {
    notify({ message: `${titleOf(row)} wasn’t removed`, error, tone: 'critical' });
    return false;
  }
}
