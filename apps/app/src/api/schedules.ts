import {
  API_ENDPOINTS as E,
  type RequestBodyOf,
  type ScheduleRow,
  type ScheduleSaved,
} from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { api } from './transport';

const log = new Logger('app.schedules');

export type ScheduleInput = RequestBodyOf<'createSchedule'>;

export type ScheduleEditInput = RequestBodyOf<'updateSchedule'>;

export async function createSchedule(body: ScheduleInput): Promise<ScheduleSaved> {
  const saved = await api().call(E.createSchedule, { body });
  log.info('schedule.created', { outcome: saved.outcome });
  return saved;
}

export async function updateSchedule(
  scheduleId: string,
  body: ScheduleEditInput,
): Promise<ScheduleSaved> {
  const saved = await api().call(E.updateSchedule, { params: { scheduleId }, body });
  log.info('schedule.updated', { scheduleId, outcome: saved.outcome });
  return saved;
}

export async function cancelSchedule(scheduleId: string): Promise<ScheduleRow> {
  const row = await api().call(E.cancelSchedule, { params: { scheduleId } });
  log.info('schedule.cancelled', { scheduleId });
  return row;
}

export async function runSchedule(scheduleId: string, step?: number): Promise<ScheduleRow> {
  const row = await api().call(E.runSchedule, {
    params: { scheduleId },
    body: step === undefined ? {} : { step },
  });
  log.info('schedule.run', { scheduleId, step: step ?? null });
  return row;
}

export async function removeSchedule(scheduleId: string): Promise<void> {
  await api().call(E.removeSchedule, { params: { scheduleId } });
  log.info('schedule.removed', { scheduleId });
}
