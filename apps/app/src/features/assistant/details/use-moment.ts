import { moment } from '../../../format/time';
import { useMinute } from '../../../store/clock';
import { useStoreSelector } from '../../../store/store-context';

export function useMoment(): (at: string) => string {
  const now = useMinute();
  const zone = useStoreSelector((state) => state.settings?.time_zone ?? null);
  return (at) => moment(at, now, zone);
}
