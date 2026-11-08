import type { HomeMapVec } from './home-map-geometry';
import {
  HOME_MAP_HANDLE_IDS,
  HOME_MAP_HANDLE_SIGNS,
  type HomeMapDimensionLabel,
  type HomeMapEditBox,
  type HomeMapEditFacts,
  type HomeMapEditObject,
  type HomeMapManipulation,
  type HomeMapHandlePoint,
  type HomeMapHandleView,
  type HomeMapSizeAxis,
} from './home-map-manipulate-types';

export interface HomeMapEditAxisLimit {
  readonly name: string;
  readonly min: number;
  readonly max: number;
  readonly scale: number;
  readonly extra: number;
}

export interface HomeMapEditAxisLimits {
  readonly d: HomeMapEditAxisLimit | null;
  readonly w: HomeMapEditAxisLimit | null;
  readonly h: HomeMapEditAxisLimit | null;
}

export interface HomeMapEditSizes {
  readonly d: number;
  readonly w: number;
}

export interface HomeMapEditBuilt {
  readonly at: HomeMapVec;
  readonly rotation: number;
  readonly sizes: HomeMapEditSizes;
  readonly extra: Readonly<Record<string, number>>;
  readonly labels: readonly HomeMapDimensionLabel[];
  readonly preset: string | null;
}

export const HOME_MAP_EDIT_MIN_EXTENT = 0.001;

const RAD = Math.PI / 180;

export const homeMapEditClamp = (value: number, low: number, high: number): number =>
  Math.min(high, Math.max(low, value));

type Frame = Pick<HomeMapEditBox, 'at' | 'rotation'>;

export const homeMapEditToLocal = (frame: Frame, p: HomeMapVec): HomeMapVec => {
  const c = Math.cos(frame.rotation * RAD);
  const s = Math.sin(frame.rotation * RAD);
  const dx = p.x - frame.at.x;
  const dy = p.y - frame.at.y;
  return { x: dx * c + dy * s, y: -dx * s + dy * c };
};

export const homeMapEditToWorld = (frame: Frame, l: HomeMapVec): HomeMapVec => {
  const c = Math.cos(frame.rotation * RAD);
  const s = Math.sin(frame.rotation * RAD);
  return { x: frame.at.x + l.x * c - l.y * s, y: frame.at.y + l.x * s + l.y * c };
};

export const homeMapBoxCorners = (box: HomeMapEditBox): readonly HomeMapVec[] =>
  [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ].map(([sx = 0, sy = 0]) =>
    homeMapEditToWorld(box, { x: (sx * box.d) / 2, y: (sy * box.w) / 2 }),
  );

type Extent = Pick<HomeMapEditAxisLimit, 'scale' | 'extra'>;

export const homeMapEditOuter = (extent: Extent, value: number): number =>
  value * extent.scale + extent.extra;

export const homeMapEditInner = (extent: Extent, size: number): number =>
  (size - extent.extra) / extent.scale;

const limitOf = (
  facts: HomeMapEditFacts | undefined,
  axis: HomeMapSizeAxis,
): HomeMapEditAxisLimit | null => {
  const param = facts?.sizeParams.find((candidate) => candidate.axis === axis && candidate.resizes);
  if (!param) return null;
  return {
    name: param.name,
    min: Math.max(homeMapEditOuter(param, param.min), HOME_MAP_EDIT_MIN_EXTENT),
    max: homeMapEditOuter(param, param.max),
    scale: param.scale,
    extra: param.extra,
  };
};

export const homeMapEditLimits = (facts: HomeMapEditFacts | undefined): HomeMapEditAxisLimits => ({
  d: limitOf(facts, 'depth'),
  w: limitOf(facts, 'width'),
  h: limitOf(facts, 'height'),
});

export const homeMapEditFit = (
  value: number,
  limit: HomeMapEditAxisLimit | null,
  current: number,
): number => (limit ? homeMapEditClamp(value, limit.min, limit.max) : current);

export const homeMapEditSnapSize = (value: number, gridM: number | null): number =>
  gridM === null ? value : Math.round(value / gridM) * gridM;

export const homeMapObjectBox = (
  object: HomeMapEditObject,
  facts: HomeMapEditFacts | undefined,
): HomeMapEditBox => {
  const read = (axis: HomeMapSizeAxis, fallback: number): number => {
    const param = facts?.sizeParams.find((candidate) => candidate.axis === axis);
    const value = param === undefined ? undefined : object.params[param.name];
    return param === undefined || value === undefined ? fallback : homeMapEditOuter(param, value);
  };
  return {
    at: object.at,
    rotation: object.rotation,
    w: read('width', object.footprint.w),
    d: read('depth', object.footprint.d),
  };
};

export const homeMapHandlePoints = (
  box: HomeMapEditBox,
  locked: boolean,
  view: HomeMapHandleView,
): readonly HomeMapHandlePoint[] => {
  if (locked) return [];
  const hx = Math.max(box.d / 2, view.touchM);
  const hy = Math.max(box.w / 2, view.touchM);
  const outside = hx > box.d / 2 || hy > box.w / 2;
  const point = (id: HomeMapHandlePoint['id'], x: number, y: number): HomeMapHandlePoint => ({
    id,
    at: homeMapEditToWorld(box, { x, y }),
    touchM: view.touchM,
    outside,
  });
  const edges = HOME_MAP_HANDLE_IDS.map((id) => {
    const [sx, sy] = HOME_MAP_HANDLE_SIGNS[id];
    return point(id, sx * hx, sy * hy);
  });
  return [...edges, point('rotate', 0, -(hy + view.stemM))];
};

const sizesRecord = (
  limits: HomeMapEditAxisLimits,
  sizes: HomeMapEditSizes,
  before: HomeMapEditBox,
): Record<string, number> => {
  const record: Record<string, number> = {};
  const put = (limit: HomeMapEditAxisLimit | null, size: number, was: number): void => {
    if (limit && (size !== was || !(limit.name in record))) {
      record[limit.name] = homeMapEditInner(limit, size);
    }
  };
  put(limits.w, sizes.w, before.w);
  put(limits.d, sizes.d, before.d);
  return record;
};

export const homeMapEditBuild = (
  object: HomeMapEditObject,
  facts: HomeMapEditFacts | undefined,
  before: HomeMapEditBox,
  built: HomeMapEditBuilt,
): HomeMapManipulation => {
  const sized = {
    ...object.params,
    ...sizesRecord(homeMapEditLimits(facts), built.sizes, before),
    ...built.extra,
  };
  const derived = facts?.derive?.(sized) ?? {};
  const params = { ...sized, ...derived };
  const changed = Object.fromEntries(
    Object.entries(params).filter(([name, value]) => object.params[name] !== value),
  );
  const outer = homeMapObjectBox({ ...object, params }, facts);
  const box = { at: built.at, rotation: built.rotation, w: outer.w, d: outer.d };
  return {
    box,
    corners: homeMapBoxCorners(box),
    ghost: homeMapBoxCorners(before),
    params,
    changed,
    derived,
    labels: built.labels,
    preset: built.preset,
  };
};
