import {
  CircleGeometry,
  Color,
  Mesh,
  MeshBasicMaterial,
  OrthographicCamera,
  PerspectiveCamera,
  SRGBColorSpace,
  Scene,
  Vector4,
  WebGLRenderTarget,
  type WebGLRenderer,
} from 'three';
import type { GizmoBreakpoint } from './edit/gizmo';
import type { Point } from './render-core-gestures';
import { visibleInsets, type CameraView } from './render-core-orbit';

export const LOUPE_PX = 128;

export const LOUPE_ZOOM = 3;

export const LOUPE_SIDE_GAP_PX = 12;

export const LOUPE_TOP_GAP_PX = 8;

export const LOUPE_GROUND_TOKEN = '--map-loupe-ground';

const LOUPE_SEGMENTS = 64;

const LOUPE_SAMPLES = 4;

export interface LoupePlacement {
  readonly left: number;
  readonly top: number;
  readonly size: number;
  readonly focus: Point;
}

export interface LoupeSink {
  readonly loupe: (placement: LoupePlacement | null) => void;
}

export interface LoupeInput {
  readonly grabbing: boolean;
  readonly breakpoint: GizmoBreakpoint;
  readonly finger: Point | null;
  readonly view: CameraView;
}

export function loupeOf(input: LoupeInput): LoupePlacement | null {
  const { grabbing, breakpoint, finger, view } = input;
  if (!grabbing || breakpoint !== 'phone' || finger === null) return null;
  const awayRight = finger.x < view.width / 2;
  return {
    left: awayRight ? view.width - LOUPE_SIDE_GAP_PX - LOUPE_PX : LOUPE_SIDE_GAP_PX,
    top: visibleInsets(view).top + LOUPE_TOP_GAP_PX,
    size: LOUPE_PX,
    focus: finger,
  };
}

export function aimLens(
  lens: PerspectiveCamera,
  camera: PerspectiveCamera,
  focus: Point,
  view: CameraView,
): void {
  lens.copy(camera);
  const shifted = camera.view?.enabled === true ? camera.view : null;
  const span = LOUPE_PX / LOUPE_ZOOM;
  const x = focus.x + (shifted === null ? 0 : shifted.offsetX) - span / 2;
  const y = focus.y + (shifted === null ? 0 : shifted.offsetY) - span / 2;
  lens.setViewOffset(view.width, view.height, x, y, span, span);
}

export type TouchEventType = 'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel';

export type TouchSample = Pick<
  PointerEvent,
  'type' | 'pointerId' | 'pointerType' | 'clientX' | 'clientY'
>;

export interface TouchSurface {
  addEventListener(type: TouchEventType, listener: (event: TouchSample) => void): void;
  removeEventListener(type: TouchEventType, listener: (event: TouchSample) => void): void;
  getBoundingClientRect(): { readonly left: number; readonly top: number };
}

const TOUCH_EVENTS: readonly TouchEventType[] = [
  'pointerdown',
  'pointermove',
  'pointerup',
  'pointercancel',
];

export class FingerTracker {
  private readonly touches = new Map<number, Point>();

  constructor(
    private readonly surface: TouchSurface,
    private readonly moved: () => void,
  ) {}

  get finger(): Point | null {
    const [first] = this.touches.values();
    return first ?? null;
  }

  bind(): () => void {
    const listener = (event: TouchSample): void => {
      this.sample(event);
    };
    for (const type of TOUCH_EVENTS) this.surface.addEventListener(type, listener);
    return () => {
      for (const type of TOUCH_EVENTS) this.surface.removeEventListener(type, listener);
    };
  }

  private sample(event: TouchSample): void {
    if (event.type === 'pointerup' || event.type === 'pointercancel') {
      this.touches.delete(event.pointerId);
      return;
    }
    if (event.pointerType !== 'touch') return;
    const moving = event.type === 'pointermove';
    if (moving && !this.touches.has(event.pointerId)) return;
    const bounds = this.surface.getBoundingClientRect();
    this.touches.set(event.pointerId, {
      x: event.clientX - bounds.left,
      y: event.clientY - bounds.top,
    });
    if (moving) this.moved();
  }
}

export type LensDraw = (lens: PerspectiveCamera) => void;

export interface LensShot {
  readonly camera: PerspectiveCamera;
  readonly at: LoupePlacement;
  readonly view: CameraView;
}

export class LoupeLens {
  private readonly target = new WebGLRenderTarget(1, 1, { samples: LOUPE_SAMPLES });
  private readonly lens = new PerspectiveCamera();
  private readonly flat = new OrthographicCamera(-1, 1, 1, -1, -1, 1);
  private readonly composite = new Scene();
  private readonly geometry = new CircleGeometry(1, LOUPE_SEGMENTS);
  private readonly material: MeshBasicMaterial;
  private readonly clear = new Color();
  private readonly viewport = new Vector4();
  private ground: Color | null = null;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly renderer: WebGLRenderer,
  ) {
    this.target.texture.colorSpace = SRGBColorSpace;
    this.material = new MeshBasicMaterial({ map: this.target.texture, depthTest: false });
    this.composite.add(new Mesh(this.geometry, this.material));
  }

  rest(): void {
    this.ground = null;
  }

  render(shot: LensShot, draw: LensDraw): void {
    const { renderer } = this;
    const { camera, at, view } = shot;
    const pixels = Math.round(at.size * renderer.getPixelRatio());
    if (this.target.width !== pixels) this.target.setSize(pixels, pixels);
    aimLens(this.lens, camera, at.focus, view);
    const autoClear = renderer.autoClear;
    const alpha = renderer.getClearAlpha();
    renderer.getClearColor(this.clear);
    renderer.setRenderTarget(this.target);
    renderer.setClearColor(this.groundColour(), 1);
    renderer.clear();
    this.renderer.autoClear = false;
    draw(this.lens);
    renderer.setRenderTarget(null);
    renderer.setClearColor(this.clear, alpha);
    this.compose(at, view);
    this.renderer.autoClear = autoClear;
  }

  dispose(): void {
    this.target.dispose();
    this.geometry.dispose();
    this.material.dispose();
  }

  private compose(at: LoupePlacement, view: CameraView): void {
    const { renderer } = this;
    renderer.getViewport(this.viewport);
    const bottom = view.height - at.top - at.size;
    renderer.setViewport(at.left, bottom, at.size, at.size);
    renderer.setScissor(at.left, bottom, at.size, at.size);
    renderer.setScissorTest(true);
    renderer.render(this.composite, this.flat);
    renderer.setScissorTest(false);
    renderer.setViewport(this.viewport);
  }

  private groundColour(): Color {
    if (this.ground !== null) return this.ground;
    const token = getComputedStyle(this.canvas).getPropertyValue(LOUPE_GROUND_TOKEN).trim();
    this.ground = new Color(token);
    return this.ground;
  }
}
