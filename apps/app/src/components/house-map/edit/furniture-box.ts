import {
  homeMapEditToLocal,
  homeMapHandlePoints,
  homeMapObjectBox,
  type HomeMapEditBox,
  type HomeMapEditFacts,
  type HomeMapEditObject,
  type HomeMapHandleId,
} from '@smarteverything/domain/home-map-edit-core';
import { homeMapDistance, type HomeMapVec } from '@smarteverything/domain/home-map-geometry';
import type { HomeMapObject } from '@smarteverything/domain/home-map-elements';
import type { HomeMapFloor } from '@smarteverything/domain/home-map';
import { modelSizeParams } from '@smarteverything/domain/model-placement';
import type { ModelSpec } from '@smarteverything/domain/model-spec';

export const UNKNOWN_SIZE_M = 1;
export const HANDLE_TOUCH_PX = 22;
export const HANDLE_STEM_PX = 28;

export type SpecOf = (modelId: string) => ModelSpec | undefined;

export function editFactsOf(spec: ModelSpec | undefined): HomeMapEditFacts | undefined {
  if (spec === undefined) return undefined;
  return { sizeParams: modelSizeParams(spec), presets: [] };
}

export function editObjectOf(
  object: HomeMapObject,
  spec: ModelSpec | undefined,
): HomeMapEditObject {
  const footprint = spec?.footprint;
  return {
    id: object.id,
    modelId: object.modelId,
    at: object.at,
    rotation: object.rotation,
    params: object.params,
    footprint: {
      w: footprint?.width ?? object.params['width'] ?? UNKNOWN_SIZE_M,
      d: footprint?.depth ?? object.params['depth'] ?? UNKNOWN_SIZE_M,
    },
    locked: object.locked,
  };
}

export function boxOf(object: HomeMapObject, specOf: SpecOf): HomeMapEditBox {
  const spec = specOf(object.modelId);
  return homeMapObjectBox(editObjectOf(object, spec), editFactsOf(spec));
}

export function hitObject(
  floor: HomeMapFloor,
  point: HomeMapVec,
  specOf: SpecOf,
): HomeMapObject | null {
  const inside = (object: HomeMapObject): boolean => {
    const box = boxOf(object, specOf);
    const local = homeMapEditToLocal(box, point);
    return Math.abs(local.x) <= box.d / 2 && Math.abs(local.y) <= box.w / 2;
  };
  return [...floor.objects].reverse().find(inside) ?? null;
}

export type Grip =
  | { readonly kind: 'move'; readonly grab: HomeMapVec }
  | { readonly kind: 'rotate' }
  | { readonly kind: 'resize'; readonly handle: HomeMapHandleId };

export function gripAt(
  box: HomeMapEditBox,
  locked: boolean,
  point: HomeMapVec,
  metresPerPx: number,
): Grip | null {
  const view = { touchM: HANDLE_TOUCH_PX * metresPerPx, stemM: HANDLE_STEM_PX * metresPerPx };
  const handle = homeMapHandlePoints(box, locked, view).find(
    (each) => homeMapDistance(each.at, point) <= each.touchM,
  );
  if (handle === undefined) return null;
  return handle.id === 'rotate' ? { kind: 'rotate' } : { kind: 'resize', handle: handle.id };
}
