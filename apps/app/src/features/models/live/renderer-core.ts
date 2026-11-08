import type { ModelSpec } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import type { Scene, Camera, Texture, WebGLRenderer } from 'three';
import {
  initialQuality,
  qualitySettings,
  recordFrame,
  type QualityState,
} from '../../../components/house-map/live-visibility/quality-scaler';
import type { ChannelSignals } from '../../../components/models/channels';
import {
  createViewCamera,
  type CameraPose,
  type ModelView,
  type ViewCamera,
} from '../../../components/models/three/framing';
import type { StageTheme } from '../../../components/models/three/stage';
import { inspectPose, type LiveInspect } from './inspect';
import { createInstanceGroups, type InstanceGroup, type InstanceGroups } from './instancing';
import { createModelCache, type LiveModelKey, type ModelCache } from './model-cache';
import { createShotTracker, shotRig, type ShotRig, type ShotTracker } from './shots';
import { frameDue, fullStep, sameStep, widgetSteps, type WidgetStep } from './widget-scaler-steps';

const log = new Logger('app.models');

export type LiveGl = Pick<
  WebGLRenderer,
  'setPixelRatio' | 'setSize' | 'setScissorTest' | 'setScissor' | 'setViewport' | 'clear'
> & {
  autoClear: boolean;
  readonly render: (scene: Scene, camera: Camera) => void;
};

export interface LiveRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface LiveViewModel {
  readonly id: string;
  readonly spec: ModelSpec;
  readonly model: LiveModelKey;
  readonly view: ModelView;
  readonly theme: StageTheme;
  readonly signals: ChannelSignals;
  readonly reduced: boolean;
  readonly inspect?: LiveInspect;
}

export interface LiveDraw {
  readonly moving: boolean;
  readonly drawn: readonly string[];
}

export interface LiveRenderer {
  readonly upsert: (model: LiveViewModel) => void;
  readonly remove: (id: string) => void;
  readonly place: (id: string, rect: LiveRect, clip: LiveRect) => void;
  readonly resize: (width: number, height: number, dpr: number) => void;
  readonly draw: (nowMs: number) => LiveDraw;
  readonly recordFrame: (frameMs: number) => boolean;
  readonly viewIds: () => readonly string[];
  readonly cache: ModelCache;
  readonly dispose: () => void;
}

class ViewEntry {
  rig: ShotRig | null = null;
  moving = true;
  rect: LiveRect | null = null;
  clip: LiveRect | null = null;
  readonly camera: ViewCamera = createViewCamera();
  readonly tracker: ShotTracker = createShotTracker(0);

  constructor(
    public model: LiveViewModel,
    public group: InstanceGroup,
    public step: WidgetStep,
  ) {}

  update(model: LiveViewModel, group: InstanceGroup, step: WidgetStep): void {
    if (model.spec !== this.model.spec || model.view !== this.model.view) this.rig = null;
    if (group.hold !== this.group.hold) this.rig = null;
    this.model = model;
    this.group = group;
    this.step = step;
  }

  place(rect: LiveRect, clip: LiveRect): void {
    this.rect = rect;
    this.clip = intersect(rect, clip);
  }

  advance(serial: number, timeS: number): boolean {
    const { step, group } = this;
    if (frameDue(step, serial)) {
      this.moving = group.prepare({ serial, timeS, decalShare: step.decalShare });
    }
    group.dressFor(step.effects);
    return this.moving;
  }

  poseOf(rig: ShotRig, shot: CameraPose): CameraPose {
    const { inspect } = this.model;
    return inspect === undefined ? shot : inspectPose(rig.framed, inspect);
  }

  rigFor(aspect: number): ShotRig {
    if (this.rig?.aspect === aspect) return this.rig;
    this.rig = shotRig(this.group.hold.built, this.model.spec, this.model.view, aspect);
    return this.rig;
  }
}

interface Surface {
  readonly width: number;
  readonly height: number;
  readonly dpr: number;
}

export function intersect(a: LiveRect, b: LiveRect): LiveRect | null {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  if (right <= x || bottom <= y) return null;
  return { x, y, width: right - x, height: bottom - y };
}

interface DrawPass {
  readonly gl: LiveGl;
  readonly surface: Surface;
  readonly nowMs: number;
  readonly serial: number;
}

function drawView(pass: DrawPass, entry: ViewEntry): boolean | null {
  const { gl, surface, nowMs, serial } = pass;
  const { rect } = entry;
  const bounds = { x: 0, y: 0, width: surface.width, height: surface.height };
  const clip = entry.clip === null || rect === null ? null : intersect(entry.clip, bounds);
  if (rect === null || clip === null || rect.width <= 0 || rect.height <= 0) return null;
  const { group, model } = entry;
  const aspect = rect.width / rect.height;
  const rig = entry.rigFor(aspect);
  const shot = entry.tracker.frame({ ...model, rig, nowMs });
  const moving = entry.advance(serial, shot.timeS);
  entry.camera.apply(entry.poseOf(rig, shot.pose), aspect);
  gl.setViewport(rect.x, surface.height - rect.y - rect.height, rect.width, rect.height);
  gl.setScissor(clip.x, surface.height - clip.y - clip.height, clip.width, clip.height);
  gl.render(group.stage.scene, entry.camera.camera);
  return (moving && !model.reduced) || shot.moving;
}

class RendererCore implements LiveRenderer {
  readonly cache: ModelCache = createModelCache();
  private readonly groups: InstanceGroups;
  private readonly views = new Map<string, ViewEntry>();
  private surface: Surface = { width: 0, height: 0, dpr: 1 };
  private applied: Surface | null = null;
  private resized = false;
  private scale = 1;
  private quality: QualityState = initialQuality();
  private serial = 0;

  constructor(
    private readonly gl: LiveGl,
    environment: Texture,
  ) {
    this.groups = createInstanceGroups(this.cache, environment);
    Object.assign(gl, { autoClear: false });
  }

  readonly upsert = (model: LiveViewModel): void => {
    const known = this.views.get(model.id);
    const step = known?.step ?? fullStep(model.model.lod);
    this.join(model, known, step);
  };

  readonly remove = (id: string): void => {
    if (!this.views.delete(id)) return;
    this.groups.leave(id);
  };

  readonly place = (id: string, rect: LiveRect, clip: LiveRect): void => {
    this.views.get(id)?.place(rect, clip);
  };

  readonly resize = (width: number, height: number, dpr: number): void => {
    this.surface = { width, height, dpr };
  };

  readonly draw = (nowMs: number): LiveDraw => {
    const { gl, surface } = this;
    this.serial += 1;
    this.applyScale();
    gl.setScissorTest(false);
    gl.clear();
    gl.setScissorTest(true);
    this.applySteps();
    const pass = { gl, surface, nowMs, serial: this.serial };
    const drawn: string[] = [];
    let moving = false;
    for (const [id, entry] of this.views) {
      const result = drawView(pass, entry);
      if (result === null) continue;
      drawn.push(id);
      moving = moving || result;
    }
    gl.setScissorTest(false);
    return { moving, drawn };
  };

  readonly recordFrame = (frameMs: number): boolean => {
    if (this.resized) {
      this.resized = false;
      return false;
    }
    const before = this.quality.level;
    this.quality = recordFrame(this.quality, frameMs);
    if (this.quality.level === before) return false;
    this.scale = qualitySettings(this.quality).renderScale;
    log.debug('model.live_quality_step', { level: this.quality.level, scale: this.scale });
    return true;
  };

  private join(model: LiveViewModel, known: ViewEntry | undefined, step: WidgetStep): void {
    const lit = model.inspect !== undefined;
    const group = this.groups.join(model.id, {
      ...model,
      model: { ...model.model, lod: step.lod },
      lit,
    });
    if (known === undefined) this.views.set(model.id, new ViewEntry(model, group, step));
    else known.update(model, group, step);
  }

  private applySteps(): void {
    const sizings = [...this.views].map(([id, entry]) => ({
      id,
      area: entry.rect === null ? 0 : entry.rect.width * entry.rect.height,
      lod: entry.model.model.lod,
    }));
    const steps = widgetSteps(sizings, qualitySettings(this.quality));
    for (const [id, entry] of this.views) {
      const step = steps.get(id) ?? fullStep(entry.model.model.lod);
      if (sameStep(step, entry.step)) continue;
      if (step.lod === entry.step.lod) entry.step = step;
      else this.join(entry.model, entry, step);
    }
  }

  readonly viewIds = (): readonly string[] => [...this.views.keys()];

  readonly dispose = (): void => {
    for (const id of [...this.views.keys()]) this.remove(id);
    this.groups.dispose();
    this.cache.dispose();
  };

  private applyScale(): void {
    const { width, height } = this.surface;
    const dpr = this.surface.dpr * this.scale;
    const { applied } = this;
    if (applied?.width === width && applied.height === height && applied.dpr === dpr) return;
    this.applied = { width, height, dpr };
    this.resized = true;
    this.gl.setPixelRatio(dpr);
    this.gl.setSize(width, height, false);
  }
}

export function createLiveRenderer(gl: LiveGl, environment: Texture): LiveRenderer {
  return new RendererCore(gl, environment);
}

export function syncLive(renderer: LiveRenderer, views: readonly LiveViewModel[]): void {
  const wanted = new Set(views.map((view) => view.id));
  for (const id of renderer.viewIds()) if (!wanted.has(id)) renderer.remove(id);
  for (const view of views) renderer.upsert(view);
}
