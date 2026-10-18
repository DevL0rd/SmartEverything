import type { ScheduleRow } from '@smarteverything/domain';
import { useRow, useRows, useSettings } from '../../../store/selectors';
import { rowsOf } from '../../../store/state';
import { useStoreSelector } from '../../../store/store-context';
import { forDevice } from './view';

export function useScheduledRows(): readonly ScheduleRow[] {
  return useRows('scheduled_actions');
}

export function useDeviceSchedule(deviceId: string): ScheduleRow | null {
  return useStoreSelector(
    (state) => forDevice(rowsOf(state.tables.scheduled_actions), deviceId)[0] ?? null,
    Object.is,
    [deviceId],
  );
}

export function useScheduleRow(scheduleId: string): ScheduleRow | null {
  return useRow('scheduled_actions', scheduleId);
}

export function useHomeZone(): string {
  return useSettings().time_zone;
}
