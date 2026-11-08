import { randomUUID } from 'expo-crypto';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import {
  homeMapWallLength,
  type HomeMapOp,
  type HomeMapVec,
  type HomeMapWall,
} from '@smarteverything/domain';
import type {
  EditEvent,
  EditHandleTarget,
  EditOverlay,
} from '../../../../components/house-map/3d/map-3d-edit-protocol';
import { HIT_RADIUS_PX } from '../../../../components/house-map/edit/radii';
import { Button } from '../../../../components/button';
import { Segmented } from '../../../../components/segmented';
import { Text } from '../../../../components/text';
import { CmField } from '../list-editor/list-parts';
import {
  roomTitle,
  wallEndOp,
  wallLengthOp,
  wallUpdate,
  type HubRoom,
} from '../list-editor/rooms-walls-model';
import type { EditCommit } from '../mount-edit';
import { OpeningInspector } from './opening-inspector';
import { openingsTap, slideOp } from './opening-inspector-model';
import { Cm, OpeningsPanel } from './openings-panel';
import {
  draftFinish,
  pickedPart,
  pushWallOp,
  removeWallOps,
  snapWallPoint,
  splitWallOps,
  wallOps,
  wallRooms,
  type WallKind,
  type WallsOpeningsContext,
} from './walls-openings-model';

const newId = (): string => randomUUID();

const SNAP: { readonly fine: boolean; readonly free: boolean } = { fine: false, free: false };
const MIN_HEIGHT_M = 0.1;
const MIN_LENGTH_M = 0.01;

type TapEdit = Extract<EditEvent, { readonly type: 'tap' }>;

export interface WallsTool {
  readonly context: WallsOpeningsContext;
  readonly commit: EditCommit;
}

export function finishWalls(context: WallsOpeningsContext): void {
  const ops = wallOps(context.floor.id, context.state.draft, context.state, newId);
  if (ops.length > 0) context.edit(ops);
  context.dispatch({ type: 'cancel' });
}

function draftTap(context: WallsOpeningsContext, point: HomeMapVec, radius: number): void {
  const { draft } = context.state;
  const finish = draftFinish(draft, point, radius);
  if (finish === 'last') {
    finishWalls(context);
    return;
  }
  const first = draft[0];
  if (finish === 'first' && first !== undefined) {
    finishWalls({ ...context, state: { ...context.state, draft: [...draft, first] } });
    return;
  }
  context.dispatch({ type: 'point', point: snapWallPoint(point, context.floor, draft, SNAP) });
}

function nearEnd(wall: HomeMapWall, point: HomeMapVec, radius: number): boolean {
  return [wall.from, wall.to].some((end) => Math.hypot(end.x - point.x, end.y - point.y) <= radius);
}

function tapWalls(context: WallsOpeningsContext, tap: TapEdit): void {
  const radius = HIT_RADIUS_PX * tap.metresPerPx;
  if (context.state.draft.length > 0) {
    if (!context.readOnly) draftTap(context, tap.point, radius);
    return;
  }
  const { hit } = tap;
  const wall =
    hit.kind === 'wall' ? (context.floor.walls.find((item) => item.id === hit.id) ?? null) : null;
  if (wall !== null && !nearEnd(wall, tap.point, radius)) {
    context.dispatch({ type: 'pick', picked: { kind: 'wall', id: wall.id } });
  } else if (context.state.picked !== null) {
    context.dispatch({ type: 'pick', picked: null });
  } else if (!context.readOnly) {
    draftTap(context, tap.point, radius);
  }
}

export function wallsOpeningsTap(context: WallsOpeningsContext, tap: TapEdit): void {
  context.dispatch({ type: 'scale', metresPerPx: tap.metresPerPx });
  if (context.mode === 'walls') tapWalls(context, tap);
  else openingsTap(context, tap);
}

function targetOf(overlay: EditOverlay, handleId: string): EditHandleTarget | null {
  return overlay.handles.find((handle) => handle.id === handleId)?.target ?? null;
}

function wallOf(context: WallsOpeningsContext, id: string): HomeMapWall | null {
  return context.floor.walls.find((wall) => wall.id === id) ?? null;
}

function vertexOps(
  context: WallsOpeningsContext,
  target: EditHandleTarget | null,
  point: HomeMapVec,
): readonly HomeMapOp[] {
  if (target?.kind !== 'wall-end') return [];
  const wall = wallOf(context, target.wallId);
  const op = wall === null ? null : wallEndOp(context.floor.id, wall, target.end, point);
  return op === null ? [] : [op];
}

function edgeOps(
  context: WallsOpeningsContext,
  target: EditHandleTarget | null,
  offset: number,
): readonly HomeMapOp[] {
  if (target?.kind !== 'wall-middle') return [];
  const wall = wallOf(context, target.wallId);
  const op = wall === null ? null : pushWallOp(context.floor.id, wall, offset);
  return op === null ? [] : [op];
}

function handleOps(
  context: WallsOpeningsContext,
  overlay: EditOverlay,
  event: Extract<EditEvent, { readonly type: 'vertex' | 'edge' }>,
): readonly HomeMapOp[] {
  const target = targetOf(overlay, event.handleId);
  return event.type === 'vertex'
    ? vertexOps(context, target, event.point)
    : edgeOps(context, target, event.offset);
}

function slideOps(
  context: WallsOpeningsContext,
  event: Extract<EditEvent, { readonly type: 'slide' }>,
): readonly HomeMapOp[] {
  const opening = context.floor.openings.find((item) => item.id === event.id);
  const op = opening === undefined ? null : slideOp(context.floor.id, opening, event);
  return op === null ? [] : [op];
}

export function wallsOpeningsEdit(tool: WallsTool, overlay: EditOverlay, event: EditEvent): void {
  const { context, commit } = tool;
  if (event.type === 'tap') {
    wallsOpeningsTap(context, event);
  } else if (event.type === 'vertex' || event.type === 'edge') {
    commit(event.seq, context.readOnly ? [] : handleOps(context, overlay, event));
  } else if (event.type === 'slide') {
    commit(event.seq, context.readOnly ? [] : slideOps(context, event));
  }
}

const WALL_KINDS: readonly { readonly value: WallKind; readonly label: string }[] = [
  { value: 'solid', label: 'Solid' },
  { value: 'half', label: 'Half' },
  { value: 'glass', label: 'Glass' },
  { value: 'railing', label: 'Railing' },
];

interface StyleValues {
  readonly thickness: number;
  readonly height: number;
  readonly kind: WallKind;
}

interface StyleChange {
  readonly thickness: (value: number) => void;
  readonly height: (value: number) => void;
  readonly kind: (value: WallKind) => void;
}

function WallStyle({
  values,
  change,
  disabled,
}: {
  readonly values: StyleValues;
  readonly change: StyleChange;
  readonly disabled: boolean;
}): ReactNode {
  return (
    <>
      <Cm
        label="Thickness"
        value={values.thickness}
        min={0.02}
        max={1}
        disabled={disabled}
        onChange={change.thickness}
      />
      <CmField
        label="Height"
        value={values.height}
        min={MIN_HEIGHT_M}
        disabled={disabled}
        onChange={change.height}
      />
      <Segmented
        label="Wall kind"
        fill
        value={values.kind}
        disabled={disabled}
        options={WALL_KINDS}
        onChange={change.kind}
      />
    </>
  );
}

function DrawPanel({ context }: { readonly context: WallsOpeningsContext }): ReactNode {
  const { state, floor, dispatch } = context;
  const values = {
    thickness: state.thickness,
    height: state.height ?? floor.ceilingHeight,
    kind: state.wallKind,
  };
  const change: StyleChange = {
    thickness: (thickness) => {
      dispatch({ type: 'style', patch: { thickness } });
    },
    height: (height) => {
      dispatch({ type: 'style', patch: { height } });
    },
    kind: (kind) => {
      dispatch({ type: 'style', patch: { wallKind: kind } });
    },
  };
  return (
    <View className="gap-3">
      <WallStyle values={values} change={change} disabled={context.readOnly} />
      <View className="flex-row gap-2">
        <Button
          label="Undo point"
          icon="undo"
          variant="tonal"
          grow
          disabled={state.draft.length === 0 || context.readOnly}
          onPress={(): void => {
            dispatch({ type: 'back' });
          }}
        />
        <Button
          label="Finish wall"
          icon="check"
          grow
          disabled={state.draft.length < 2 || context.readOnly}
          onPress={(): void => {
            finishWalls(context);
          }}
        />
      </View>
    </View>
  );
}

export function wallTitle(
  context: Pick<WallsOpeningsContext, 'floor'>,
  wall: HomeMapWall,
  hubRooms: readonly HubRoom[],
): string {
  const { rooms } = context.floor;
  const names = wallRooms(rooms, wall).map((room) =>
    roomTitle(room, hubRooms, rooms.indexOf(room)),
  );
  return names.length === 0 ? 'Wall' : `Wall · ${names.join(' and ')}`;
}

function WallActions({
  context,
  wall,
}: {
  readonly context: WallsOpeningsContext;
  readonly wall: HomeMapWall;
}): ReactNode {
  return (
    <View className="flex-row flex-wrap gap-2">
      <Button
        label="Split wall"
        icon="scissors"
        variant="tonal"
        grow
        disabled={context.readOnly}
        onPress={(): void => {
          const ops = splitWallOps(context.floor, wall, newId);
          if (ops.length > 0) context.edit(ops);
        }}
      />
      <Button
        label="Delete wall"
        icon="trash"
        variant="destructive"
        grow
        disabled={context.readOnly}
        onPress={(): void => {
          context.edit(removeWallOps(context.floor, wall.id));
          context.dispatch({ type: 'pick', picked: null });
        }}
      />
    </View>
  );
}

function WallInspector({
  context,
  wall,
  hubRooms,
}: {
  readonly context: WallsOpeningsContext;
  readonly wall: HomeMapWall;
  readonly hubRooms: readonly HubRoom[];
}): ReactNode {
  const floorId = context.floor.id;
  const send = (op: HomeMapOp | null): void => {
    if (op !== null) context.edit([op]);
  };
  const values = {
    thickness: wall.thickness,
    height: wall.height ?? context.floor.ceilingHeight,
    kind: wall.kind,
  };
  const change: StyleChange = {
    thickness: (thickness) => {
      send(wallUpdate(floorId, wall.id, { thickness }));
    },
    height: (height) => {
      send(wallUpdate(floorId, wall.id, { height }));
    },
    kind: (kind) => {
      send(wallUpdate(floorId, wall.id, { kind }));
    },
  };
  return (
    <View className="gap-3">
      <Text variant="body-strong" numberOfLines={2}>
        {wallTitle(context, wall, hubRooms)}
      </Text>
      <CmField
        label="Length"
        value={homeMapWallLength(wall)}
        min={MIN_LENGTH_M}
        disabled={context.readOnly}
        onChange={(length): void => {
          send(wallLengthOp(floorId, wall, length));
        }}
      />
      <WallStyle values={values} change={change} disabled={context.readOnly} />
      <WallActions context={context} wall={wall} />
    </View>
  );
}

export function WallsOpeningsPanel({
  context,
  hubRooms,
}: {
  readonly context: WallsOpeningsContext;
  readonly hubRooms: readonly HubRoom[];
}): ReactNode {
  const part = pickedPart(context.floor, context.state.picked);
  if (context.mode === 'walls') {
    return part?.opening === null ? (
      <WallInspector context={context} wall={part.wall} hubRooms={hubRooms} />
    ) : (
      <DrawPanel context={context} />
    );
  }
  return part?.opening ? (
    <OpeningInspector context={context} opening={part.opening} wall={part.wall} />
  ) : (
    <OpeningsPanel context={context} />
  );
}
