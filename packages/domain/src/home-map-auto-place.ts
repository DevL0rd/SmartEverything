import { homeMapPolygonArea, type HomeMapVec } from './home-map-geometry';
import type { HomeMapCamera, HomeMapPlacement } from './home-map-placement';
import { homeMapSnapRotation } from './home-map-snap';
import { AUTO_EPS, autoText, autoWithoutNearest } from './home-map-auto-place-shapes';
import {
  autoBuildContext,
  autoCeilingSpots,
  autoFloorPick,
  autoRegisterFloor,
  autoRegisterWall,
  autoWallHeight,
  autoWallPick,
  type AutoContext,
} from './home-map-auto-place-spots';
import {
  HOME_MAP_AUTO_PLACE,
  type HomeMapAutoDevice,
  type HomeMapAutoFacts,
  type HomeMapAutoPlaceInput,
  type HomeMapAutoPlaceResult,
} from './home-map-auto-place-types';

export {
  HOME_MAP_AUTO_PLACE,
  type HomeMapAutoDevice,
  type HomeMapAutoFacts,
  type HomeMapAutoFactsFn,
  type HomeMapAutoOccupant,
  type HomeMapAutoPlaceInput,
  type HomeMapAutoPlaceResult,
  type HomeMapAutoRole,
} from './home-map-auto-place-types';

const cameraOf = (facts: HomeMapAutoFacts, rotation: number): HomeMapCamera | null =>
  facts.fov
    ? {
        hfovDeg: facts.fov.hDeg,
        vfovDeg: facts.fov.vDeg,
        rangeM: facts.fov.rangeM,
        fovSource: facts.fov.exact ? 'exact' : 'estimated',
        pan: { mode: 'fixed', yawDeg: rotation, presets: {} },
        showCone: true,
      }
    : null;

const placeDevice = (
  ctx: AutoContext,
  input: HomeMapAutoPlaceInput,
  device: HomeMapAutoDevice,
  facts: HomeMapAutoFacts,
): HomeMapPlacement | null => {
  const size = facts.footprint;
  const wall = facts.mount === 'wall';
  const height = wall ? autoWallHeight(ctx, device.role, facts) : facts.defaultHeightM;
  const candidate = wall
    ? autoWallPick(ctx, device.role, size, height)
    : autoFloorPick(ctx, device.role, size);
  if (!candidate) return null;
  if (wall) autoRegisterWall(ctx, candidate, size.w / 2);
  else autoRegisterFloor(ctx, { at: candidate.at, w: size.w, d: size.d, rotation: 0 }, size.h);
  const rotation = homeMapSnapRotation(candidate.rotation, null);
  return {
    deviceId: device.deviceId,
    floorId: input.floorId,
    at: { x: candidate.at.x, y: candidate.at.y },
    rotation,
    height,
    tilt: wall && device.role === 'camera' ? HOME_MAP_AUTO_PLACE.cameraTiltDeg : 0,
    mount: facts.mount,
    auto: true,
    camera: cameraOf(facts, rotation),
  };
};

const placeCeiling = (
  ctx: AutoContext,
  input: HomeMapAutoPlaceInput,
  devices: readonly HomeMapAutoDevice[],
  existing: readonly HomeMapVec[],
): { readonly placed: HomeMapPlacement[]; readonly missed: string[] } => {
  const placed: HomeMapPlacement[] = [];
  const missed: string[] = [];
  if (devices.length === 0) return { placed, missed };
  let spots = autoCeilingSpots(ctx, existing.length + devices.length);
  for (const p of existing) spots = autoWithoutNearest(spots, p);
  devices.forEach((device, index) => {
    const at = spots[index];
    if (!at) {
      missed.push(device.deviceId);
      return;
    }
    const facts = input.facts(device.modelId);
    placed.push({
      deviceId: device.deviceId,
      floorId: input.floorId,
      at: { x: at.x, y: at.y },
      rotation: 0,
      height: input.room.ceilingHeight,
      tilt: 0,
      mount: 'ceiling',
      auto: true,
      camera: cameraOf(facts, 0),
    });
  });
  return { placed, missed };
};

export const homeMapAutoPlace = (input: HomeMapAutoPlaceInput): HomeMapAutoPlaceResult => {
  const devices = [...input.devices].sort((p, q) => autoText(p.deviceId, q.deviceId));
  if (homeMapPolygonArea(input.room.polygon) < AUTO_EPS) {
    return { placements: [], unplaced: devices.map((device) => device.deviceId) };
  }
  const ctx = autoBuildContext(input);
  const isCeiling = (modelId: string): boolean => input.facts(modelId).mount === 'ceiling';
  const ceiling = placeCeiling(
    ctx,
    input,
    devices.filter((device) => isCeiling(device.modelId)),
    input.occupants.filter((o) => isCeiling(o.modelId)).map((o) => o.at),
  );
  const placements = [...ceiling.placed];
  const unplaced = [...ceiling.missed];
  for (const device of devices.filter((d) => !isCeiling(d.modelId))) {
    const placement = placeDevice(ctx, input, device, input.facts(device.modelId));
    if (placement) placements.push(placement);
    else unplaced.push(device.deviceId);
  }
  return {
    placements: placements.sort((p, q) => autoText(p.deviceId, q.deviceId)),
    unplaced: unplaced.sort(autoText),
  };
};
