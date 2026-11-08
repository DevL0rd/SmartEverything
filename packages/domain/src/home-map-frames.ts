import type { HomeMapPolygonShape, HomeMapVec } from './home-map-geometry';

export const SHELLY_HOUSE_CELL_METRES = 0.5;

export type ShellyHouseSegment = readonly [number, number, number, number];

export interface ShellyHousePose {
  readonly at: HomeMapVec;
  readonly yawDeg: number;
}

const RAD = Math.PI / 180;

export const shellySensorToHouse = (pose: ShellyHousePose, point: HomeMapVec): HomeMapVec => {
  const sin = Math.sin(pose.yawDeg * RAD);
  const cos = Math.cos(pose.yawDeg * RAD);
  return {
    x: pose.at.x + point.x * sin + point.y * cos,
    y: pose.at.y - point.x * cos + point.y * sin,
  };
};

export const shellyHouseToSensor = (pose: ShellyHousePose, point: HomeMapVec): HomeMapVec => {
  const sin = Math.sin(pose.yawDeg * RAD);
  const cos = Math.cos(pose.yawDeg * RAD);
  const dx = point.x - pose.at.x;
  const dy = point.y - pose.at.y;
  return { x: dx * sin - dy * cos, y: dx * cos + dy * sin };
};

export const shellySegmentToHousePolygon = (
  pose: ShellyHousePose,
  segment: ShellyHouseSegment,
): HomeMapPolygonShape => {
  const [x1, y1, x2, y2] = segment;
  const xa = Math.min(x1, x2) * SHELLY_HOUSE_CELL_METRES;
  const xb = Math.max(x1, x2) * SHELLY_HOUSE_CELL_METRES;
  const ya = Math.min(y1, y2) * SHELLY_HOUSE_CELL_METRES;
  const yb = Math.max(y1, y2) * SHELLY_HOUSE_CELL_METRES;
  const corners: readonly HomeMapVec[] = [
    { x: xa, y: ya },
    { x: xb, y: ya },
    { x: xb, y: yb },
    { x: xa, y: yb },
  ];
  return { outer: corners.map((corner) => shellySensorToHouse(pose, corner)), holes: [] };
};

export const shellyAreaToHousePolygons = (
  pose: ShellyHousePose,
  area: readonly ShellyHouseSegment[],
): readonly HomeMapPolygonShape[] =>
  area.map((segment) => shellySegmentToHousePolygon(pose, segment));

export const shellyHousePointInArea = (
  pose: ShellyHousePose,
  area: readonly ShellyHouseSegment[],
  point: HomeMapVec,
): boolean => {
  const sensor = shellyHouseToSensor(pose, point);
  const gx = sensor.x / SHELLY_HOUSE_CELL_METRES;
  const gy = sensor.y / SHELLY_HOUSE_CELL_METRES;
  return area.some(
    ([x1, y1, x2, y2]) =>
      gx > Math.min(x1, x2) &&
      gx <= Math.max(x1, x2) &&
      gy >= Math.min(y1, y2) &&
      gy < Math.max(y1, y2),
  );
};
