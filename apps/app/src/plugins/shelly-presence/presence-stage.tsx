import { useMemo, type ReactNode } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import type {
  HomeMap,
  HomeMapCameraDirection,
  HomeMapLookPref,
  HomeMapStageView,
} from '@smarteverything/domain';
import type { StageLiveProps } from '../../components/house-map/live-visibility/stage-host';
import type { OverlayCameraDraw } from '../../components/house-map/overlays/model-types';
import type { RenderFloor, RenderScene } from '../../components/house-map/render-scene';
import { cn } from '../../design/cn';
import {
  HomeMap3d,
  homeMapRealistic,
  StageStillView,
  type HomeMap3dProps,
  type HomeMapLive,
  type StageContext,
  useHomeMap,
  useHomeMapLive,
  useHomeMapScene,
} from '../../features/home-map';
import { useHeroLook } from '../../features/home/components/hero-live';
import { heroPickTarget, heroTapTarget } from '../../features/home/model/hero';
import type { SensorMapView } from './presence-map';

export const SHELLY_STAGE_PAGE = 'shelly';

const UNAVAILABLE_STATE = { unavailable: true } as const;

const STILL_STATE = { unavailable: false } as const;

export interface SensorScene {
  readonly map: HomeMap;
  readonly scene: RenderScene;
  readonly floor: RenderFloor;
}

export interface SensorStageInput {
  readonly view: SensorMapView;
  readonly label: string;
  readonly dimmed: boolean;
  readonly shown: HomeMapStageView;
}

export function useSensorScene(view: SensorMapView): SensorScene | null {
  const { map } = useHomeMap();
  const scene = useHomeMapScene(map);
  const floorId = view.spot.floor.id;
  return useMemo(() => {
    const floor = scene?.floors.find((item) => item.id === floorId);
    return map === null || scene === null || floor === undefined ? null : { map, scene, floor };
  }, [map, scene, floorId]);
}

export function sensorFan(view: SensorMapView): OverlayCameraDraw | null {
  const { placement } = view.spot;
  if (view.cone.length < 3) return null;
  const direction: HomeMapCameraDirection = {
    yawDeg: placement.rotationDeg,
    tiltDeg: 0,
    known: true,
  };
  return {
    deviceId: placement.deviceId,
    faint: false,
    dashed: false,
    note: null,
    view: {
      direction,
      polygon: view.cone,
      dashed: false,
      frustum: {
        apex: { x: placement.at.x, y: placement.at.y, z: placement.height },
        direction,
        ring: view.cone,
        floorM: 0,
        topM: 0,
      },
    },
  };
}

export function withSensorFan(feed: HomeMapLive, fan: OverlayCameraDraw | null): HomeMapLive {
  if (fan === null) return feed;
  const cameras = feed.overlay.cameras.filter((camera) => camera.deviceId !== fan.deviceId);
  return { ...feed, overlay: { ...feed.overlay, cameras: [...cameras, fan] } };
}

export function useSensorFeed(
  view: SensorMapView,
  scene: SensorScene,
  look: HomeMapLookPref,
  active: boolean,
): HomeMapLive {
  const request = useMemo(
    () => ({ mapName: scene.map.name, animate: active }),
    [scene.map.name, active],
  );
  const feed = useHomeMapLive(scene.map, scene.floor, look, request);
  const fan = useMemo(() => sensorFan(view), [view]);
  return useMemo(() => withSensorFan(feed, fan), [feed, fan]);
}

export function sensorSelection(view: SensorMapView): readonly string[] {
  return view.spot.room === null ? [] : [view.spot.room.id];
}

interface StillProps {
  readonly floor: RenderFloor;
  readonly name: string;
  readonly unavailable: boolean;
  readonly live: StageLiveProps;
}

export function SensorStill({ floor, name, unavailable, live }: StillProps): ReactNode {
  return (
    <View className="absolute inset-0" onLayout={live.onReady}>
      <StageStillView
        input={{ floor }}
        name={name}
        state={unavailable ? UNAVAILABLE_STATE : STILL_STATE}
      />
    </View>
  );
}

interface ThreeProps {
  readonly input: SensorStageInput;
  readonly scene: SensorScene;
  readonly context: StageContext;
  readonly live: StageLiveProps;
}

function SensorThreeBody({ input, scene, context, live }: ThreeProps): ReactNode {
  const router = useRouter();
  const { look } = useHeroLook();
  const feed = useSensorFeed(input.view, scene, look, live.active);
  const map3d: HomeMap3dProps = {
    scene: scene.scene,
    floor: scene.floor,
    view3d: context.view3d,
    chrome: context.chrome,
    insets: context.chromeInsets,
    label: input.label,
    selection: sensorSelection(input.view),
    selectedItem: null,
    look,
    live,
    feed,
    fallback: <SensorStill floor={scene.floor} name={input.label} unavailable live={live} />,
    realistic: null,
    onPickRoom: (roomId): void => {
      const target = heroPickTarget(scene.floor, roomId);
      if (target !== null) router.push(target);
    },
    onPickDevice: (deviceId): void => {
      const target = heroTapTarget(scene.floor, { kind: 'device', id: deviceId });
      if (target !== null) router.push(target);
    },
  };
  return input.shown === 'realistic' ? (
    homeMapRealistic({ map: scene.map, map3d })
  ) : (
    <HomeMap3d {...map3d} />
  );
}

export function SensorStageBody({
  input,
  context,
  live,
}: {
  readonly input: SensorStageInput;
  readonly context: StageContext;
  readonly live: StageLiveProps;
}): ReactNode {
  const scene = useSensorScene(input.view);
  return (
    <View className={cn('absolute inset-0', input.dimmed && 'opacity-60')}>
      {scene === null ? (
        <SensorStill
          floor={input.view.spot.floor}
          name={input.label}
          unavailable={false}
          live={live}
        />
      ) : (
        <SensorThreeBody input={input} scene={scene} context={context} live={live} />
      )}
    </View>
  );
}
