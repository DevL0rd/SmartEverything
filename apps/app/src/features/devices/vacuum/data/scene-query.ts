import { useMemo } from 'react';
import { keepPreviousData } from '@tanstack/react-query';
import {
  API_ENDPOINTS as E,
  type JsonValue,
  type VacuumSceneAnswer,
} from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { api } from '../../../../api/transport';
import { useScreenQuery } from '../../../../queries/use-screen-query';
import { useRooms } from '../../../../store/selectors';
import { shownSceneOf, type ShownScene } from '../model/room-names';
import { vacuumSceneKey } from './keys';
import type { VacuumMapVersion } from './map-feed';
import { linksKeyPart, useRoomLinksValue } from './room-links-value';

const NO_MAP = 'none';

export interface VacuumSceneState {
  readonly scene: ShownScene | null;
  readonly loading: boolean;
  readonly failure: Error | null;
  readonly catchingUp: boolean;
  readonly retry: () => void;
}

export function useVacuumScene(deviceId: string, map: VacuumMapVersion | null): VacuumSceneState {
  return useVacuumSceneOf(deviceId, map, useRoomLinksValue(deviceId));
}

export function useVacuumSceneOf(
  deviceId: string,
  map: VacuumMapVersion | null,
  linksValue: JsonValue | undefined,
): VacuumSceneState {
  const links = linksKeyPart(linksValue);
  const homeRooms = useRooms();
  const query = useScreenQuery({
    queryKey: vacuumSceneKey(deviceId, map?.slot ?? 'current', map?.version ?? NO_MAP, links),
    queryFn: (): Promise<VacuumSceneAnswer> =>
      api().call(E.getVacuumScene, {
        params: { deviceId },
        query: { slot: map?.slot ?? 'current' },
      }),
    enabled: map !== null,
    staleTime: Infinity,
    placeholderData: keepPreviousData,
  });
  const { refetch, data } = query;
  const scene = useMemo(
    () => (data === undefined ? null : shownSceneOf(data, homeRooms)),
    [data, homeRooms],
  );
  return {
    scene,
    loading: map !== null && query.isPending,
    failure: query.isError ? query.error : null,
    catchingUp: query.isPlaceholderData,
    retry: (): void => {
      background(refetch(), 'vacuum.scene_refetch_failed', { deviceId });
    },
  };
}
