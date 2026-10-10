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
import { confirm } from '../../../components/confirm-store';
import { notify } from '../../../components/toast-store';
import { titleOf } from './view';

export type ScheduleSave =
  | { readonly kind: 'create'; readonly body: Omit<ScheduleInput, 'confirm'> }
  | {
      readonly kind: 'update';
      readonly id: string;
      readonly body: Omit<ScheduleEditInput, 'confirm'>;
    };

function send(save: ScheduleSave, confirmed: boolean): Promise<ScheduleSaved> {
  return save.kind === 'create'
    ? createSchedule({ ...save.body, confirm: confirmed })
    : updateSchedule(save.id, { ...save.body, confirm: confirmed });
}

export async function saveScheduled(save: ScheduleSave): Promise<ScheduleRow | null> {
  const first = await send(save, false);
  if (first.outcome === 'scheduled') {
    return first.schedule;
  }
  const accepted = await confirm({
    title: 'Confirm these steps',
    body: first.steps.map((step) => step.line).join('\n'),
    confirmLabel: 'Schedule them',
  });
  if (!accepted) {
    return null;
  }
  const second = await send(save, true);
  return second.outcome === 'scheduled' ? second.schedule : null;
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
