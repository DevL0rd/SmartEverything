export const TAP_SLOP_PIXELS = 8;

export const ORBIT_BUTTON = 2;

export const MIDDLE_BUTTON = 1;

export type DragMode = 'orbit' | 'pan';

export interface PointerSample {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly button: number;
  readonly mouse: boolean;
  readonly shift: boolean;
  readonly alt: boolean;
}

export function dragModeOf(pointer: PointerSample): DragMode {
  if (!pointer.mouse) return 'orbit';
  return pointer.button === ORBIT_BUTTON ? 'orbit' : 'pan';
}

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface PanZoom {
  readonly dx: number;
  readonly dy: number;
  readonly factor: number;
  readonly centre: Point;
}

export interface GestureHandlers {
  readonly orbit: (dx: number, dy: number) => void;
  readonly panZoom: (change: PanZoom) => void;
  readonly tap: (x: number, y: number) => void;
  readonly menu: (x: number, y: number) => void;
}

export type GestureRoute = 'camera' | 'claimed';

export interface GestureClaim {
  readonly down: (pointer: PointerSample) => void;
  readonly move: (pointer: PointerSample) => GestureRoute;
  readonly up: (pointer: PointerSample) => void;
  readonly cancel: (pointer: PointerSample) => void;
  readonly hover: (pointer: PointerSample | null) => void;
}

type Press = 'tap' | 'menu' | 'none';

function pressOf(pointer: PointerSample): Press {
  if (!pointer.mouse || pointer.button === 0) return 'tap';
  return pointer.button === ORBIT_BUTTON ? 'menu' : 'none';
}

function midpoint(points: readonly Point[]): Point {
  const first = points[0] ?? { x: 0, y: 0 };
  const second = points[1] ?? first;
  return { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
}

function spread(points: readonly Point[]): number {
  const first = points[0] ?? { x: 0, y: 0 };
  const second = points[1] ?? first;
  return Math.hypot(second.x - first.x, second.y - first.y);
}

export class GestureTracker {
  private readonly pointers = new Map<number, Point>();
  private travel = 0;
  private multi = false;
  private mode: DragMode = 'orbit';
  private press: Press = 'tap';
  private claim: GestureClaim | null = null;

  constructor(private readonly handlers: GestureHandlers) {}

  setClaim(claim: GestureClaim | null): void {
    if (claim === this.claim) return;
    if (this.pointers.size > 0) this.multi = true;
    this.claim = claim;
  }

  down(pointer: PointerSample): void {
    if (this.pointers.size === 0) {
      this.travel = 0;
      this.multi = false;
      this.mode = dragModeOf(pointer);
      this.press = pressOf(pointer);
    } else {
      this.multi = true;
    }
    this.pointers.set(pointer.id, { x: pointer.x, y: pointer.y });
    this.claim?.down(pointer);
  }

  move(pointer: PointerSample): void {
    const previous = this.pointers.get(pointer.id);
    if (previous === undefined) {
      this.claim?.hover(pointer);
      return;
    }
    if (this.claim?.move(pointer) === 'claimed') {
      this.pointers.set(pointer.id, { x: pointer.x, y: pointer.y });
      return;
    }
    if (this.pointers.size === 1) {
      this.moveSingle(previous, pointer);
    } else if (this.pointers.size === 2) {
      this.movePair(pointer);
    }
  }

  up(pointer: PointerSample): void {
    if (this.claim !== null) {
      this.pointers.delete(pointer.id);
      this.claim.up(pointer);
      return;
    }
    const pressed =
      this.pointers.size === 1 &&
      this.pointers.has(pointer.id) &&
      !this.multi &&
      this.travel <= TAP_SLOP_PIXELS;
    this.pointers.delete(pointer.id);
    if (!pressed) return;
    if (this.press === 'tap') this.handlers.tap(pointer.x, pointer.y);
    else if (this.press === 'menu') this.handlers.menu(pointer.x, pointer.y);
  }

  cancel(pointer: PointerSample): void {
    this.pointers.delete(pointer.id);
    this.claim?.cancel(pointer);
  }

  leave(): void {
    this.claim?.hover(null);
  }

  private moveSingle(previous: Point, pointer: PointerSample): void {
    const dx = pointer.x - previous.x;
    const dy = pointer.y - previous.y;
    this.travel += Math.hypot(dx, dy);
    this.pointers.set(pointer.id, { x: pointer.x, y: pointer.y });
    if (this.travel <= TAP_SLOP_PIXELS) return;
    if (this.mode === 'pan') {
      this.handlers.panZoom({ dx, dy, factor: 1, centre: { x: pointer.x, y: pointer.y } });
    } else {
      this.handlers.orbit(dx, dy);
    }
  }

  private movePair(pointer: PointerSample): void {
    const before = [...this.pointers.values()];
    this.pointers.set(pointer.id, { x: pointer.x, y: pointer.y });
    const after = [...this.pointers.values()];
    const previousSpread = spread(before);
    const factor = previousSpread > 0 ? spread(after) / previousSpread : 1;
    const was = midpoint(before);
    const now = midpoint(after);
    this.multi = true;
    this.handlers.panZoom({ dx: now.x - was.x, dy: now.y - was.y, factor, centre: now });
  }
}

function sample(event: PointerEvent): PointerSample {
  return {
    id: event.pointerId,
    x: event.clientX,
    y: event.clientY,
    button: event.button,
    mouse: event.pointerType === 'mouse',
    shift: event.shiftKey,
    alt: event.altKey,
  };
}

export function bindCanvas(
  canvas: HTMLCanvasElement,
  tracker: GestureTracker,
  onWheel: (deltaY: number, at: Point, alt: boolean) => void,
): () => void {
  canvas.style.setProperty('touch-action', 'none');
  const down = (event: PointerEvent): void => {
    if (event.button === MIDDLE_BUTTON) event.preventDefault();
    canvas.setPointerCapture(event.pointerId);
    tracker.down(sample(event));
  };
  const move = (event: PointerEvent): void => {
    tracker.move(sample(event));
  };
  const up = (event: PointerEvent): void => {
    tracker.up(sample(event));
  };
  const cancel = (event: PointerEvent): void => {
    tracker.cancel(sample(event));
  };
  const leave = (): void => {
    tracker.leave();
  };
  const wheel = (event: WheelEvent): void => {
    event.preventDefault();
    onWheel(event.deltaY, { x: event.clientX, y: event.clientY }, event.altKey);
  };
  const menu = (event: MouseEvent): void => {
    event.preventDefault();
  };
  canvas.addEventListener('pointerdown', down);
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', cancel);
  canvas.addEventListener('pointerleave', leave);
  canvas.addEventListener('wheel', wheel, { passive: false });
  canvas.addEventListener('contextmenu', menu);
  return () => {
    canvas.removeEventListener('pointerdown', down);
    canvas.removeEventListener('pointermove', move);
    canvas.removeEventListener('pointerup', up);
    canvas.removeEventListener('pointercancel', cancel);
    canvas.removeEventListener('pointerleave', leave);
    canvas.removeEventListener('wheel', wheel);
    canvas.removeEventListener('contextmenu', menu);
  };
}
