import { Logger } from '@smarteverything/logging';
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

const log = new Logger('app.automations');
export type ScheduleSave =
  | { readonly kind: 'create'; readonly body: ScheduleInput }
  | { readonly kind: 'update'; readonly id: string; readonly body: ScheduleEditInput };

export async function saveScheduled(save: ScheduleSave): Promise<ScheduleRow> {
  const operation = log.operation('schedule.save', {
    kind: save.kind,
    scheduleId: save.kind === 'update' ? save.id : null,
  });
  try {
    const saved: ScheduleSaved =
      save.kind === 'create'
        ? await createSchedule(save.body)
        : await updateSchedule(save.id, save.body);
    operation.succeeded({ scheduleId: saved.schedule.id });
    return saved.schedule;
  } catch (error) {
    operation.failed(error);
    throw error;
  }
}

export function cancelScheduled(row: ScheduleRow): void {
  cancelSchedule(row.id).then(
    () => {
      log.info('schedule.cancelled', { scheduleId: row.id });
      notify({ message: `Cancelled: ${titleOf(row)}` });
    },
    (error: unknown) => {
      log.error('schedule.cancel_failed', error, { scheduleId: row.id });
      notify({ message: `${titleOf(row)} wasn’t cancelled`, error, tone: 'critical' });
    },
  );
}

export function runScheduledNow(row: ScheduleRow, step?: number): void {
  runSchedule(row.id, step).then(
    () => {
      log.info('schedule.run_started', { scheduleId: row.id, step: step ?? null });
      notify({ message: step === undefined ? `Running ${titleOf(row)}` : 'Running that step' });
    },
    (error: unknown) => {
      log.error('schedule.run_failed', error, { scheduleId: row.id, step: step ?? null });
      notify({ message: `${titleOf(row)} didn’t start`, error, tone: 'critical' });
    },
  );
}

export async function removeScheduled(row: ScheduleRow): Promise<boolean> {
  try {
    await removeSchedule(row.id);
    log.info('schedule.removed', { scheduleId: row.id });
    return true;
  } catch (error) {
    log.error('schedule.remove_failed', error, { scheduleId: row.id });
    notify({ message: `${titleOf(row)} wasn’t removed`, error, tone: 'critical' });
    return false;
  }
}
