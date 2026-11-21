import type { WebGLRenderer } from 'three';
import {
  applyPixelRatio,
  canvasPixelRatio,
  createRenderer,
  restRenderer,
} from './render-core-renderer';

const STAGE_CANVAS_CLASS = 'vacuum-map3d';

export interface CoreSurface<R = WebGLRenderer> {
  readonly renderer: R;
  resize(width: number, height: number): void;
  setPixelRatio(ratio: number, renderScale: number): boolean;
  frame<T>(paint: () => T): T;
  release(): void;
}

export interface SurfaceSource {
  readonly width: number;
  readonly height: number;
  addEventListener(type: 'webglcontextlost', listener: () => void): void;
}

export interface SurfaceRenderer<S extends SurfaceSource = SurfaceSource> {
  readonly domElement: S;
  getPixelRatio(): number;
  setPixelRatio(value: number): void;
  setSize(width: number, height: number, updateStyle?: boolean): void;
}

export interface SurfacePaint<S> {
  clearRect(x: number, y: number, width: number, height: number): void;
  drawImage(image: S, dx: number, dy: number): void;
}

export interface SurfaceTarget<S> {
  width: number;
  height: number;
  getContext(kind: '2d'): SurfacePaint<S> | null;
}

export interface SharedPool<R extends SurfaceRenderer> {
  acquire(): R;
  release(renderer: R): void;
  readonly users: number;
}

export type StageSurface = CoreSurface & { readonly canvas: HTMLCanvasElement };

interface StageSource extends SurfaceSource {
  remove(): void;
}

export interface StageRenderer extends SurfaceRenderer<StageSource> {
  dispose(): void;
}

interface StagePool<R extends StageRenderer> {
  acquire(): R;
  release(renderer: R): void;
  readonly idle: number;
}

export function stagePool<R extends StageRenderer>(
  create: () => R,
  rest: (renderer: R) => void,
): StagePool<R> {
  const idle: R[] = [];
  const lost = new WeakSet<R>();
  const made = (): R => {
    const renderer = create();
    renderer.domElement.addEventListener('webglcontextlost', () => {
      lost.add(renderer);
      const at = idle.indexOf(renderer);
      if (at === -1) return;
      idle.splice(at, 1);
      renderer.dispose();
    });
    return renderer;
  };
  return {
    acquire(): R {
      return idle.pop() ?? made();
    },
    release(renderer): void {
      renderer.domElement.remove();
      if (lost.has(renderer)) {
        renderer.dispose();
        return;
      }
      rest(renderer);
      idle.push(renderer);
    },
    get idle(): number {
      return idle.length;
    },
  };
}

const fullStages = stagePool(() => createRenderer(document.createElement('canvas')), restRenderer);

function ownSurface(host: HTMLElement): StageSurface {
  const renderer = fullStages.acquire();
  const canvas = renderer.domElement;
  canvas.className = STAGE_CANVAS_CLASS;
  host.appendChild(canvas);
  return {
    renderer,
    canvas,
    resize(width, height): void {
      renderer.setSize(Math.max(width, 1), Math.max(height, 1), false);
    },
    setPixelRatio(ratio, renderScale): boolean {
      return applyPixelRatio(renderer, ratio, renderScale);
    },
    frame: (paint) => paint(),
    release(): void {
      fullStages.release(renderer);
    },
  };
}

interface Pooled<R> {
  readonly renderer: R;
  users: number;
}

export function sharedPool<R extends SurfaceRenderer>(create: () => R): SharedPool<R> {
  let pooled: Pooled<R> | null = null;
  return {
    acquire(): R {
      if (pooled === null) {
        const entry: Pooled<R> = { renderer: create(), users: 0 };
        entry.renderer.domElement.addEventListener('webglcontextlost', () => {
          if (pooled === entry) pooled = null;
        });
        pooled = entry;
      }
      pooled.users += 1;
      return pooled.renderer;
    },
    release(renderer): void {
      if (pooled?.renderer !== renderer) return;
      pooled.users -= 1;
      if (pooled.users === 0) renderer.setSize(1, 1, false);
    },
    get users(): number {
      return pooled?.users ?? 0;
    },
  };
}

const smallStages = sharedPool(() => createRenderer(document.createElement('canvas')));

function smallSurface(host: HTMLElement): StageSurface {
  const canvas = document.createElement('canvas');
  canvas.className = STAGE_CANVAS_CLASS;
  const surface = sharedSurface<HTMLCanvasElement, WebGLRenderer>(canvas, smallStages);
  host.appendChild(canvas);
  return {
    renderer: surface.renderer,
    canvas,
    resize: (width, height): void => {
      surface.resize(width, height);
    },
    setPixelRatio: (ratio, renderScale): boolean => surface.setPixelRatio(ratio, renderScale),
    frame: (paint) => surface.frame(paint),
    release: (): void => {
      surface.release();
      canvas.remove();
    },
  };
}

export function coreSurface(host: HTMLElement, shared: boolean): StageSurface {
  return shared ? smallSurface(host) : ownSurface(host);
}

function drawingContext<S>(canvas: SurfaceTarget<S>): SurfacePaint<S> {
  const context = canvas.getContext('2d');
  if (context === null) throw new Error('2D canvas is not available');
  return context;
}

class SharedSurface<
  S extends SurfaceSource,
  R extends SurfaceRenderer<S>,
> implements CoreSurface<R> {
  readonly renderer: R;
  private readonly context: SurfacePaint<S>;
  private width = 1;
  private height = 1;
  private ratio = 1;

  constructor(
    private readonly canvas: SurfaceTarget<S>,
    private readonly pool: SharedPool<R>,
  ) {
    this.context = drawingContext(canvas);
    this.renderer = pool.acquire();
  }

  resize(width: number, height: number): void {
    this.width = Math.max(width, 1);
    this.height = Math.max(height, 1);
    this.fitCanvas();
  }

  setPixelRatio(ratio: number, renderScale: number): boolean {
    const next = canvasPixelRatio(ratio, renderScale);
    if (this.ratio === next) return false;
    this.ratio = next;
    this.fitCanvas();
    return true;
  }

  frame<T>(paint: () => T): T {
    const { renderer, canvas } = this;
    if (renderer.getPixelRatio() !== this.ratio) renderer.setPixelRatio(this.ratio);
    const source = renderer.domElement;
    if (source.width !== canvas.width || source.height !== canvas.height) {
      renderer.setSize(this.width, this.height, false);
    }
    const painted = paint();
    this.context.clearRect(0, 0, canvas.width, canvas.height);
    this.context.drawImage(source, 0, 0);
    return painted;
  }

  release(): void {
    this.pool.release(this.renderer);
  }

  private fitCanvas(): void {
    this.canvas.width = Math.floor(this.width * this.ratio);
    this.canvas.height = Math.floor(this.height * this.ratio);
  }
}

export function sharedSurface<S extends SurfaceSource, R extends SurfaceRenderer<S>>(
  canvas: SurfaceTarget<S>,
  pool: SharedPool<R>,
): CoreSurface<R> {
  return new SharedSurface(canvas, pool);
}
