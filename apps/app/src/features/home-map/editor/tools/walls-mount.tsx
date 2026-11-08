import { useReducer, type ReactNode } from 'react';
import {
  homeMapOpeningEnds,
  homeMapRoomAt,
  homeMapWallLength,
  homeMapWallPointAt,
  type HomeMap,
  type HomeMapFloor,
  type HomeMapOpening,
  type HomeMapVec,
  type HomeMapWall,
} from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import {
  NO_EDIT_OVERLAY,
  type EditFrame,
  type EditOverlay,
  type EditPathGhost,
} from '../../../../components/house-map/3d/map-3d-edit-protocol';
import { metresText } from '../../../../components/house-map/edit/gestures';
import { HIT_RADIUS_PX } from '../../../../components/house-map/edit/radii';
import { useIsPhone } from '../../../../design/size-class';
import { useRooms } from '../../../../store/selectors';
import type { HomeMapEditing } from '../../data/home-map-query';
import {
  NO_EDIT_FIELDS,
  type EditCommit,
  type EditorNotice,
  type MountArgs,
  type MountEditFields,
} from '../mount-edit';
import { openingHint } from './openings-panel';
import { WallsOpeningsPanel, wallsOpeningsEdit } from './walls-openings';
import {
  INITIAL_WALLS_OPENINGS,
  pickedPart,
  reduceWallsOpenings,
  roomSide,
  wallNormal,
  type WallsOpeningsContext,
  type WallsOpeningsState,
} from './walls-openings-model';

export interface WallsMountInput {
  readonly map: HomeMap;
  readonly floorId: string | null;
  readonly editing: HomeMapEditing;
  readonly commit: EditCommit;
  readonly readOnly: boolean;
}

export interface WallsMount extends MountEditFields {
  readonly panel: ReactNode;
}

export type MountWalls = (args: MountArgs) => WallsMount;

type Handle = EditOverlay['handles'][number];
type Label = EditOverlay['labels'][number];

interface Marks {
  readonly handles: Handle[];
  readonly ghosts: EditPathGhost[];
  readonly labels: Label[];
}

export const FINISH_TIP = 'Tap again to finish';
export const NEXT_TIP = 'Tap the next corner';
const TARGET_PX = 2 * HIT_RADIUS_PX;
const SLIDE_REACH = 0.75;
const FRAME_PAD_M = 0.5;

const at = (point: HomeMapVec): Handle['at'] => ({ x: point.x, y: point.y, height: 0 });

const shifted = (point: HomeMapVec, by: HomeMapVec, metres: number): HomeMapVec => ({
  x: point.x + by.x * metres,
  y: point.y + by.y * metres,
});

const reach = (state: WallsOpeningsState, px: number): number => (state.metresPerPx ?? 0) * px;

function band(from: HomeMapVec, to: HomeMapVec, thickness: number): EditPathGhost {
  const normal = wallNormal({ from, to });
  const half = thickness / 2;
  const points = [
    shifted(from, normal, half),
    shifted(to, normal, half),
    shifted(to, normal, -half),
    shifted(from, normal, -half),
  ].map(at);
  return { shape: 'polygon', points, tone: 'accent' };
}

function line(from: HomeMapVec, to: HomeMapVec, tone: EditPathGhost['tone']): EditPathGhost {
  return { shape: 'polyline', points: [at(from), at(to)], tone };
}

const middle = (from: HomeMapVec, to: HomeMapVec): HomeMapVec => ({
  x: (from.x + to.x) / 2,
  y: (from.y + to.y) / 2,
});

export function draftMarks(state: WallsOpeningsState): Marks {
  const { draft, thickness } = state;
  const segments = draft.flatMap((to, index) => {
    const from = draft[index - 1];
    return from === undefined ? [] : [{ from, to }];
  });
  const last = draft.at(-1);
  const tip: readonly Label[] =
    last === undefined
      ? []
      : [{ at: at(last), text: draft.length > 1 ? FINISH_TIP : NEXT_TIP, tone: 'accent' }];
  return {
    handles: [],
    ghosts: segments.flatMap(({ from, to }) => [
      band(from, to, thickness),
      line(from, to, 'accent'),
    ]),
    labels: [
      ...segments.map(({ from, to }): Label => ({
        at: at(middle(from, to)),
        text: metresText(Math.hypot(to.x - from.x, to.y - from.y)),
        tone: 'neutral',
      })),
      ...tip,
    ],
  };
}

export function draftFrame(floor: HomeMapFloor, draft: readonly HomeMapVec[]): EditFrame | null {
  const first = draft[0];
  if (first === undefined) return null;
  const room = homeMapRoomAt(floor.rooms, first);
  const points = room === null ? draft : room.polygon.outer;
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  return {
    key: `walls:${room?.id ?? 'draft'}`,
    bounds: {
      minX: Math.min(...xs) - FRAME_PAD_M,
      minY: Math.min(...ys) - FRAME_PAD_M,
      maxX: Math.max(...xs) + FRAME_PAD_M,
      maxY: Math.max(...ys) + FRAME_PAD_M,
    },
    top: false,
  };
}

export function wallMarks(wall: HomeMapWall, state: WallsOpeningsState): Marks {
  const centre = middle(wall.from, wall.to);
  const ground = { kind: 'ground' } as const;
  const gap = wall.thickness / 2 + reach(state, TARGET_PX);
  return {
    handles: [
      ...(['from', 'to'] as const).map((end): Handle => ({
        id: `${wall.id}:${end}`,
        kind: 'point',
        at: at(wall[end]),
        surface: ground,
        target: { kind: 'wall-end', wallId: wall.id, end },
      })),
      {
        id: `${wall.id}:middle`,
        kind: 'plane',
        at: at(centre),
        surface: ground,
        target: { kind: 'wall-middle', wallId: wall.id },
      },
    ],
    ghosts: [],
    labels: [
      {
        at: at(shifted(centre, wallNormal(wall), gap)),
        text: metresText(homeMapWallLength(wall)),
        tone: 'neutral',
      },
    ],
  };
}

interface Span {
  readonly from: number;
  readonly to: number;
}

function barSpan(opening: HomeMapOpening, state: WallsOpeningsState): Span {
  const centre = opening.offset + opening.width / 2;
  const least = reach(state, TARGET_PX);
  return {
    from: Math.min(opening.offset, centre - least),
    to: Math.max(opening.offset + opening.width, centre + least),
  };
}

function openingHandle(
  opening: HomeMapOpening,
  part: 'body' | 'from' | 'to',
  point: HomeMapVec,
): Handle {
  return {
    id: `${opening.id}:${part}`,
    kind: part === 'body' ? 'axis-x' : 'side',
    at: at(point),
    surface: { kind: 'along-wall', wallId: opening.wallId },
    target: { kind: 'opening', openingId: opening.id, part },
  };
}

export function openingMarks(
  floor: HomeMapFloor,
  opening: HomeMapOpening,
  wall: HomeMapWall,
  state: WallsOpeningsState,
): Marks {
  const ends = homeMapOpeningEnds(wall, opening.offset, opening.width);
  const bars = barSpan(opening, state);
  const from = homeMapWallPointAt(wall, bars.from);
  const to = homeMapWallPointAt(wall, bars.to);
  const centre = middle(ends.from, ends.to);
  const side = shifted({ x: 0, y: 0 }, wallNormal(wall), roomSide(floor.rooms, wall));
  const off = wall.thickness / 2 + SLIDE_REACH * reach(state, TARGET_PX);
  const extensions = [
    ...(bars.from < opening.offset ? [line(ends.from, from, 'neutral')] : []),
    ...(bars.to > opening.offset + opening.width ? [line(ends.to, to, 'neutral')] : []),
  ];
  return {
    handles: [
      openingHandle(opening, 'from', from),
      openingHandle(opening, 'to', to),
      openingHandle(opening, 'body', shifted(centre, side, off)),
    ],
    ghosts: [band(ends.from, ends.to, wall.thickness), ...extensions],
    labels: [
      { at: at(shifted(centre, side, -off)), text: metresText(opening.width), tone: 'neutral' },
    ],
  };
}

function pickedOverlay(context: WallsOpeningsContext): EditOverlay {
  const { floor, state, readOnly } = context;
  const part = pickedPart(floor, state.picked);
  if (part === null || (context.mode === 'openings' && part.opening === null)) {
    return { ...NO_EDIT_OVERLAY, readOnly };
  }
  const marks =
    part.opening === null
      ? wallMarks(part.wall, state)
      : openingMarks(floor, part.opening, part.wall, state);
  const selection = [part.opening?.id ?? part.wall.id];
  return { ...NO_EDIT_OVERLAY, ...marks, selection, readOnly };
}

export function wallsOverlay(context: WallsOpeningsContext, phone: boolean): EditOverlay {
  const { floor, state, readOnly } = context;
  if (context.mode === 'openings' || pickedPart(floor, state.picked)?.opening === null) {
    return pickedOverlay(context);
  }
  const frame = phone ? draftFrame(floor, state.draft) : null;
  return { ...NO_EDIT_OVERLAY, ...draftMarks(state), mode: 'draw-points', frame, readOnly };
}

export function wallsNotice(context: WallsOpeningsContext): EditorNotice | null {
  const { state } = context;
  if (state.notice !== null) return { text: state.notice, tone: 'warning' };
  if (state.picked !== null) return null;
  if (context.mode === 'openings') return { text: openingHint(state.openingKind), tone: 'info' };
  return state.draft.length === 0
    ? { text: 'Tap the map to start a wall', tone: 'info' }
    : { text: 'Tap each corner, then tap the last one again to finish', tone: 'info' };
}

export function useWallsMount(input: WallsMountInput): MountWalls {
  const [state, dispatch] = useReducer(reduceWallsOpenings, INITIAL_WALLS_OPENINGS);
  const hubRooms = useRooms();
  const phone = useIsPhone();
  const floor = input.map.floors.find((item) => item.id === input.floorId);
  return ({ tool }) => {
    if (floor === undefined) return { ...NO_EDIT_FIELDS, panel: null };
    const context: WallsOpeningsContext = {
      ...{ mode: tool === 'openings' ? 'openings' : 'walls', floor, state, dispatch },
      ...{ readOnly: input.readOnly },
      edit: (ops): void => {
        background(input.editing.edit(ops), 'home_map.walls_edit_failed');
      },
    };
    const overlay = wallsOverlay(context, phone);
    return {
      ...NO_EDIT_FIELDS,
      overlay,
      onEdit: (event): void => {
        wallsOpeningsEdit({ context, commit: input.commit }, overlay, event);
      },
      notice: wallsNotice(context),
      draft: state.draft.length > 0,
      panel: <WallsOpeningsPanel context={context} hubRooms={hubRooms} />,
    };
  };
}
