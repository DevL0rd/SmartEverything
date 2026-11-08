import { useMemo, type ReactNode } from 'react';
import type { ShellyArea, ShellyDevice } from '@smarteverything/shelly';
import type { EditEvent, EditOverlay } from '../../components/house-map/3d/map-3d-edit-protocol';
import type { StageLiveProps } from '../../components/house-map/live-visibility/stage-host';
import { HomeMap3d, type HomeMapLive, type StageContext } from '../../features/home-map';
import type {
  EditFloorFeed,
  EditSettled,
} from '../../features/home-map/components/stage/home-map-3d';
import { useHeroLook } from '../../features/home/components/hero-live';
import type { SensorMapView } from './presence-map';
import { SensorStill, sensorSelection, useSensorFeed, type SensorScene } from './presence-stage';

export interface MapZoneProps {
  readonly view: SensorMapView;
  readonly sensor: ShellyDevice;
  readonly area: ShellyArea;
  readonly change: (area: ShellyArea) => void;
  readonly allowed: ShellyArea | undefined;
  readonly context: ShellyArea;
  readonly roomArea: boolean;
}

export interface ZoneEdit {
  readonly overlay: EditOverlay;
  readonly committed: number | null;
  readonly settled: EditSettled | null;
  readonly onEvent: (event: EditEvent) => void;
  readonly onUnavailable: () => void;
}

export function withoutZones(feed: HomeMapLive): HomeMapLive {
  return { ...feed, overlay: { ...feed.overlay, zones: [] } };
}

export function zoneEditFloor(scene: SensorScene, committed: number | null): EditFloorFeed | null {
  const floor = scene.map.floors.find((item) => item.id === scene.floor.id);
  if (floor === undefined) return null;
  return {
    key: `${floor.id}:${String(scene.map.revision)}:${String(committed)}`,
    wire: { floor, boxes: {} },
    committed,
  };
}

interface ZoneSceneProps {
  readonly view: SensorMapView;
  readonly scene: SensorScene;
  readonly edit: ZoneEdit;
  readonly label: string;
  readonly context: StageContext;
  readonly live: StageLiveProps;
}

export function ZoneScene({ view, scene, edit, label, context, live }: ZoneSceneProps): ReactNode {
  const { look } = useHeroLook();
  const shared = useSensorFeed(view, scene, look, live.active);
  const feed = useMemo(() => withoutZones(shared), [shared]);
  const floor = useMemo(() => zoneEditFloor(scene, edit.committed), [scene, edit.committed]);
  return (
    <HomeMap3d
      {...{ scene: scene.scene, floor: scene.floor, view3d: context.view3d }}
      {...{ chrome: context.chrome, insets: context.chromeInsets, label, look, live, feed }}
      selection={sensorSelection(view)}
      selectedItem={null}
      realistic={null}
      fallback={<SensorStill floor={scene.floor} name={label} unavailable live={live} />}
      onPickRoom={(): void => undefined}
      onPickDevice={(): void => undefined}
      edit={{
        floor,
        overlay: edit.overlay,
        settled: edit.settled,
        onEvent: edit.onEvent,
        onUnavailable: edit.onUnavailable,
      }}
    />
  );
}
