import { dayLabel } from '../../../format/time';
import { useDayNow } from '../../../store/clock';
import { useSettings } from '../../../store/selectors';
import type { DayReading } from '../model/health-readings';

export function useDay(): (reading: DayReading) => string {
  const zone = useSettings().time_zone;
  const now = useDayNow(zone);
  return (reading) => dayLabel(`${reading.day}T12:00:00`, now, zone);
}
