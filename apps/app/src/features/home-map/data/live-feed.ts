import { useMemo } from 'react';
import type { HomeMapLookPref, ModelSpec } from '@smarteverything/domain';
import type { SceneModelsWire } from '../../../components/house-map/3d/render-core-objects';
import type { RenderFloor, RenderPlacement } from '../../../components/house-map/render-scene';
import { sameJson } from '../../../store/same-json';
import { deviceValuesOf, type StoreState } from '../../../store/state';
import { useStoreSelector } from '../../../store/store-context';
import { comfortSelector } from '../../climate';
import { deviceModelOf } from '../../devices';
import { useSceneModels } from '../../models';
import {
  buildHomeMapLive,
  liveFactsOf,
  type HomeMapLive,
  type HomeMapLiveOptions,
  type LiveFacts,
  type LiveSource,
} from './live-feed-inputs';
import { usePresenceFeed } from './live-presence';
import { useVacuumFeed, type SourcedMap } from './live-vacuum';

export type { HomeMapLive } from './live-feed-inputs';

export type HomeMapLiveRequest = Pick<
  HomeMapLiveOptions,
  'mapName' | 'selectedDeviceId' | 'animate'
>;

const CLIMATE_METRICS = ['temperature', 'pm25'] as const;

function sourcesOf(state: StoreState, deviceIds: readonly string[]): readonly LiveSource[] {
  return deviceIds.flatMap((id) => {
    const device = state.tables.devices.byId[id];
    return device === undefined
      ? []
      : [{ model: deviceModelOf(device), values: deviceValuesOf(state, id) }];
  });
}

function factsSelector(
  deviceIds: readonly string[],
  homeRoomIds: readonly string[],
): (state: StoreState) => LiveFacts {
  const readers = homeRoomIds.map(
    (roomId) => [roomId, comfortSelector(CLIMATE_METRICS, roomId)] as const,
  );
  return (state) =>
    liveFactsOf(
      sourcesOf(state, deviceIds),
      Object.fromEntries(readers.map(([roomId, read]) => [roomId, read(state)])),
    );
}

export function deviceSpecsOf(
  wire: SceneModelsWire,
): (placement: RenderPlacement) => ModelSpec | undefined {
  const specs = new Map(wire.specs.map((spec) => [spec.id, spec]));
  return (placement) => {
    const modelId = wire.devices[placement.deviceId];
    return modelId === undefined ? undefined : specs.get(modelId);
  };
}

function useFeedOptions(
  map: SourcedMap,
  floor: RenderFloor,
  deviceIds: readonly string[],
  request: HomeMapLiveRequest,
): HomeMapLiveOptions {
  const presence = usePresenceFeed(deviceIds);
  const vacuum = useVacuumFeed(map, floor.id);
  const models = useSceneModels(floor);
  return useMemo(
    () => ({ ...request, presence, vacuum, specOf: deviceSpecsOf(models) }),
    [request, presence, vacuum, models],
  );
}

export function useHomeMapLive(
  map: SourcedMap,
  floor: RenderFloor,
  look: HomeMapLookPref,
  request: HomeMapLiveRequest,
): HomeMapLive {
  const deviceIds = useMemo(
    () => floor.placements.map((placement) => placement.deviceId),
    [floor.placements],
  );
  const homeRoomIds = useMemo(
    () => floor.rooms.flatMap((room) => (room.homeRoomId === null ? [] : [room.homeRoomId])),
    [floor.rooms],
  );
  const select = useMemo(() => factsSelector(deviceIds, homeRoomIds), [deviceIds, homeRoomIds]);
  const facts = useStoreSelector(select, sameJson, [select]);
  const options = useFeedOptions(map, floor, deviceIds, request);
  return useMemo(
    () => buildHomeMapLive(floor, look, facts, options),
    [floor, look, facts, options],
  );
}
