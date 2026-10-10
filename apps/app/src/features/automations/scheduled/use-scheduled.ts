import type { ScheduleRow } from '@smarteverything/domain';
import { useRow, useRows, useSettings } from '../../../store/selectors';
import { forDevice } from './view';

export function useScheduledRows(): readonly ScheduleRow[] {
  return useRows('scheduled_actions');
}

export function useDeviceSchedule(deviceId: string): ScheduleRow | null {
  return forDevice(useScheduledRows(), deviceId)[0] ?? null;
}

export function useScheduleRow(scheduleId: string): ScheduleRow | null {
  return useRow('scheduled_actions', scheduleId);
}

export function useHomeZone(): string {
  return useSettings().time_zone;
}
