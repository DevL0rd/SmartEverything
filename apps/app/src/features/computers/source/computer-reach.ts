import type { FileAbility } from '@smarteverything/domain';
import { useComputerDetail } from '../data/computer-metrics';
import { useComputerReach } from '../data/computer-scopes';
import type { FilePlace } from '../../files';
import { usePlacesData } from './computer-files-data';
import { placesOfData } from './computer-places';

export interface Reach {
  readonly online: boolean;
  readonly scope: boolean | null;
  readonly granted: readonly FileAbility[];
  readonly places: readonly FilePlace[];
  readonly ready: boolean;
}

export function useReach(deviceId: string): Reach {
  const { online } = useComputerReach(deviceId);
  const scope = useComputerDetail(deviceId, online).data?.scopes.files ?? null;
  const data = usePlacesData(deviceId, online && scope !== false).data;
  return {
    online,
    scope,
    granted: data?.abilities ?? [],
    places: scope === false ? [] : placesOfData(data),
    ready: data !== undefined,
  };
}
