import { dayLabel } from '../../../format/time';
import { useMinute } from '../../../store/clock';
import { useSettings } from '../../../store/selectors';
import type { DayReading } from '../model/health-readings';

export function useDay(): (reading: DayReading) => string {
  const now = useMinute();
  const zone = useSettings().time_zone;
  return (reading) => dayLabel(`${reading.day}T12:00:00`, now, zone);
}
