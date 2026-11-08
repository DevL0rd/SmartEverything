import {
  HOME_MAP_ROTATION_STEP_DEG,
  homeMapRotateStep,
} from '@smarteverything/domain/home-map-edit-core';
import type { HomeMapWallAttachment } from '@smarteverything/domain/home-map-elements';
import type { Modifiers, PinchTwist } from '../../edit/gestures';
import type {
  EditEvent,
  EditHit,
  EditOverlay,
  EditPaintTarget,
  EditSurface,
} from '../map-3d-edit-protocol';
import {
  ORBIT_BUTTON,
  TAP_SLOP_PIXELS,
  type GestureClaim,
  type GestureRoute,
  type Point,
  type PointerSample,
} from '../render-core-gestures';
import type { PressPick } from '../render-core-pick';
import { handleAt } from './gizmo';
import {
  NO_HIT,
  grabbed,
  hoverOf,
  liftable,
  lockedBody,
  modifiersOf,
  pairOf,
  pointOf,
  tapEventOf,
  type CameraPress,
  type EditHover,
  type Grab,
  type Press,
  type Twin,
} from './pointer-press';

export const GESTURE_HANDLER_LONG_PRESS_MS = 500;

const DEGREES_PER_RADIAN = 180 / Math.PI;

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

export type EditEventDraft = DistributiveOmit<EditEvent, 'seq'>;

export interface HandleCentre {
  readonly id: string;
  readonly x: number;
  readonly y: number;
}

export interface GroundTap {
  readonly point: Point;
  readonly floorId: string;
  readonly metresPerPx: number;
}

export interface PlaceSpot {
  readonly at: Point;
  readonly height: number;
  readonly rotation: number;
  readonly surface: EditSurface;
  readonly wall: HomeMapWallAttachment | null;
}

export interface PointerScene {
  readonly pressAt: (at: Point, bodyId: string | null) => PressPick;
  readonly handleCentres: () => readonly HandleCentre[];
  readonly groundAt: (at: Point) => GroundTap | null;
  readonly stagePoint: (at: Point) => Point;
  readonly isRoom: (id: string) => boolean;
  readonly paintAt: (at: Point) => EditPaintTarget | null;
  readonly placeAt: (at: Point) => PlaceSpot | null;
}

export type PointerHover = EditHover | { readonly kind: 'handle'; readonly handleId: string };

export type DragGrab =
  | { readonly kind: 'handle'; readonly handleId: string }
  | { readonly kind: 'body'; readonly id: string };

export interface DragStart {
  readonly grab: DragGrab;
  readonly from: Point;
  readonly emit: (event: EditEventDraft) => void;
}

export interface DragSession {
  readonly move: (at: Point, modifiers: Modifiers) => void;
  readonly twist: (motion: PinchTwist, modifiers: Modifiers, pair: readonly [Point, Point]) => void;
  readonly end: () => EditEventDraft | null;
  readonly cancel: () => void;
}

export type StartDrag = (start: DragStart) => DragSession;

export type PressTimer = (ms: number, fire: () => void) => () => void;

export interface PointerHooks {
  readonly scene: PointerScene;
  readonly emit: (event: EditEvent) => void;
  readonly hover: (hover: PointerHover | null) => void;
  readonly startDrag: StartDrag;
  readonly timer: PressTimer;
}

export class EditPointer implements GestureClaim {
  private press: Press = { kind: 'idle' };
  private readonly points = new Map<number, Point>();
  private travel = 0;
  private seq = 0;
  private stopTimer: (() => void) | null = null;
  private resting: Point | null = null;
  private shown: string | null = null;

  constructor(
    private overlay: EditOverlay,
    private readonly hooks: PointerHooks,
  ) {}

  setOverlay(overlay: EditOverlay): void {
    this.overlay = overlay;
    this.showHover();
  }

  hover(pointer: PointerSample | null): void {
    const resting = pointer !== null && pointer.mouse && this.points.size === 0;
    this.resting = resting ? pointOf(pointer) : null;
    this.showHover();
  }

  dispose(): void {
    this.hover(null);
    this.clearTimer();
    if (this.press.kind === 'grab') this.press.session?.cancel();
    this.press = { kind: 'idle' };
    this.points.clear();
  }

  down(pointer: PointerSample): void {
    this.hover(null);
    this.points.set(pointer.id, pointOf(pointer));
    if (this.points.size === 1) {
      this.begin(pointer);
      return;
    }
    this.join(pointer);
  }

  move(pointer: PointerSample): GestureRoute {
    const previous = this.points.get(pointer.id);
    if (previous === undefined) return 'camera';
    const at = pointOf(pointer);
    this.points.set(pointer.id, at);
    if (this.isPrimary(pointer.id)) this.travel += Math.hypot(at.x - previous.x, at.y - previous.y);
    if (this.travel > TAP_SLOP_PIXELS) this.clearTimer();
    if (this.press.kind === 'spent') return 'claimed';
    if (this.press.kind !== 'grab') return 'camera';
    this.drag(this.press, pointer);
    return 'claimed';
  }

  up(pointer: PointerSample): void {
    if (!this.points.has(pointer.id)) return;
    const press = this.press;
    if (press.kind === 'camera') this.releaseCamera(press, pointer);
    else if (press.kind === 'grab') this.releaseGrab(press, pointer);
    this.points.delete(pointer.id);
    this.settle();
  }

  cancel(pointer: PointerSample): void {
    if (!this.points.delete(pointer.id)) return;
    this.clearTimer();
    const press = this.press;
    if (press.kind === 'grab') {
      press.session?.cancel();
      if (press.session !== null || press.long) this.send({ type: 'cancel' });
      this.press = { kind: 'spent' };
    } else if (press.kind === 'camera') {
      this.press = { ...press, multi: true };
    }
    this.settle();
  }

  wheel(deltaY: number, at: Point, alt: boolean): GestureRoute {
    const gizmo = this.overlay.gizmo;
    const body = this.bodyId();
    if (!alt || deltaY === 0 || gizmo === null || body === null) return 'camera';
    if (this.hooks.scene.isRoom(body)) return 'camera';
    const press = this.hooks.scene.pressAt(at, body);
    if (!press.onBody || lockedBody(press.pick, body)) return 'camera';
    const degrees = homeMapRotateStep(gizmo.turn, deltaY > 0 ? 1 : -1, HOME_MAP_ROTATION_STEP_DEG);
    this.send({ type: 'rotate', id: body, degrees });
    return 'claimed';
  }

  private showHover(): void {
    const hover = this.resting === null ? null : this.hoverAt(this.resting);
    const key = hover === null ? null : JSON.stringify(hover);
    if (key === this.shown) return;
    this.shown = key;
    this.hooks.hover(hover);
  }

  private hoverAt(at: Point): PointerHover | null {
    if (this.overlay.readOnly) return null;
    const handleId = handleAt(this.hooks.scene.handleCentres(), at, true);
    if (handleId !== null) return { kind: 'handle', handleId };
    return hoverOf(this.overlay, this.hooks.scene, at);
  }

  private editable(): boolean {
    return this.overlay.mode === 'select' && !this.overlay.readOnly;
  }

  private bodyId(): string | null {
    const [only, ...rest] = this.overlay.selection;
    if (!this.editable() || only === undefined || rest.length > 0) return null;
    return this.overlay.roomDrag || !this.hooks.scene.isRoom(only) ? only : null;
  }

  private isPrimary(id: number): boolean {
    return this.press.kind !== 'idle' && this.press.kind !== 'spent' && this.press.id === id;
  }

  private begin(pointer: PointerSample): void {
    this.travel = 0;
    this.clearTimer();
    const from = pointOf(pointer);
    if (pointer.mouse && pointer.button !== 0) {
      const release = pointer.button === ORBIT_BUTTON ? 'menu' : 'none';
      this.press = {
        kind: 'camera',
        id: pointer.id,
        release,
        pick: NO_HIT,
        multi: false,
        long: false,
      };
      return;
    }
    const handleId = this.overlay.readOnly
      ? null
      : handleAt(this.hooks.scene.handleCentres(), from, pointer.mouse);
    if (handleId !== null) {
      this.press = grabbed(pointer.id, from, { kind: 'handle', handleId });
      return;
    }
    this.pressItem(pointer.id, from);
  }

  private pressItem(id: number, from: Point): void {
    const body = this.bodyId();
    const press = this.hooks.scene.pressAt(from, body);
    if (body !== null && press.onBody && !lockedBody(press.pick, body)) {
      this.press = grabbed(id, from, { kind: 'body', id: body });
      const lifts = !this.hooks.scene.isRoom(body);
      this.armLongPress(() => {
        this.liftHeld(body, lifts);
      });
      return;
    }
    const pick = press.pick;
    this.press = { kind: 'camera', id, release: 'tap', pick, multi: false, long: false };
    if (this.overlay.mode !== 'select' || pick.kind === 'none') return;
    this.armLongPress(() => {
      this.liftPressed(from, pick);
    });
  }

  private armLongPress(fire: () => void): void {
    this.stopTimer = this.hooks.timer(GESTURE_HANDLER_LONG_PRESS_MS, () => {
      this.stopTimer = null;
      fire();
    });
  }

  private liftHeld(body: string, lifts: boolean): void {
    if (this.press.kind !== 'grab') return;
    this.press = { ...this.press, long: true };
    if (lifts) this.send({ type: 'pick-up', id: body });
  }

  private liftPressed(from: Point, pick: EditHit): void {
    const press = this.press;
    if (press.kind !== 'camera') return;
    if (this.overlay.readOnly || !liftable(pick)) {
      this.press = { ...press, long: true };
      return;
    }
    this.press = { ...grabbed(press.id, from, { kind: 'body', id: pick.id }), long: true };
    this.send({ type: 'pick-up', id: pick.id });
  }

  private join(pointer: PointerSample): void {
    this.clearTimer();
    const press = this.press;
    if (press.kind === 'camera') {
      this.press = { ...press, multi: true };
      return;
    }
    if (press.kind !== 'grab' || press.grab.kind !== 'body' || press.twin !== null) return;
    if (press.twisted || this.points.size !== 2) return;
    const first = this.points.get(press.id);
    if (first === undefined) return;
    const pair = pairOf(first, pointOf(pointer));
    const session = press.session ?? this.started(press);
    this.press = { ...press, session, twin: { id: pointer.id, ...pair } };
  }

  private started(press: Grab): DragSession {
    return this.hooks.startDrag({
      grab: press.grab,
      from: press.from,
      emit: (event) => {
        this.send(event);
      },
    });
  }

  private drag(press: Grab, pointer: PointerSample): void {
    if (press.twin !== null) {
      this.twist(press, press.twin, pointer);
      return;
    }
    if (pointer.id !== press.id || press.twisted || this.travel <= TAP_SLOP_PIXELS) return;
    const session = press.session ?? this.started(press);
    if (press.session === null) this.press = { ...press, session };
    session.move(pointOf(pointer), modifiersOf(pointer, false));
  }

  private twist(press: Grab, twin: Twin, pointer: PointerSample): void {
    const first = this.points.get(press.id);
    const second = this.points.get(twin.id);
    if (first === undefined || second === undefined || press.session === null) return;
    const now = pairOf(first, second);
    const scale = twin.spread > 0 ? now.spread / twin.spread : 1;
    const twistDeg = (now.angle - twin.angle) * DEGREES_PER_RADIAN;
    press.session.twist({ scale, twistDeg }, modifiersOf(pointer, true), [first, second]);
  }

  private releaseCamera(press: CameraPress, pointer: PointerSample): void {
    if (pointer.id !== press.id) return;
    const still = !press.multi && this.travel <= TAP_SLOP_PIXELS;
    this.press = { ...press, multi: true };
    if (!still) return;
    const at = pointOf(pointer);
    if (press.long) this.menu(at, press.pick);
    else if (press.release === 'tap') this.tap(at);
    else if (press.release === 'menu') this.menu(at, this.hooks.scene.pressAt(at, null).pick);
  }

  private releaseGrab(press: Grab, pointer: PointerSample): void {
    if (press.twin?.id === pointer.id) {
      this.press = { ...press, twin: null, twisted: true };
      return;
    }
    if (pointer.id !== press.id) return;
    this.press = { kind: 'spent' };
    const at = pointOf(pointer);
    if (press.session !== null) {
      const event = press.session.end();
      if (event !== null) this.send(event);
    } else if (press.long) {
      this.menu(at, this.hooks.scene.pressAt(at, null).pick);
    } else {
      this.tap(at);
    }
  }

  private settle(): void {
    if (this.points.size > 0) return;
    this.clearTimer();
    this.press = { kind: 'idle' };
  }

  private tap(at: Point): void {
    const event = tapEventOf(this.overlay, this.hooks.scene, at);
    if (event !== null) this.send(event);
  }

  private menu(at: Point, pick: EditHit): void {
    this.send({ type: 'menu', point: this.hooks.scene.stagePoint(at), pick });
  }

  private send(draft: EditEventDraft): void {
    const seq = this.seq;
    this.seq += 1;
    this.hooks.emit({ ...draft, seq });
  }

  private clearTimer(): void {
    this.stopTimer?.();
    this.stopTimer = null;
  }
}
