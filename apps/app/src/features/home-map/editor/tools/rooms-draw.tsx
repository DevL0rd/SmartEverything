import { randomUUID } from 'expo-crypto';
import { useRef, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { homeMapPolygonArea, homeMapRoomAt, type HomeMap } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { Button } from '../../../../components/button';
import { Segmented, type SegmentedOption } from '../../../../components/segmented';
import { Text } from '../../../../components/text';
import {
  NO_EDIT_OVERLAY,
  type EditEvent,
  type EditFrame,
  type EditOverlay,
} from '../../../../components/house-map/3d/map-3d-edit-protocol';
import type { RenderBounds, RenderFloor } from '../../../../components/house-map/render-scene';
import { selectionTick } from '../../../../platform/haptics';
import type { HomeMapEditing } from '../../data/home-map-query';
import type { EditorNotice } from '../mount-edit';
import {
  draftCorners,
  draftGhosts,
  draftLabels,
  draftShapes,
  exampleMarks,
  guideGhosts,
  guideLabels,
  type ExampleMarks,
} from './rooms-draw-geometry';
import {
  DEFAULT_DRAW_GRID_M,
  IDLE_DRAW,
  chooseShape,
  cornerCount,
  draftPoints,
  finishPolygon,
  moveCorner,
  tapDraw,
  undoCorner,
  type DrawContext,
  type DrawFloor,
  type DrawShapeKind,
  type DrawStep,
  type RoomsDrawState,
} from './rooms-draw-model';

export const DRAW_SHEET_M = { width: 10, depth: 8, margin: 1 } as const;

export const DRAW_FRAME_KEY = 'rooms-draw';

export const DRAW_HINTS = {
  rect: 'Tap two opposite corners to draw a room',
  points: 'Tap each corner to draw a room',
  rectNext: 'Tap the opposite corner',
  pointsNext: 'Tap the next corner',
  pointsClose: 'Tap the first corner or Finish room to close',
} as const;

export interface RoomsDraw {
  readonly state: RoomsDrawState;
  readonly floor: DrawFloor | null;
  readonly gridM: number;
  readonly selected: string | null;
  readonly readOnly: boolean;
  readonly apply: (step: (state: RoomsDrawState) => DrawStep) => void;
}

export interface RoomsDrawInput {
  readonly map: HomeMap;
  readonly floorId: string | null;
  readonly editing: HomeMapEditing;
  readonly readOnly: boolean;
  readonly selected: string | null;
  readonly onSelect: (id: string) => void;
}

export function drawFloorOf(map: HomeMap, floorId: string | null): DrawFloor | null {
  const floor = map.floors.find((item) => item.id === floorId);
  return floor === undefined ? null : { id: floor.id, rooms: floor.rooms, walls: floor.walls };
}

export function useRoomsDraw(input: RoomsDrawInput): RoomsDraw {
  const current = useRef<RoomsDrawState>(IDLE_DRAW);
  const [state, setState] = useState<RoomsDrawState>(IDLE_DRAW);
  const { editing, onSelect } = input;
  return {
    state,
    floor: drawFloorOf(input.map, input.floorId),
    gridM: DEFAULT_DRAW_GRID_M,
    selected: input.selected,
    readOnly: input.readOnly,
    apply: (run): void => {
      const step = run(current.current);
      current.current = step.state;
      setState(step.state);
      if (step.ops.length > 0) background(editing.edit(step.ops), 'home_map.rooms_draw_failed');
      if (step.select !== null) onSelect(step.select);
    },
  };
}

export function drawBounds(bounds: RenderBounds | null): RenderBounds {
  const { width, depth, margin } = DRAW_SHEET_M;
  if (bounds === null) return { minX: 0, minY: 0, maxX: width, maxY: depth };
  return {
    minX: bounds.minX - margin,
    minY: bounds.minY - margin,
    maxX: bounds.maxX + margin,
    maxY: bounds.maxY + margin,
  };
}

function selectedRoom(draw: RoomsDraw): DrawFloor['rooms'][number] | null {
  return draw.floor?.rooms.find((room) => room.id === draw.selected) ?? null;
}

function noStep(state: RoomsDrawState): DrawStep {
  return { state, ops: [], select: null };
}

function contextOf(draw: RoomsDraw, floor: DrawFloor): DrawContext {
  return { floor, gridM: draw.gridM, newId: () => randomUUID() };
}

export interface DrawOverlayArgs {
  readonly floor: RenderFloor;
  readonly framed: boolean;
}

const NO_MARKS: ExampleMarks = { ghosts: [], labels: [] };

function exampleOf(draw: RoomsDraw, bounds: RenderBounds): ExampleMarks {
  const empty = draw.floor?.rooms.length === 0;
  return empty && draw.state.draft.kind === 'idle' && !draw.readOnly
    ? exampleMarks(bounds)
    : NO_MARKS;
}

function frameOf(draw: RoomsDraw, args: DrawOverlayArgs): EditFrame | null {
  if (!args.framed || draw.floor === null) return null;
  const key = `${DRAW_FRAME_KEY}:${draw.floor.id}`;
  return { key, bounds: drawBounds(args.floor.bounds), top: false };
}

function selectionOf(draw: RoomsDraw): string[] {
  const room = draw.state.draft.kind === 'idle' ? selectedRoom(draw) : null;
  return room === null ? [] : [room.id];
}

export function roomsDrawOverlay(draw: RoomsDraw, args: DrawOverlayArgs): EditOverlay {
  const { shape, draft, guides } = draw.state;
  const points = draftPoints(draft);
  const example = exampleOf(draw, drawBounds(args.floor.bounds));
  return {
    ...NO_EDIT_OVERLAY,
    mode: shape === 'rect' ? 'draw-rect' : 'draw-points',
    selection: selectionOf(draw),
    handles: draftCorners(points).map((corner) => corner.handle),
    shapes: [...draftShapes(points)],
    ghosts: [...draftGhosts(points), ...guideGhosts(guides), ...example.ghosts],
    labels: [...draftLabels(points), ...guideLabels(guides), ...example.labels],
    readOnly: draw.readOnly,
    frame: frameOf(draw, args),
  };
}

type TapEvent = Extract<EditEvent, { readonly type: 'tap' }>;

type VertexEvent = Extract<EditEvent, { readonly type: 'vertex' }>;

function onTap(draw: RoomsDraw, floor: DrawFloor, event: TapEvent): void {
  const roomAt = homeMapRoomAt(floor.rooms, event.point)?.id ?? null;
  if (draw.readOnly) {
    if (roomAt !== null) draw.apply((state) => ({ state, ops: [], select: roomAt }));
    return;
  }
  selectionTick();
  const tap = { at: event.point, metresPerPx: event.metresPerPx };
  draw.apply((state) => tapDraw(state, contextOf(draw, floor), tap, roomAt));
}

function onVertex(draw: RoomsDraw, event: VertexEvent): void {
  draw.apply((state) => {
    const corner = draftCorners(draftPoints(state.draft)).find(
      (each) => each.handle.id === event.handleId,
    );
    return noStep(corner === undefined ? state : moveCorner(state, corner.index, event.point));
  });
}

export function roomsDrawEdit(draw: RoomsDraw, event: EditEvent): void {
  const { floor } = draw;
  if (floor === null) return;
  if (event.type === 'tap') onTap(draw, floor, event);
  else if (event.type === 'vertex') onVertex(draw, event);
  else if (event.type === 'snap' && event.engaged) selectionTick();
}

function hintOf(state: RoomsDrawState): string {
  const corners = cornerCount(state.draft);
  if (state.shape === 'rect') return corners === 0 ? DRAW_HINTS.rect : DRAW_HINTS.rectNext;
  if (corners === 0) return DRAW_HINTS.points;
  return corners < 3 ? DRAW_HINTS.pointsNext : DRAW_HINTS.pointsClose;
}

export function roomsDrawNotice(draw: RoomsDraw): EditorNotice | null {
  return draw.readOnly ? null : { text: hintOf(draw.state), tone: 'info' };
}

export function roomsDrawing(draw: RoomsDraw): boolean {
  return draw.state.draft.kind !== 'idle';
}

export function roomsDraftOpen(draw: RoomsDraw): boolean {
  return roomsDrawing(draw) || draw.floor?.rooms.length === 0;
}

const SHAPE_OPTIONS: readonly SegmentedOption<DrawShapeKind>[] = [
  { value: 'rect', label: 'Rectangle', icon: 'square' },
  { value: 'points', label: 'Any shape', icon: 'pencil' },
];

function ShapeChoice({ draw }: { readonly draw: RoomsDraw }): ReactNode {
  return (
    <Segmented
      label="Room shape"
      fill
      value={draw.state.shape}
      disabled={draw.readOnly || roomsDrawing(draw)}
      options={SHAPE_OPTIONS}
      onChange={(shape): void => {
        draw.apply(() => noStep(chooseShape(shape)));
      }}
    />
  );
}

function FirstRoom({ draw }: { readonly draw: RoomsDraw }): ReactNode {
  return (
    <View className="gap-3 rounded-md bg-surface-2 p-3">
      <View className="gap-1">
        <Text variant="body-strong">Draw your first room</Text>
        <Text variant="footnote" tone="variant">
          Tap two opposite corners for a rectangle, or tap each corner of any shape.
        </Text>
      </View>
      <ShapeChoice draw={draw} />
    </View>
  );
}

function DraftRow({ draw }: { readonly draw: RoomsDraw }): ReactNode {
  const { draft } = draw.state;
  const { floor } = draw;
  const corners = cornerCount(draft);
  const ready = draft.kind === 'polygon' && corners >= 3 && floor !== null && !draw.readOnly;
  return (
    <View className="gap-2 rounded-md bg-surface-2 p-3">
      <Text variant="body-strong" accessibilityLiveRegion="polite">
        {`${String(corners)} ${corners === 1 ? 'corner' : 'corners'}`}
      </Text>
      <View className="flex-row gap-2">
        <Button
          label="Undo corner"
          icon="undo"
          variant="tonal"
          grow
          disabled={draw.readOnly}
          onPress={(): void => {
            draw.apply((state) => noStep(undoCorner(state)));
          }}
        />
        <Button
          label="Finish room"
          icon="check"
          grow
          disabled={!ready}
          onPress={(): void => {
            if (floor === null) return;
            draw.apply((state) => finishPolygon(state, { floor, newId: () => randomUUID() }));
          }}
        />
      </View>
    </View>
  );
}

function RoomFacts({ draw }: { readonly draw: RoomsDraw }): ReactNode {
  const room = selectedRoom(draw);
  if (room === null) return null;
  const area = homeMapPolygonArea(room.polygon);
  return (
    <View className="gap-1 rounded-md bg-surface-2 p-3">
      <Text variant="body-strong">{`${area.toFixed(1)} m²`}</Text>
      <Text variant="footnote" tone="variant">
        {draw.readOnly
          ? 'Reshaping is paused while offline.'
          : 'Drag a corner or the middle of an edge to reshape this room.'}
      </Text>
    </View>
  );
}

export function RoomsDrawPanel({ draw }: { readonly draw: RoomsDraw }): ReactNode {
  const drawing = roomsDrawing(draw);
  const first = draw.floor?.rooms.length === 0 && !drawing;
  return (
    <View className="gap-3">
      {first ? <FirstRoom draw={draw} /> : <ShapeChoice draw={draw} />}
      {drawing ? <DraftRow draw={draw} /> : <RoomFacts draw={draw} />}
    </View>
  );
}
