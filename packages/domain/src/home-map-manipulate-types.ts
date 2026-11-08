import type { HomeMapVec } from './home-map-geometry';
import type { HomeMapSnapWall } from './home-map-snap';

export type HomeMapParams = Readonly<Record<string, number>>;
export type HomeMapSizeAxis = 'width' | 'depth' | 'height';

export interface HomeMapEditSizeParam {
  readonly name: string;
  readonly axis: HomeMapSizeAxis;
  readonly min: number;
  readonly max: number;
  readonly scale: number;
  readonly extra: number;
  readonly resizes: boolean;
}

export interface HomeMapEditPreset {
  readonly id: string;
  readonly label: string;
  readonly params: HomeMapParams;
}

export interface HomeMapEditFacts {
  readonly sizeParams: readonly HomeMapEditSizeParam[];
  readonly presets: readonly HomeMapEditPreset[];
  readonly derive?: (params: HomeMapParams) => HomeMapParams;
}

export type HomeMapEditFactsFn = (modelId: string) => HomeMapEditFacts | undefined;

export interface HomeMapEditBox {
  readonly at: HomeMapVec;
  readonly rotation: number;
  readonly w: number;
  readonly d: number;
}

export interface HomeMapEditObject {
  readonly id: string;
  readonly modelId: string;
  readonly at: HomeMapVec;
  readonly rotation: number;
  readonly params: HomeMapParams;
  readonly footprint: { readonly w: number; readonly d: number };
  readonly locked: boolean;
}

export const HOME_MAP_HANDLE_IDS = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const;
export type HomeMapHandleId = (typeof HOME_MAP_HANDLE_IDS)[number];

export type HomeMapHandleSign = -1 | 0 | 1;

export const HOME_MAP_HANDLE_SIGNS: Readonly<
  Record<HomeMapHandleId, readonly [HomeMapHandleSign, HomeMapHandleSign]>
> = {
  nw: [-1, -1],
  n: [0, -1],
  ne: [1, -1],
  e: [1, 0],
  se: [1, 1],
  s: [0, 1],
  sw: [-1, 1],
  w: [-1, 0],
};

export interface HomeMapHandleView {
  readonly touchM: number;
  readonly stemM: number;
}

export interface HomeMapHandlePoint {
  readonly id: HomeMapHandleId | 'rotate';
  readonly at: HomeMapVec;
  readonly touchM: number;
  readonly outside: boolean;
}

export interface HomeMapDimensionLabel {
  readonly axis: HomeMapSizeAxis;
  readonly valueM: number;
  readonly at: HomeMapVec;
}

export interface HomeMapManipulation {
  readonly box: HomeMapEditBox;
  readonly corners: readonly HomeMapVec[];
  readonly ghost: readonly HomeMapVec[];
  readonly params: HomeMapParams;
  readonly changed: HomeMapParams;
  readonly derived: HomeMapParams;
  readonly labels: readonly HomeMapDimensionLabel[];
  readonly preset: string | null;
}

export interface HomeMapResizeOptions {
  readonly gridM: number | null;
  readonly presetRadiusM: number | null;
  readonly keepProportions: boolean;
}

export interface HomeMapResizeInput {
  readonly object: HomeMapEditObject;
  readonly facts: HomeMapEditFacts | undefined;
  readonly handle: HomeMapHandleId;
  readonly pointer: HomeMapVec;
  readonly options: HomeMapResizeOptions;
}

export interface HomeMapPinchInput {
  readonly object: HomeMapEditObject;
  readonly facts: HomeMapEditFacts | undefined;
  readonly scale: number;
  readonly twistDeg: number;
  readonly stepDeg: number | null;
}

export interface HomeMapRotateInput {
  readonly box: HomeMapEditBox;
  readonly pointer: HomeMapVec;
  readonly stepDeg: number | null;
}

export interface HomeMapGuideLine {
  readonly orientation: 'vertical' | 'horizontal';
  readonly kind: 'edge' | 'centre';
  readonly from: HomeMapVec;
  readonly to: HomeMapVec;
  readonly targetId: string;
}

export interface HomeMapMoveOptions {
  readonly radiusM: number;
  readonly gridM: number | null;
  readonly hugWalls: boolean;
}

export interface HomeMapMoveContext<W extends HomeMapSnapWall> {
  readonly walls: readonly W[];
  readonly others: readonly { readonly id: string; readonly box: HomeMapEditBox }[];
}

export interface HomeMapMoveResult<W extends HomeMapSnapWall> {
  readonly at: HomeMapVec;
  readonly rotation: number;
  readonly snap: 'wall' | 'object' | 'grid' | 'free';
  readonly wall: W | null;
  readonly guides: readonly HomeMapGuideLine[];
}
