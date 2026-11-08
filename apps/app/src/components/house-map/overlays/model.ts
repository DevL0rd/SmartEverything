import {
  HOME_MAP_FLOOR_ID,
  homeMapCameraView,
  homeMapDistance,
  homeMapModelReportsAngle,
  homeMapOpeningSeeThrough,
  shellyAreaToHousePolygons,
  shellySensorToHouse,
  type HomeMapCameraScene,
  type HomeMapPlacement,
  type HomeMapPtzState,
  type ShellyHousePose,
} from '@smarteverything/domain';
import type {
  RenderFloor,
  RenderOpening,
  RenderPlacement,
  RenderPoint,
  RenderPose,
  RenderWall,
} from '../render-scene';
import {
  TRACK_TRAIL_MS,
  OPENING_OPEN_LEAF_DEG,
  HEAT_TINT_RANGE_C,
  CAMERA_DIRECTION_UNKNOWN_TEXT,
  type OverlayDeviceState,
  type OverlayReading,
  type OverlayTrack,
  type OverlayTransform,
  type OverlayVacuumInput,
  type OverlayInput,
  type OverlayZoneFill,
  type OverlayTrackDraw,
  type OverlayClimateChip,
  type OverlayOpeningDraw,
  type OverlayVacuumDraw,
  type OverlayCameraDraw,
  type OverlayAlertDraw,
  type OverlayBadge,
  type OverlayModel,
} from './model-types';
const RAD = Math.PI / 180;

const NO_PTZ: HomeMapPtzState = { preset: null, live: null, moveUncertain: false };

const poseOf = (placement: RenderPlacement): ShellyHousePose => ({
  at: placement.at,
  yawDeg: placement.rotationDeg,
});

const placementsById = (floor: RenderFloor): ReadonlyMap<string, RenderPlacement> =>
  new Map(floor.placements.map((placement) => [placement.deviceId, placement]));

export function overlayZones(input: OverlayInput): readonly OverlayZoneFill[] {
  const placed = placementsById(input.floor);
  return input.sensors.flatMap((sensor) => {
    const placement = placed.get(sensor.deviceId);
    if (placement === undefined) return [];
    return sensor.zones.map((zone) => ({
      id: zone.id,
      deviceId: sensor.deviceId,
      occupied: zone.occupied,
      polygons: shellyAreaToHousePolygons(poseOf(placement), zone.area),
    }));
  });
}

const sensing = (state: OverlayDeviceState | undefined): boolean =>
  state !== undefined && state.online && (state.occupied === true || state.motion === true);

export function overlayActiveRooms(input: OverlayInput): readonly string[] {
  const rooms = input.floor.placements.flatMap((placement) =>
    placement.roomId !== null && sensing(input.devices.get(placement.deviceId))
      ? [placement.roomId]
      : [],
  );
  return [...new Set(rooms)];
}

const motionDevices = (input: OverlayInput): readonly string[] =>
  input.floor.placements
    .filter((placement) => input.devices.get(placement.deviceId)?.motion === true)
    .map((placement) => placement.deviceId);

function trackDraw(
  deviceId: string,
  pose: ShellyHousePose,
  track: OverlayTrack,
  now: number,
): OverlayTrackDraw | null {
  const latest = track.points.at(-1);
  if (latest === undefined) return null;
  const head = shellySensorToHouse(pose, latest);
  const trail = track.points.flatMap((point) => {
    const age = now - point.at;
    if (age < 0 || age > TRACK_TRAIL_MS) return [];
    return [{ ...shellySensorToHouse(pose, point), opacity: 1 - age / TRACK_TRAIL_MS }];
  });
  return { deviceId, id: track.id, head, trail, ringM: homeMapDistance(pose.at, head) };
}

export function overlayTracks(input: OverlayInput): readonly OverlayTrackDraw[] {
  if (!input.trackingLease) return [];
  const placed = placementsById(input.floor);
  return input.sensors.flatMap((sensor) => {
    const placement = placed.get(sensor.deviceId);
    if (placement === undefined) return [];
    return sensor.tracks.flatMap(
      (track) => trackDraw(sensor.deviceId, poseOf(placement), track, input.now) ?? [],
    );
  });
}

const fresh = (reading: OverlayReading | null): OverlayReading | null =>
  reading === null || reading.stale ? null : reading;

const celsius = (reading: OverlayReading): number =>
  reading.unit?.toUpperCase().endsWith('F') === true
    ? ((reading.amount - 32) * 5) / 9
    : reading.amount;

export function heatBand(reading: OverlayReading): number {
  const span = HEAT_TINT_RANGE_C.warm - HEAT_TINT_RANGE_C.cold;
  return Math.min(1, Math.max(0, (celsius(reading) - HEAT_TINT_RANGE_C.cold) / span));
}

export function overlayClimate(input: OverlayInput): readonly OverlayClimateChip[] {
  return input.floor.rooms.flatMap((room) => {
    const climate = room.homeRoomId === null ? undefined : input.climate.get(room.homeRoomId);
    if (climate === undefined || room.hidden) return [];
    const temperature = fresh(climate.temperature);
    const pm25 = fresh(climate.pm25);
    if (temperature === null && pm25 === null) return [];
    const heat = input.heatTint && temperature !== null ? heatBand(temperature) : null;
    return [{ roomId: room.id, at: room.labelAt, temperature, pm25, heat }];
  });
}

function contactOf(
  deviceId: string | null,
  devices: ReadonlyMap<string, OverlayDeviceState>,
): OverlayOpeningDraw['contact'] {
  if (deviceId === null) return null;
  const state = devices.get(deviceId);
  if (state === undefined || !state.online || typeof state.contactOpen !== 'boolean') {
    return 'unknown';
  }
  return state.contactOpen ? 'open' : 'closed';
}

function lockOf(
  deviceId: string | null,
  devices: ReadonlyMap<string, OverlayDeviceState>,
): boolean | null {
  if (deviceId === null) return null;
  const state = devices.get(deviceId);
  return state?.online === true && typeof state.locked === 'boolean' ? state.locked : null;
}

export function overlayOpenings(input: OverlayInput): readonly OverlayOpeningDraw[] {
  return input.floor.openings
    .filter((opening) => opening.contactDeviceId !== null || opening.lockDeviceId !== null)
    .map((opening) => {
      const contact = contactOf(opening.contactDeviceId, input.devices);
      return {
        id: opening.id,
        contact,
        leafDeg: contact === 'open' ? OPENING_OPEN_LEAF_DEG : 0,
        warning: contact === 'open',
        locked: lockOf(opening.lockDeviceId, input.devices),
      };
    });
}

export function sourceToHouse(transform: OverlayTransform, point: RenderPoint): RenderPoint {
  const x = transform.mirrored ? -point.x : point.x;
  const cos = Math.cos(transform.rotationDeg * RAD);
  const sin = Math.sin(transform.rotationDeg * RAD);
  return { x: cos * x - sin * point.y + transform.tx, y: sin * x + cos * point.y + transform.ty };
}

export function sourcePoseToHouse(transform: OverlayTransform, pose: RenderPose): RenderPose {
  const yaw = transform.mirrored ? 180 - pose.yawDeg : pose.yawDeg;
  const turned = (((yaw + transform.rotationDeg + 180) % 360) + 360) % 360;
  return { ...sourceToHouse(transform, pose), yawDeg: turned - 180 };
}

export function overlayVacuum(vacuum: OverlayVacuumInput | null): OverlayVacuumDraw | null {
  if (vacuum === null) return null;
  const { transform } = vacuum;
  const trail = vacuum.working
    ? vacuum.trail.map((run) => ({
        mopping: run.mopping,
        points: run.points.map((point) => sourceToHouse(transform, point)),
      }))
    : [];
  return {
    robot: vacuum.robot === null ? null : sourcePoseToHouse(transform, vacuum.robot),
    dock: vacuum.dock === null ? null : sourcePoseToHouse(transform, vacuum.dock),
    trail,
    live: vacuum.working,
  };
}

const offsetAlong = (wall: RenderWall, point: RenderPoint): number =>
  homeMapDistance(wall.from, point);

export function cameraScene(
  floor: RenderFloor,
  devices: ReadonlyMap<string, OverlayDeviceState>,
): HomeMapCameraScene {
  const walls = new Map(floor.walls.map((wall) => [wall.id, wall]));
  const openings = floor.openings.flatMap((opening: RenderOpening) => {
    const wall = opening.wallId === null ? undefined : walls.get(opening.wallId);
    if (wall === undefined) return [];
    const ends = [offsetAlong(wall, opening.from), offsetAlong(wall, opening.to)];
    const contact = contactOf(opening.contactDeviceId, devices);
    return [
      {
        wallId: wall.id,
        offset: Math.min(...ends),
        width: Math.abs((ends[1] ?? 0) - (ends[0] ?? 0)),
        seeThrough: homeMapOpeningSeeThrough(
          opening.kind,
          contact === null ? null : contact === 'open',
        ),
      },
    ];
  });
  return {
    walls: floor.walls,
    openings,
  };
}

const placementOf = (
  floorId: HomeMapPlacement['floorId'],
  placement: RenderPlacement,
): HomeMapPlacement => ({
  deviceId: placement.deviceId,
  floorId,
  at: { x: placement.at.x, y: placement.at.y },
  rotation: placement.rotationDeg,
  height: placement.height,
  tilt: placement.tiltDeg,
  mount: placement.mount,
  auto: placement.auto,
  camera: placement.camera,
});

export function cameraPtz(state: OverlayDeviceState | undefined): HomeMapPtzState {
  const ptz = state?.ptz ?? NO_PTZ;
  const reports = typeof state?.model === 'string' && homeMapModelReportsAngle(state.model);
  return reports ? ptz : { ...ptz, live: null };
}

const showsCone = (input: OverlayInput, placement: RenderPlacement): boolean =>
  placement.camera !== null &&
  (placement.deviceId === input.selectedDeviceId ||
    (input.showAllCameraViews && placement.camera.showCone));

export function overlayCameras(input: OverlayInput): readonly OverlayCameraDraw[] {
  const shown = input.floor.placements.filter((placement) => showsCone(input, placement));
  const floorId = HOME_MAP_FLOOR_ID.safeParse(input.floor.id);
  if (shown.length === 0 || !floorId.success) return [];
  const scene = cameraScene(input.floor, input.devices);
  return shown.flatMap((placement) => {
    const ptz = cameraPtz(input.devices.get(placement.deviceId));
    const view = homeMapCameraView(placementOf(floorId.data, placement), ptz, scene);
    if (view === null) return [];
    return [
      {
        deviceId: placement.deviceId,
        view,
        faint: placement.deviceId !== input.selectedDeviceId,
        dashed: view.dashed,
        note: view.dashed ? CAMERA_DIRECTION_UNKNOWN_TEXT : null,
      },
    ];
  });
}

export function overlayAlerts(input: OverlayInput): readonly OverlayAlertDraw[] {
  return input.floor.placements.flatMap((placement) => {
    const state = input.devices.get(placement.deviceId);
    const kind = state?.online === true ? state.alert : null;
    if (kind === null || kind === undefined) return [];
    return [{ deviceId: placement.deviceId, roomId: placement.roomId, kind, pulse: input.animate }];
  });
}

export function overlayBadges(input: OverlayInput): readonly OverlayBadge[] {
  return input.floor.placements.flatMap((placement) => {
    const state = input.devices.get(placement.deviceId);
    if (state === undefined) return [];
    const offline = !state.online;
    const lowBattery = state.batteryLow === true;
    return offline || lowBattery ? [{ deviceId: placement.deviceId, offline, lowBattery }] : [];
  });
}

export const overlayModel = (input: OverlayInput): OverlayModel => ({
  zones: overlayZones(input),
  activeRooms: overlayActiveRooms(input),
  motionDevices: motionDevices(input),
  tracks: overlayTracks(input),
  climate: overlayClimate(input),
  openings: overlayOpenings(input),
  vacuum: overlayVacuum(input.vacuum),
  cameras: overlayCameras(input),
  alerts: overlayAlerts(input),
  badges: overlayBadges(input),
});
