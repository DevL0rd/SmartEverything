import { moment } from '../../../format/time';
import { useDayNow } from '../../../store/clock';
import { useStoreSelector } from '../../../store/store-context';

export function useMoment(): (at: string) => string {
  const zone = useStoreSelector((state) => state.settings?.time_zone ?? null);
  const now = useDayNow(zone);
  return (at) => moment(at, now, zone);
}
