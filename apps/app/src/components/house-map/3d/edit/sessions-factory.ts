import type { Ray } from 'three';
import {
  HOME_MAP_ROTATION_STEP_DEG,
  homeMapPinchTwist,
  homeMapSnapRotation,
} from '@smarteverything/domain/home-map-edit-core';
import type { HomeMapVec } from '@smarteverything/domain/home-map-geometry';
import type { HomeMapWallAttachment } from '@smarteverything/domain/home-map-elements';
import type { Modifiers, PinchTwist } from '../../edit/gestures';
import type { EditPathGhost } from '../map-3d-edit-protocol';
import type { DragSession, DragStart, EditEventDraft, StartDrag } from './pointer';
import {
  flatGrabOf,
  moveItemOf,
  placeFlat,
  rayAt,
  wallSnapKey,
  type EditLabel,
  type MoveGrab,
  type MoveItem,
  type MoveStep,
  type MoveView,
  type Placed,
} from './sessions';
import { placeWall, wallGrabOf } from './sessions-wall';
import type { Point } from '../render-core-gestures';

export interface MovePose {
  readonly id: string;
  readonly at: HomeMapVec;
  readonly rotation: number;
  readonly height: number;
  readonly wall: HomeMapWallAttachment | null;
}

export interface MoveSize {
  readonly w: number;
  readonly d: number;
}

export interface MovePreview {
  readonly pose: MovePose;
  readonly size: MoveSize | null;
  readonly guides: readonly EditPathGhost[];
  readonly labels: readonly EditLabel[];
}

export interface MoveHooks {
  readonly view: () => MoveView;
  readonly preview: (preview: MovePreview | null) => void;
}

interface Twisted {
  readonly rotation: number;
  readonly size: MoveSize | null;
}

export class HandleDragUnavailableError extends Error {
  constructor(readonly handleId: string) {
    super(`No drag session handles the edit handle ${handleId}`);
    this.name = 'HandleDragUnavailableError';
  }
}

export function grabOf(view: MoveView, item: MoveItem, ray: Ray): MoveGrab {
  return item.mount === 'wall' ? wallGrabOf(view, item, ray) : flatGrabOf(view, item, ray);
}

export function placeItem(view: MoveView, item: MoveItem, step: MoveStep): Placed | null {
  return item.mount === 'wall' ? placeWall(view, item, step) : placeFlat(view, item, step);
}

function twistOf(item: MoveItem, base: MovePose, motion: PinchTwist, step: number | null): Twisted {
  if (item.object === null) {
    return { rotation: homeMapSnapRotation(base.rotation + motion.twistDeg, step), size: null };
  }
  const made = homeMapPinchTwist({
    object: {
      id: item.id,
      modelId: item.object.modelId,
      at: base.at,
      rotation: base.rotation,
      params: item.object.params,
      footprint: { w: item.box.w, d: item.box.d },
      locked: item.object.locked,
    },
    facts: undefined,
    scale: motion.scale,
    twistDeg: motion.twistDeg,
    stepDeg: step,
  });
  return { rotation: made.box.rotation, size: { w: made.box.w, d: made.box.d } };
}

export function moveEvent(item: MoveItem, pose: MovePose): EditEventDraft {
  const object = item.object !== null;
  return {
    type: 'move',
    id: item.id,
    at: pose.at,
    rotation: pose.rotation,
    wall: pose.wall,
    height: object ? null : pose.height,
    elevation: object ? pose.height : null,
    mount: object ? null : item.mount,
  };
}

class MoveSession implements DragSession {
  private readonly item: MoveItem;
  private readonly grab: MoveGrab;
  private live: Placed | null = null;
  private twisted: Twisted | null = null;
  private snap: string | null;

  constructor(
    private readonly hooks: MoveHooks,
    private readonly start: DragStart,
    id: string,
  ) {
    const view = hooks.view();
    this.item = moveItemOf(view.edit, id);
    this.grab = grabOf(view, this.item, rayAt(view, start.from));
    this.snap = this.item.wall === null ? null : wallSnapKey(this.item.wall.wallId);
  }

  move(at: Point, modifiers: Modifiers): void {
    const view = this.hooks.view();
    const track = {
      wallId: this.live?.wall?.wallId ?? this.grab.wallId,
      height: this.live?.height ?? this.item.height,
    };
    const step = { ray: rayAt(view, at), grab: this.grab, track, modifiers };
    const placed = placeItem(view, this.item, step);
    if (placed === null) return;
    this.live = placed;
    this.signal(placed.snap);
    this.show();
  }

  twist(motion: PinchTwist, modifiers: Modifiers): void {
    if (this.item.mount === 'wall') return;
    const view = this.hooks.view();
    const free = !view.snapping || modifiers.alt || modifiers.free;
    const base = this.liveBase();
    this.twisted = twistOf(this.item, base, motion, free ? null : HOME_MAP_ROTATION_STEP_DEG);
    this.show();
  }

  end(): EditEventDraft | null {
    const pose = this.pose();
    if (pose === null) return null;
    const size = this.twisted?.size ?? null;
    if (size === null) return moveEvent(this.item, pose);
    return {
      type: 'resize',
      id: this.item.id,
      box: { at: pose.at, rotation: pose.rotation, w: size.w, d: size.d, h: null },
    };
  }

  cancel(): void {
    this.live = null;
    this.twisted = null;
    this.hooks.preview(null);
  }

  private liveBase(): MovePose {
    const { item, live } = this;
    if (live === null) {
      const { at, rotation } = item.box;
      return {
        id: item.id,
        at: { x: at.x, y: at.y },
        rotation,
        height: item.height,
        wall: item.wall,
      };
    }
    return {
      id: item.id,
      at: live.at,
      rotation: live.rotation,
      height: live.height,
      wall: live.wall,
    };
  }

  private pose(): MovePose | null {
    if (this.live === null && this.twisted === null) return null;
    const base = this.liveBase();
    return this.twisted === null ? base : { ...base, rotation: this.twisted.rotation };
  }

  private signal(next: string | null): void {
    if (next === this.snap) return;
    this.snap = next;
    this.start.emit({ type: 'snap', engaged: next !== null });
  }

  private show(): void {
    const pose = this.pose();
    if (pose === null) return;
    this.hooks.preview({
      pose,
      size: this.twisted?.size ?? null,
      guides: this.live?.guides ?? [],
      labels: this.live?.labels ?? [],
    });
  }
}

export function moveDrags(hooks: MoveHooks): StartDrag {
  return (start) => {
    if (start.grab.kind === 'handle') throw new HandleDragUnavailableError(start.grab.handleId);
    return new MoveSession(hooks, start, start.grab.id);
  };
}
