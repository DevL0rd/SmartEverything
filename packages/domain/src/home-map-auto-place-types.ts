import type { HomeMapFloorId } from './home-map-elements';
import type { HomeMapPolygonShape, HomeMapSegmentShape, HomeMapVec } from './home-map-geometry';
import type { HomeMapPlacement } from './home-map-placement';

export const HOME_MAP_AUTO_PLACE = {
  floorCellM: 0.25,
  floorWallClearanceM: 0.3,
  wallStepM: 0.1,
  wallEdgeMarginM: 0.1,
  openingMarginM: 0.05,
  switchGapM: 0.15,
  cornerInsetM: 0.15,
  cameraHeightM: 2.2,
  cameraTiltDeg: 20,
  ceilingGapM: 0.1,
  airConditionerDropM: 0.3,
} as const;

export type HomeMapAutoRole = 'generic' | 'corner' | 'tv' | 'switch' | 'ac' | 'camera' | 'presence';

export interface HomeMapAutoFacts {
  readonly mount: HomeMapPlacement['mount'];
  readonly defaultHeightM: number;
  readonly footprint: { readonly w: number; readonly d: number; readonly h: number };
  readonly fov?: {
    readonly hDeg: number;
    readonly vDeg: number;
    readonly rangeM: number;
    readonly exact: boolean;
  };
}

export type HomeMapAutoFactsFn = (modelId: string) => HomeMapAutoFacts;

export interface HomeMapAutoDevice {
  readonly deviceId: string;
  readonly modelId: string;
  readonly role: HomeMapAutoRole;
}

export interface HomeMapAutoOccupant {
  readonly modelId: string;
  readonly at: HomeMapVec;
  readonly rotation: number;
}

export interface HomeMapAutoPlaceInput {
  readonly floorId: HomeMapFloorId;
  readonly room: { readonly polygon: HomeMapPolygonShape; readonly ceilingHeight: number };
  readonly openings: readonly HomeMapSegmentShape[];
  readonly occupants: readonly HomeMapAutoOccupant[];
  readonly devices: readonly HomeMapAutoDevice[];
  readonly facts: HomeMapAutoFactsFn;
}

export interface HomeMapAutoPlaceResult {
  readonly placements: readonly HomeMapPlacement[];
  readonly unplaced: readonly string[];
}
