import {
  HOME_MAP_OBJECT_WRITE,
  homeMapAutoPlace,
  homeMapOpeningEnds,
  homeMapPolygonArea,
  homeMapRoomAt,
  placementFacts,
  type HomeMapAutoFacts,
  type HomeMapFloor,
  type HomeMapObject,
  type HomeMapOp,
  type HomeMapRoom,
  type HomeMapSegmentShape,
  type HomeMapVec,
  type ModelCatalogRow,
  type ModelSpec,
} from '@smarteverything/domain';
import type { EditOverlay } from '../../../../components/house-map/3d/map-3d-edit-protocol';
import type { IconName } from '../../../../components/icon-glyphs';
import { categoryLabel, compareText } from '../../../../format/text';
import { FINISH_TOKEN_HASH } from '../../../../components/models/three/finish-token-hash';
import {
  UNKNOWN_SIZE_M,
  boxOf,
  hitObject,
  type SpecOf,
} from '../../../../components/house-map/edit/furniture-box';
import type { ModelSource } from '../../../models';

export const ALL_CATEGORIES = 'all';
export const THUMB_PX = 44;
export const FURNITURE_PREFIX = 'cat.';
export const ROTATE_STEP_DEG = 15;

const CATEGORY_ICONS: Readonly<Record<string, IconName>> = {
  structure: 'house',
  living: 'sofa',
  bedroom: 'bed',
  dining: 'utensils',
  kitchen: 'coffee',
  bathroom: 'bath',
  office: 'monitor',
  storage: 'box',
  decor: 'image',
  outdoor: 'sun',
  plants: 'leaf',
  rugs: 'square',
  'kids-pets': 'baby',
  'fitness-hobby': 'dumbbell',
};

export function categoryIcon(category: string): IconName {
  return CATEGORY_ICONS[category] ?? 'box';
}

export function furnitureRows(rows: readonly ModelCatalogRow[]): readonly ModelCatalogRow[] {
  return rows
    .filter((row) => row.id.startsWith(FURNITURE_PREFIX))
    .sort((a, b) => compareText(a.title, b.title));
}

export function categoriesOf(rows: readonly ModelCatalogRow[]): readonly string[] {
  return [...new Set(rows.map((row) => row.category))].sort(compareText);
}

function haystack(row: ModelCatalogRow): string {
  const id = row.id.slice(FURNITURE_PREFIX.length).replace(/[._-]+/g, ' ');
  return [row.title, id, categoryLabel(row.category), ...row.aliases].join(' ').toLowerCase();
}

export function matchRows(
  rows: readonly ModelCatalogRow[],
  query: string,
  category: string,
): readonly ModelCatalogRow[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return rows.filter(
    (row) =>
      (category === ALL_CATEGORIES || row.category === category) &&
      words.every((word) => haystack(row).includes(word)),
  );
}

export function sizeText(spec: ModelSpec): string {
  const { width, depth } = spec.footprint;
  return `${width.toFixed(2)} × ${depth.toFixed(2)} m`;
}

export function finishesOf(spec: ModelSpec): readonly string[] {
  return Object.keys(spec.finishes ?? {});
}

export function sourceOf(row: ModelCatalogRow, spec: ModelSpec): ModelSource | null {
  if (row.spec_sha256 === null) return null;
  return {
    spec,
    specHash: row.spec_sha256,
    tokenHash: FINISH_TOKEN_HASH,
    finish: spec.defaultFinish ?? null,
    params: {},
  };
}

export const NO_ROOM_TEXT = 'Draw a room first, then place furniture in it.';
export const NO_SPOT_TEXT = 'There is no free spot left in this room for that piece.';

function autoFactsOf(modelId: string, spec: ModelSpec | undefined): HomeMapAutoFacts {
  const facts = placementFacts(modelId, spec);
  if (facts !== undefined) return facts;
  const size = { w: UNKNOWN_SIZE_M, d: UNKNOWN_SIZE_M, h: UNKNOWN_SIZE_M };
  return { mount: 'floor', defaultHeightM: 0, footprint: size };
}

export function targetRoom(floor: HomeMapFloor, selected: string | null): HomeMapRoom | null {
  const chosen = floor.rooms.find((room) => room.id === selected);
  if (chosen !== undefined) return chosen;
  const object = floor.objects.find((item) => item.id === selected);
  const holding = object === undefined ? null : homeMapRoomAt(floor.rooms, object.at);
  if (holding !== null) return holding;
  return floor.rooms.reduce<HomeMapRoom | null>(
    (best, room) =>
      best === null || homeMapPolygonArea(room.polygon) > homeMapPolygonArea(best.polygon)
        ? room
        : best,
    null,
  );
}

function openingSegments(floor: HomeMapFloor): HomeMapSegmentShape[] {
  return floor.openings.flatMap((opening) => {
    const wall = floor.walls.find((entry) => entry.id === opening.wallId);
    return wall === undefined ? [] : [homeMapOpeningEnds(wall, opening.offset, opening.width)];
  });
}

export interface PlaceInput {
  readonly floor: HomeMapFloor;
  readonly room: HomeMapRoom;
  readonly modelId: string;
  readonly spec: ModelSpec;
  readonly id: string;
  readonly specOf: SpecOf;
}

export function placeOp(input: PlaceInput): HomeMapOp | null {
  const { floor, room, modelId, spec, id, specOf } = input;
  const occupants = floor.objects
    .filter((item) => homeMapRoomAt([room], item.at) !== null)
    .map((item) => ({ modelId: item.modelId, at: item.at, rotation: item.rotation }));
  const result = homeMapAutoPlace({
    floorId: floor.id,
    room: { polygon: room.polygon, ceilingHeight: room.ceilingHeight ?? floor.ceilingHeight },
    openings: openingSegments(floor),
    occupants,
    devices: [{ deviceId: id, modelId, role: 'generic' }],
    facts: (each) => autoFactsOf(each, each === modelId ? spec : specOf(each)),
  });
  const spot = result.placements[0];
  if (spot === undefined) return null;
  const elevation = spot.mount === 'floor' ? 0 : spot.height;
  const element = pieceElement({
    id,
    modelId,
    spec,
    at: spot.at,
    rotation: spot.rotation,
    elevation,
  });
  return { op: 'add', kind: 'object', floorId: floor.id, element };
}

export interface PiecePose {
  readonly id: string;
  readonly modelId: string;
  readonly spec: ModelSpec;
  readonly at: HomeMapVec;
  readonly rotation: number;
  readonly elevation: number;
}

export function pieceElement(pose: PiecePose): HomeMapObject {
  return HOME_MAP_OBJECT_WRITE.parse({
    id: pose.id,
    modelId: pose.modelId,
    finish: pose.spec.defaultFinish ?? null,
    params: {},
    at: { x: pose.at.x, y: pose.at.y },
    rotation: pose.rotation,
    elevation: pose.elevation,
    label: null,
    locked: false,
    origin: { kind: 'hand' },
  });
}

export function pieceFootprint(
  modelId: string,
  spec: ModelSpec,
): { readonly w: number; readonly d: number } {
  const draft = pieceElement({
    id: modelId,
    modelId,
    spec,
    at: { x: 0, y: 0 },
    rotation: 0,
    elevation: 0,
  });
  const box = boxOf(draft, (id) => (id === modelId ? spec : undefined));
  return { w: box.w, d: box.d };
}

export function armedNotice(title: string): string {
  return `Tap the floor to place the ${title.toLowerCase()}`;
}

export function placeOverlay(
  base: EditOverlay,
  footprint: { readonly w: number; readonly d: number },
): EditOverlay {
  return {
    ...base,
    mode: 'place',
    selection: [],
    gizmo: null,
    handles: [],
    ghosts: [],
    labels: [],
    place: { kind: 'object', footprint, rotation: 0 },
  };
}

export type HeightOf = (objectId: string) => number | null;

export function supportTop(
  floor: HomeMapFloor,
  heightOf: HeightOf,
  point: HomeMapVec,
  specOf: SpecOf,
): number {
  return floor.objects
    .filter((object) => object.wall === undefined)
    .reduce((top, object) => {
      const height = heightOf(object.id);
      if (height === null || hitObject({ ...floor, objects: [object] }, point, specOf) === null) {
        return top;
      }
      return Math.max(top, object.elevation + height);
    }, 0);
}

export function pieceElevation(modelId: string, spec: ModelSpec, top: number): number {
  const facts = autoFactsOf(modelId, spec);
  if (facts.mount === 'floor') return 0;
  return facts.mount === 'table' ? top : facts.defaultHeightM;
}
