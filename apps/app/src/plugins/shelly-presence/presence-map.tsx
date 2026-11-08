import { useMemo, useState } from 'react';
import {
  homeMapCameraVisibility,
  shellyAreaToHousePolygons,
  type HomeMapPolygonShape,
  type HomeMapStageView,
  type ShellyHousePose,
} from '@smarteverything/domain';
import {
  SHELLY_PRESENCE_GEN4_MODEL,
  type ShellyDevice,
  type ShellyTrack,
} from '@smarteverything/shelly';
import { cameraScene, overlayTracks } from '../../components/house-map/overlays/model';
import {
  TRACK_TRAIL_MS,
  type OverlayDeviceState,
  type OverlayRoomClimate,
  type OverlayTrack,
  type OverlayTrackDraw,
} from '../../components/house-map/overlays/model-types';
import {
  boundsOfPoints,
  type RenderBounds,
  type RenderFloor,
  type RenderPlacement,
  type RenderPoint,
  type RenderRoom,
} from '../../components/house-map/render-scene';
import { homeMapRenderScene } from '../../components/house-map/adapters/home-map-scene';
import type { StageContent } from '../../features/home-map/components/stage/stage';
import type { StageViewOption } from '../../features/home-map/components/stage/stage-chrome';
import { StageStillView } from '../../features/home-map/components/stage/stage-states';
import { useHomeMap } from '../../features/home-map/data/home-map-query';
import { mapHasContent } from '../../features/home/model/hero';
import { useDevices, useRooms } from '../../store/selectors';
import { SensorStageBody } from './presence-stage';

export interface SensorSpot {
  readonly floor: RenderFloor;
  readonly placement: RenderPlacement;
  readonly room: RenderRoom | null;
  readonly pose: ShellyHousePose;
}

export interface SensorZoneShape {
  readonly key: string;
  readonly main: boolean;
  readonly occupied: boolean;
  readonly polygons: readonly HomeMapPolygonShape[];
}

export interface SensorMapView {
  readonly spot: SensorSpot;
  readonly cone: readonly RenderPoint[];
  readonly zones: readonly SensorZoneShape[];
  readonly bounds: RenderBounds;
}

export interface TrackHistory {
  readonly at: string | null;
  readonly tracks: readonly OverlayTrack[];
}

export const NO_TRACK_HISTORY: TrackHistory = { at: null, tracks: [] };

const NO_DEVICES: ReadonlyMap<string, OverlayDeviceState> = new Map();

const NO_CLIMATE: ReadonlyMap<string, OverlayRoomClimate> = new Map();

const SENSOR_FOV = SHELLY_PRESENCE_GEN4_MODEL.fov;

export function sensorSpot(floors: readonly RenderFloor[], deviceId: string): SensorSpot | null {
  for (const floor of floors) {
    const placement = floor.placements.find((item) => item.deviceId === deviceId);
    if (placement !== undefined) {
      return {
        floor,
        placement,
        room: floor.rooms.find((room) => room.id === placement.roomId) ?? null,
        pose: { at: placement.at, yawDeg: placement.rotationDeg },
      };
    }
  }
  return null;
}

export function coverageCone(spot: SensorSpot): readonly RenderPoint[] {
  if (SENSOR_FOV === undefined) return [];
  return homeMapCameraVisibility({
    at: spot.placement.at,
    yawDeg: spot.placement.rotationDeg,
    hfovDeg: SENSOR_FOV.hDeg,
    rangeM: SENSOR_FOV.rangeM,
    heightM: spot.placement.height,
    ...cameraScene(spot.floor, NO_DEVICES),
  });
}

export function sensorZoneShapes(
  sensor: ShellyDevice,
  pose: ShellyHousePose,
): readonly SensorZoneShape[] {
  const shapes = sensor.zones.flatMap((zone) => {
    const area = zone.config.area ?? [];
    if (area.length === 0) return [];
    return [
      {
        key: zone.key,
        main: zone.main,
        occupied: zone.config.enable !== false && zone.status?.value === true,
        polygons: shellyAreaToHousePolygons(pose, area),
      },
    ];
  });
  return [...shapes.filter((shape) => shape.main), ...shapes.filter((shape) => !shape.main)];
}

export function focusBounds(spot: SensorSpot, cone: readonly RenderPoint[]): RenderBounds {
  const { at } = spot.placement;
  const around = spot.room === null ? cone : spot.room.polygons.flatMap((polygon) => polygon.outer);
  return boundsOfPoints([at, ...around]) ?? { minX: at.x, minY: at.y, maxX: at.x, maxY: at.y };
}

export function sensorMapView(
  floors: readonly RenderFloor[],
  sensor: ShellyDevice,
  deviceId: string,
): SensorMapView | null {
  const spot = sensorSpot(floors, deviceId);
  if (spot === null) return null;
  const cone = coverageCone(spot);
  return {
    spot,
    cone,
    zones: sensorZoneShapes(sensor, spot.pose),
    bounds: focusBounds(spot, cone),
  };
}

export function advanceTrackHistory(
  history: TrackHistory,
  frame: { readonly at: string | null; readonly tracks: readonly ShellyTrack[] },
  tracking: boolean,
): TrackHistory {
  if (!tracking) return NO_TRACK_HISTORY;
  if (frame.at === null || frame.at === history.at) return history;
  const now = Date.parse(frame.at);
  const before = new Map(history.tracks.map((track) => [track.id, track.points]));
  return {
    at: frame.at,
    tracks: frame.tracks.map((track) => {
      const id = String(track.id);
      const kept = (before.get(id) ?? []).filter((point) => now - point.at <= TRACK_TRAIL_MS);
      return { id, points: [...kept, { x: track.x, y: track.y, at: now }] };
    }),
  };
}

export function useSensorView(sensor: ShellyDevice, deviceId: string | null): SensorMapView | null {
  const { map } = useHomeMap();
  const shown = mapHasContent(map) ? map : null;
  const rooms = useRooms();
  const devices = useDevices({ includeHidden: true });
  const floors = useMemo(() => {
    if (shown === null) return [];
    return homeMapRenderScene({
      map: shown,
      live: {
        homeRoomName: (roomId) => rooms.find((room) => room.id === roomId)?.name ?? null,
        device: (id) => {
          const device = devices.find((item) => item.id === id);
          return device === undefined ? null : { name: device.label, kind: device.kind };
        },
      },
    }).floors;
  }, [shown, rooms, devices]);
  return useMemo(
    () => (deviceId === null ? null : sensorMapView(floors, sensor, deviceId)),
    [floors, sensor, deviceId],
  );
}

export function useTrackHistory(sensor: ShellyDevice, tracking: boolean): TrackHistory {
  const [history, setHistory] = useState<TrackHistory>(NO_TRACK_HISTORY);
  const next = advanceTrackHistory(
    history,
    { at: sensor.tracksAt, tracks: sensor.tracks },
    tracking,
  );
  if (next !== history) setHistory(next);
  return next;
}

export function sensorTrackDraws(
  spot: SensorSpot,
  history: TrackHistory,
  tracking: boolean,
): readonly OverlayTrackDraw[] {
  const deviceId = spot.placement.deviceId;
  return overlayTracks({
    floor: spot.floor,
    now: history.at === null ? 0 : Date.parse(history.at),
    devices: NO_DEVICES,
    climate: NO_CLIMATE,
    sensors: [{ deviceId, zones: [], tracks: history.tracks }],
    trackingLease: tracking,
    vacuum: null,
    selectedDeviceId: deviceId,
    showAllCameraViews: false,
    heatTint: false,
    animate: false,
  });
}

export function describeSensorMap(view: SensorMapView, name: string, people: number): string {
  const room = view.spot.room?.name ?? null;
  const where = room === null ? `${name} on the home map` : `${name} in ${room}`;
  const zones = view.zones.filter((zone) => !zone.main);
  const occupied = zones.filter((zone) => zone.occupied).length;
  const count = zones.length === 1 ? '1 zone' : `${String(zones.length)} zones`;
  const live = people === 1 ? '1 person tracked live' : `${String(people)} people tracked live`;
  return `${where}, coverage cone, ${count}, ${String(occupied)} occupied, ${live}`;
}

export type SensorView = '3d';

export const SENSOR_VIEWS: readonly StageViewOption<SensorView>[] = [
  { value: '3d', label: '3D', spoken: 'Show the map in 3D', icon: 'box' },
];

const NO_STILL_STATE = { unavailable: false } as const;

export interface StageInput {
  readonly view: SensorMapView;
  readonly stageId: string;
  readonly label: string;
  readonly dimmed: boolean;
  readonly shown: HomeMapStageView;
}

export function sensorStageContent({ stageId, ...input }: StageInput): StageContent {
  return {
    kind: 'live',
    id: stageId,
    still: (
      <StageStillView
        input={{ floor: input.view.spot.floor }}
        name={input.label}
        state={NO_STILL_STATE}
      />
    ),
    render: (context, live) => <SensorStageBody input={input} context={context} live={live} />,
  };
}
