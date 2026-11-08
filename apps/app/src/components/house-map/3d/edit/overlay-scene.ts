import type { EditFloorWire, EditGhost, EditOverlay, EditPathGhost } from '../map-3d-edit-protocol';
import type { Point } from '../render-core-gestures';
import { GIZMO_SIZES, type GizmoView } from './gizmo';
import type { EditPreview } from './edit-drags';
import { gizmoDrawing, type GizmoDrawing } from './overlay-gizmo';
import {
  HANDLE_LABELS,
  LIVE_PILL_GAP_PX,
  PICKED_UP_TEXT,
  PILL_HEIGHT_PX,
  PILL_STACK_PX,
  cursorOf,
  guideUnder,
  handleSizeOf,
  handleStateOf,
  pathOf,
  pillAlong,
  pillBox,
  targetBox,
  type Box,
  type Disc,
  type DrawnHandle,
  type DrawnPath,
  type DrawnPill,
  type OverlayDrag,
  type OverlayScene,
  type TouchPair,
  type YieldZones,
} from './overlay-model';
import type { PointerHover } from './pointer';
import { facePaths, hoverDrawn, screenAll, screenAt, twistText } from './overlay-surfaces';
import type { MovePose, MoveSize } from './sessions-factory';
import type { EditLabel } from './sessions';
import type { ObjectPose, ObjectPreview } from '../render-core-objects';

export interface OverlayInput {
  readonly view: GizmoView;
  readonly drag: OverlayDrag;
  readonly pickUp: string | null;
  readonly hover: PointerHover | null;
  readonly touches: TouchPair | null;
  readonly avoid: readonly Box[];
}

interface Posed {
  readonly pose: MovePose;
  readonly size: MoveSize | null;
  readonly tall: number | null;
}

interface Marks {
  readonly ghosts: readonly EditPathGhost[];
  readonly labels: readonly EditLabel[];
}

const NO_MARKS: Marks = { ghosts: [], labels: [] };

const TOUCH_DISC_PX = 44;

function posedOf(preview: EditPreview | null): Posed | null {
  if (preview === null || preview.family === 'shape') return null;
  const tall = preview.family === 'gizmo' ? preview.preview.tall : null;
  return { pose: preview.preview.pose, size: preview.preview.size, tall };
}

function marksOf(preview: EditPreview | null): Marks {
  if (preview === null) return NO_MARKS;
  if (preview.family === 'shape') return preview.preview;
  return { ghosts: preview.preview.guides, labels: preview.preview.labels };
}

function posedFloor(edit: EditFloorWire, posed: Posed): EditFloorWire {
  const { pose, size, tall } = posed;
  const { floor } = edit;
  const objects = floor.objects.map((object) =>
    object.id === pose.id
      ? {
          ...object,
          at: { ...object.at, ...pose.at },
          rotation: pose.rotation,
          elevation: pose.height,
        }
      : object,
  );
  const placements = floor.placements.map((placement) =>
    placement.deviceId === pose.id
      ? {
          ...placement,
          at: { ...placement.at, ...pose.at },
          rotation: pose.rotation,
          height: pose.height,
        }
      : placement,
  );
  const box = edit.boxes[pose.id];
  const boxes =
    box === undefined || size === null
      ? edit.boxes
      : { ...edit.boxes, [pose.id]: { w: size.w, d: size.d, h: tall ?? box.h } };
  return { floor: { ...floor, objects, placements }, boxes };
}

function posedOverlay(overlay: EditOverlay, pose: MovePose): EditOverlay {
  if (overlay.gizmo === null) return overlay;
  const centre = { x: pose.at.x, y: pose.at.y, height: pose.height };
  return { ...overlay, gizmo: { ...overlay.gizmo, centre, turn: pose.rotation } };
}

export function previewedView(view: GizmoView, preview: EditPreview | null): GizmoView {
  const posed = posedOf(preview);
  if (posed === null) return view;
  return {
    ...view,
    edit: posedFloor(view.edit, posed),
    overlay: posedOverlay(view.overlay, posed.pose),
  };
}

function overlayHandles(view: GizmoView, input: OverlayInput): readonly DrawnHandle[] {
  if (view.overlay.readOnly) return [];
  const sizes = GIZMO_SIZES[view.breakpoint];
  return view.overlay.handles.flatMap((handle) => {
    const at = screenAt(view, handle.at);
    if (at === null) return [];
    const state = handleStateOf(handle.id, input.drag.grab, input.hover);
    const size = handleSizeOf(sizes.handlePx, state);
    const label = HANDLE_LABELS[handle.kind];
    return [
      {
        id: handle.id,
        kind: handle.kind,
        ...at,
        angle: 0,
        size,
        target: sizes.targetPx,
        state,
        label,
      },
    ];
  });
}

function ghostPaths(view: GizmoView, ghosts: readonly EditGhost[], key: string): DrawnPath[] {
  return ghosts.flatMap((ghost, index) => {
    const at = `${key}:${String(index)}`;
    if (ghost.shape === 'wall-face') return facePaths(view, ghost, at);
    const area = ghost.shape === 'polygon';
    const d = pathOf(screenAll(view, ghost.points), area);
    return [{ key: at, d, look: area ? 'ghost-area' : 'ghost', tone: ghost.tone, state: 'rest' }];
  });
}

function guideLines(
  view: GizmoView,
  ghosts: readonly EditPathGhost[],
): readonly (readonly Point[])[] {
  return ghosts.map((ghost) => screenAll(view, ghost.points));
}

function labelPills(view: GizmoView, labels: readonly EditLabel[], key: string): DrawnPill[] {
  return labels.flatMap((label, index) => {
    const at = screenAt(view, label.at);
    if (at === null) return [];
    const look: DrawnPill['look'] = label.tone === 'snap' ? 'snap' : 'label';
    return [{ key: `${key}:${String(index)}`, ...at, text: label.text, look, tone: label.tone }];
  });
}

function livePills(
  view: GizmoView,
  labels: readonly EditLabel[],
  gizmo: GizmoDrawing | null,
): readonly DrawnPill[] {
  const live = labels.filter((label) => label.tone !== 'snap');
  return labelPills(view, live, 'live').map((pill, index) => {
    const top = gizmo === null ? pill.y : Math.min(gizmo.top, pill.y);
    const y = top - LIVE_PILL_GAP_PX - PILL_HEIGHT_PX / 2 - index * PILL_STACK_PX;
    return { ...pill, x: gizmo === null ? pill.x : gizmo.centre.x, y, look: 'live' };
  });
}

function yieldOf(
  view: GizmoView,
  handles: readonly DrawnHandle[],
  gizmo: GizmoDrawing | null,
): Omit<YieldZones, 'hideLabels'> {
  const discs = [
    ...(gizmo?.discs ?? []),
    ...handles.map((handle) => ({ x: handle.x, y: handle.y, r: handle.target / 2 })),
  ];
  const drafting = view.overlay.mode === 'draw-points' || view.overlay.mode === 'draw-rect';
  return { discs, chips: drafting && handles.length > 0 ? 'hide' : 'fade' };
}

function pickUpPills(gizmo: GizmoDrawing | null, picked: boolean): readonly DrawnPill[] {
  if (gizmo === null || !picked) return [];
  const y = gizmo.top - LIVE_PILL_GAP_PX - PILL_HEIGHT_PX / 2;
  return [{ key: 'tip', x: gizmo.centre.x, y, text: PICKED_UP_TEXT, look: 'tip', tone: 'accent' }];
}

interface Twist {
  readonly discs: readonly Disc[];
  readonly pill: DrawnPill | null;
}

function twistOf(input: OverlayInput, painted: GizmoView, posed: Posed | null): Twist | null {
  const { touches, drag } = input;
  if (touches === null || drag.grab?.kind !== 'body' || posed === null) return null;
  const discs = touches.map((touch) => ({ ...touch, r: TOUCH_DISC_PX / 2 }));
  const centre = screenAt(painted, { ...posed.pose.at, height: posed.pose.height });
  const text = twistText(input.view.edit, posed.pose, posed.size);
  if (centre === null || text === null) return { discs, pill: null };
  const top = Math.min(centre.y, ...discs.map((disc) => disc.y - disc.r));
  const y = top - LIVE_PILL_GAP_PX - PILL_HEIGHT_PX / 2;
  return { discs, pill: { key: 'twist', x: centre.x, y, text, look: 'live', tone: 'neutral' } };
}

function twistPills(twist: Twist | null): readonly DrawnPill[] {
  const pill = twist?.pill ?? null;
  return pill === null ? [] : [pill];
}

function pathGhosts(ghosts: readonly EditGhost[]): readonly EditPathGhost[] {
  return ghosts.flatMap((ghost) => (ghost.shape === 'wall-face' ? [] : [ghost]));
}

function settledPills(
  view: GizmoView,
  pills: readonly DrawnPill[],
  guides: readonly (readonly Point[])[],
  blocked: readonly Box[],
): readonly DrawnPill[] {
  const taken: Box[] = [...blocked];
  const { width, height } = view.viewport;
  return pills.map((pill) => {
    const guide = pill.look === 'live' || pill.look === 'tip' ? null : guideUnder(pill, guides);
    const placed =
      guide === null ? pill : pillAlong(pill, guide, { blocked: taken, width, height });
    taken.push(pillBox(placed));
    return placed;
  });
}

interface Layers {
  readonly gizmo: GizmoDrawing | null;
  readonly own: readonly DrawnHandle[];
  readonly marks: Marks;
  readonly twist: Twist | null;
}

function layersOf(input: OverlayInput, painted: GizmoView): Layers {
  const { view, drag } = input;
  const twist = twistOf(input, painted, posedOf(drag.preview));
  const startTurn = view.overlay.gizmo?.turn ?? 0;
  const gizmo =
    twist === null ? gizmoDrawing(painted, { drag, startTurn, hover: input.hover }) : null;
  return { gizmo, own: overlayHandles(painted, input), marks: marksOf(drag.preview), twist };
}

function placedPills(
  input: OverlayInput,
  painted: GizmoView,
  layers: Layers,
  handles: readonly DrawnHandle[],
): readonly DrawnPill[] {
  const { overlay } = input.view;
  const { marks } = layers;
  const guides = guideLines(painted, [...pathGhosts(overlay.ghosts), ...marks.ghosts]);
  const snaps = marks.labels.filter((label) => label.tone === 'snap');
  const pills = [
    ...labelPills(painted, overlay.labels, 'label'),
    ...labelPills(painted, snaps, 'snap'),
  ];
  return settledPills(painted, pills, guides, [...input.avoid, ...handles.map(targetBox)]);
}

export function overlaySceneOf(input: OverlayInput): OverlayScene {
  const { view, drag } = input;
  const painted = previewedView(view, drag.preview);
  const layers = layersOf(input, painted);
  const { gizmo, own, marks, twist } = layers;
  const picked = input.pickUp !== null && drag.grab === null;
  const hovered = hoverDrawn(painted, input.hover, drag.grab);
  const handles = [...(gizmo?.handles ?? []), ...own];
  return {
    handles,
    paths: [
      ...ghostPaths(painted, view.overlay.ghosts, 'ghost'),
      ...hovered.paths,
      ...ghostPaths(painted, marks.ghosts, 'guide'),
      ...(gizmo?.paths ?? []),
    ],
    pills: [
      ...placedPills(input, painted, layers, handles),
      ...livePills(painted, marks.labels, gizmo),
      ...hovered.pills,
      ...twistPills(twist),
      ...pickUpPills(gizmo, picked),
    ],
    pulse: picked && gizmo !== null ? gizmo.centre : null,
    touches: twist?.discs ?? [],
    cursor: cursorOf(drag.grab, input.hover),
    yieldTo: { ...yieldOf(painted, own, gizmo), hideLabels: drag.grab !== null },
  };
}

export function settled(preview: EditPreview | null): EditPreview | null {
  if (preview === null) return null;
  switch (preview.family) {
    case 'move':
      return { family: 'move', preview: { ...preview.preview, guides: [], labels: [] } };
    case 'gizmo':
      return { family: 'gizmo', preview: { ...preview.preview, guides: [], labels: [] } };
    case 'shape':
      return null;
  }
}

interface PosedItem {
  readonly id: string;
  readonly pose: ObjectPose;
}

export function posedItemOf(preview: EditPreview | null): PosedItem | null {
  if (preview === null || preview.family === 'shape') return null;
  const { pose, size } = preview.preview;
  const tall = preview.family === 'gizmo' ? preview.preview.tall : null;
  return {
    id: pose.id,
    pose: {
      at: pose.at,
      rotationDeg: pose.rotation,
      height: pose.height,
      wall: pose.wall,
      size: size === null ? null : { w: size.w, d: size.d, h: tall },
    },
  };
}

export function samePreviews(a: readonly ObjectPreview[], b: readonly ObjectPreview[]): boolean {
  return (
    a.length === b.length &&
    a.every((each, index) => {
      const other = b[index];
      return (
        other?.id === each.id &&
        other.lift === each.lift &&
        JSON.stringify(other.pose) === JSON.stringify(each.pose)
      );
    })
  );
}
