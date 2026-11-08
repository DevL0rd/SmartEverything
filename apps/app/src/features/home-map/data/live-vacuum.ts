import { useMemo } from 'react';
import type { HomeMap, HomeMapSource } from '@smarteverything/domain';
import type { OverlayVacuumInput } from '../../../components/house-map/overlays/model-types';
import type { StoreState } from '../../../store/state';
import { useStoreSelector } from '../../../store/store-context';
import { unifiedTransform, useVacuumMapPose, type VacuumMapPose } from '../../devices';

export type SourcedMap = Pick<HomeMap, 'sources'>;

export function vacuumSourceOf(
  state: StoreState,
  map: SourcedMap,
  floorId: string,
): HomeMapSource | null {
  return (
    map.sources.find(
      (source) =>
        source.floorId === floorId && state.tables.devices.byId[source.deviceId]?.kind === 'vacuum',
    ) ?? null
  );
}

export function vacuumOverlayOf(
  source: HomeMapSource | null,
  pose: VacuumMapPose | null,
): OverlayVacuumInput | null {
  if (source === null || pose === null) return null;
  return {
    transform: unifiedTransform(source),
    working: pose.working,
    robot: pose.robot,
    dock: null,
    trail: pose.trail,
  };
}

export function useVacuumFeed(map: SourcedMap, floorId: string): OverlayVacuumInput | null {
  const source = useStoreSelector((state) => vacuumSourceOf(state, map, floorId), Object.is, [
    map,
    floorId,
  ]);
  const pose = useVacuumMapPose(source?.deviceId ?? null);
  return useMemo(() => vacuumOverlayOf(source, pose), [source, pose]);
}
