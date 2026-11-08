import type { HomeMapVec } from './home-map-geometry';
import {
  HOME_MAP_EDIT_MIN_EXTENT,
  homeMapEditBuild,
  homeMapEditClamp,
  homeMapEditFit,
  homeMapEditInner,
  homeMapEditLimits,
  homeMapEditOuter,
  homeMapEditSnapSize,
  homeMapEditToLocal,
  homeMapEditToWorld,
  homeMapObjectBox,
  type HomeMapEditAxisLimit,
  type HomeMapEditAxisLimits,
  type HomeMapEditSizes,
} from './home-map-manipulate-base';
import {
  HOME_MAP_HANDLE_SIGNS,
  type HomeMapDimensionLabel,
  type HomeMapEditBox,
  type HomeMapEditFacts,
  type HomeMapEditObject,
  type HomeMapManipulation,
  type HomeMapHandleSign,
  type HomeMapPinchInput,
  type HomeMapResizeInput,
  type HomeMapRotateInput,
} from './home-map-manipulate-types';
import { homeMapSnapRotation } from './home-map-snap';

interface PresetHit {
  readonly id: string;
  readonly d: number | null;
  readonly w: number | null;
}

type Signs = readonly [HomeMapHandleSign, HomeMapHandleSign];

const presetValue = (
  limit: HomeMapEditAxisLimit | null,
  active: boolean,
  params: Readonly<Record<string, number>>,
): number | null => {
  const value = limit && active ? params[limit.name] : undefined;
  return limit === null || value === undefined ? null : homeMapEditOuter(limit, value);
};

const presetHit = (
  raw: HomeMapEditSizes,
  signs: Signs,
  facts: HomeMapEditFacts | undefined,
  radius: number | null,
): PresetHit | null => {
  if (!facts || radius === null) return null;
  const limits = homeMapEditLimits(facts);
  const hits = facts.presets.flatMap((preset): (PresetHit & { readonly gap: number })[] => {
    const d = presetValue(limits.d, signs[0] !== 0, preset.params);
    const w = presetValue(limits.w, signs[1] !== 0, preset.params);
    const gaps = [
      ...(d === null ? [] : [Math.abs(raw.d - d)]),
      ...(w === null ? [] : [Math.abs(raw.w - w)]),
    ];
    if (gaps.length === 0 || gaps.some((gap) => gap > radius)) return [];
    return [{ id: preset.id, d, w, gap: gaps.reduce((sum, gap) => sum + gap, 0) }];
  });
  return hits.reduce<(PresetHit & { readonly gap: number }) | null>(
    (best, hit) => (best && best.gap <= hit.gap ? best : hit),
    null,
  );
};

const proportionalSizes = (
  box: HomeMapEditBox,
  raw: HomeMapEditSizes,
  limits: HomeMapEditAxisLimits,
): HomeMapEditSizes => {
  const lows = [
    HOME_MAP_EDIT_MIN_EXTENT,
    ...(limits.d ? [limits.d.min / box.d] : []),
    ...(limits.w ? [limits.w.min / box.w] : []),
  ];
  const highs = [
    Infinity,
    ...(limits.d ? [limits.d.max / box.d] : []),
    ...(limits.w ? [limits.w.max / box.w] : []),
  ];
  const low = Math.max(...lows);
  const scale = homeMapEditClamp(
    Math.max(raw.d / box.d, raw.w / box.w),
    low,
    Math.max(low, Math.min(...highs)),
  );
  return { d: limits.d ? box.d * scale : box.d, w: limits.w ? box.w * scale : box.w };
};

const dragLabels = (
  frame: Pick<HomeMapEditBox, 'at' | 'rotation'>,
  sizes: HomeMapEditSizes,
  signs: Signs,
): readonly HomeMapDimensionLabel[] => {
  const [sx, sy] = signs;
  return [
    ...(sx === 0
      ? []
      : [
          {
            axis: 'depth' as const,
            valueM: sizes.d,
            at: homeMapEditToWorld(frame, { x: (sx * sizes.d) / 2, y: 0 }),
          },
        ]),
    ...(sy === 0
      ? []
      : [
          {
            axis: 'width' as const,
            valueM: sizes.w,
            at: homeMapEditToWorld(frame, { x: 0, y: (sy * sizes.w) / 2 }),
          },
        ]),
  ];
};

const rawSizes = (box: HomeMapEditBox, signs: Signs, pointer: HomeMapVec): HomeMapEditSizes => {
  const local = homeMapEditToLocal(box, pointer);
  return {
    d: signs[0] === 0 ? box.d : signs[0] * local.x + box.d / 2,
    w: signs[1] === 0 ? box.w : signs[1] * local.y + box.w / 2,
  };
};

const freeSizes = (
  box: HomeMapEditBox,
  raw: HomeMapEditSizes,
  limits: HomeMapEditAxisLimits,
  snapped: { readonly grid: number | null; readonly hit: PresetHit | null },
): HomeMapEditSizes => ({
  d: homeMapEditFit(snapped.hit?.d ?? homeMapEditSnapSize(raw.d, snapped.grid), limits.d, box.d),
  w: homeMapEditFit(snapped.hit?.w ?? homeMapEditSnapSize(raw.w, snapped.grid), limits.w, box.w),
});

export const homeMapResize = (input: HomeMapResizeInput): HomeMapManipulation => {
  const { object, facts, options } = input;
  const box = homeMapObjectBox(object, facts);
  const signs = HOME_MAP_HANDLE_SIGNS[input.handle];
  const limits = homeMapEditLimits(facts);
  const raw = rawSizes(box, signs, input.pointer);
  const proportional = options.keepProportions && signs[0] !== 0 && signs[1] !== 0;
  const hit = proportional ? null : presetHit(raw, signs, facts, options.presetRadiusM);
  const sizes = proportional
    ? proportionalSizes(box, raw, limits)
    : freeSizes(box, raw, limits, { grid: options.gridM, hit });
  const at = homeMapEditToWorld(box, {
    x: (signs[0] * (sizes.d - box.d)) / 2,
    y: (signs[1] * (sizes.w - box.w)) / 2,
  });
  return homeMapEditBuild(object, facts, box, {
    at,
    rotation: box.rotation,
    sizes,
    extra: {},
    labels: dragLabels({ at, rotation: box.rotation }, sizes, signs),
    preset: hit?.id ?? null,
  });
};

export const homeMapRotateTo = (input: HomeMapRotateInput): number => {
  const { box, pointer, stepDeg } = input;
  const degrees = (Math.atan2(pointer.y - box.at.y, pointer.x - box.at.x) * 180) / Math.PI;
  return homeMapSnapRotation(degrees + 90, stepDeg);
};

export const homeMapRotateStep = (rotation: number, direction: 1 | -1, stepDeg: number): number =>
  homeMapSnapRotation(rotation + direction * stepDeg, stepDeg);

const scaleRange = (
  limits: HomeMapEditAxisLimits,
  sizes: readonly (readonly [keyof HomeMapEditAxisLimits, number | null])[],
): { readonly low: number; readonly high: number } => {
  const active = sizes.flatMap(([axis, size]) => {
    const limit = limits[axis];
    return limit && size !== null && size > 0 ? [{ limit, size }] : [];
  });
  const low = Math.max(
    HOME_MAP_EDIT_MIN_EXTENT,
    ...active.map(({ limit, size }) => limit.min / size),
  );
  const high = Math.min(Infinity, ...active.map(({ limit, size }) => limit.max / size));
  return { low, high: Math.max(low, high) };
};

const pinchSizes = (
  object: HomeMapEditObject,
  box: HomeMapEditBox,
  limits: HomeMapEditAxisLimits,
  wanted: number,
): { readonly sizes: HomeMapEditSizes; readonly extra: Record<string, number> } => {
  const param = limits.h ? object.params[limits.h.name] : undefined;
  const height = limits.h && param !== undefined ? homeMapEditOuter(limits.h, param) : null;
  const range = scaleRange(limits, [
    ['d', box.d],
    ['w', box.w],
    ['h', height],
  ]);
  const scale = homeMapEditClamp(wanted, range.low, range.high);
  const extra: Record<string, number> = {};
  if (limits.h && height !== null)
    extra[limits.h.name] = homeMapEditInner(limits.h, height * scale);
  return {
    sizes: { d: limits.d ? box.d * scale : box.d, w: limits.w ? box.w * scale : box.w },
    extra,
  };
};

export const homeMapPinchTwist = (input: HomeMapPinchInput): HomeMapManipulation => {
  const { object, facts } = input;
  const box = homeMapObjectBox(object, facts);
  const { sizes, extra } = pinchSizes(object, box, homeMapEditLimits(facts), input.scale);
  return homeMapEditBuild(object, facts, box, {
    at: object.at,
    rotation: homeMapSnapRotation(box.rotation + input.twistDeg, input.stepDeg),
    sizes,
    extra,
    labels: [
      { axis: 'depth', valueM: sizes.d, at: object.at },
      { axis: 'width', valueM: sizes.w, at: object.at },
    ],
    preset: null,
  });
};
