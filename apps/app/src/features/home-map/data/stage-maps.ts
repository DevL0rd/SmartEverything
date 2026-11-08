import { useMemo } from 'react';
import type { HomeMapSummary } from '@smarteverything/domain';
import type { StageMaps } from '../components/stage/map-switcher';
import { useMapChoice, type HomeMapPage } from '../model/map-choice';
import { useHomeMap, type HomeMapState } from './home-map-query';
import { useHomeMapSet } from './map-set-query';

export function stageMapsOf(
  maps: readonly HomeMapSummary[] | null,
  currentId: string | null,
  onChange: (mapId: string) => void,
): StageMaps | undefined {
  if (maps === null || currentId === null) return undefined;
  return {
    options: maps.map((map) => ({ id: map.id, label: map.name })),
    value: currentId,
    onChange,
  };
}

export function useStageMaps(page: HomeMapPage, currentId: string | null): StageMaps | undefined {
  const { maps } = useHomeMapSet();
  const { choose } = useMapChoice(page, maps);
  return useMemo(() => stageMapsOf(maps, currentId, choose), [maps, currentId, choose]);
}

export interface ChosenHomeMap extends HomeMapState {
  readonly maps: StageMaps | undefined;
}

export function chosenQueryId(map: HomeMapSummary | null): HomeMapSummary['id'] | undefined {
  return map === null || map.isDefault ? undefined : map.id;
}

export function useChosenHomeMap(page: HomeMapPage): ChosenHomeMap {
  const set = useHomeMapSet();
  const choice = useMapChoice(page, set.maps);
  const state = useHomeMap(chosenQueryId(choice.map));
  const currentId = state.map?.id ?? null;
  const maps = useMemo(
    () => stageMapsOf(set.maps, currentId, choice.choose),
    [set.maps, currentId, choice.choose],
  );
  return { ...state, maps };
}
