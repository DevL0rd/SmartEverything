import type { ModelSpecShot } from '@smarteverything/domain';
import type { ChannelSignals } from '../../../components/models/channels';
import { planClip } from '../model/impostor-plan';
import { framedShot, shotProgress } from '../../../components/models/three/framing';
import {
  aimCamera,
  cssRect,
  readBounds,
  renderPass,
  type BakeContext,
  type BakeRig,
  type PixelRect,
} from './bake-layers';
import type { BakeKey, BakeView, ClipResult } from './bake-protocol';

export interface ClipFrameTime {
  readonly elapsedS: number;
  readonly progress: number;
}

export interface ClipSchedule {
  readonly introFrames: number;
  readonly loopFrames: number;
  readonly frameS: number;
  readonly periodS: number;
  readonly stillFrame: number;
  readonly times: readonly ClipFrameTime[];
}

const FULL_TURN = 360;

function positiveMod(value: number, period: number): number {
  return ((value % period) + period) % period;
}

export function clipSchedule(view: BakeView, shot: ModelSpecShot): ClipSchedule {
  const orbits = (shot.orbit ?? 0) !== 0;
  const plan = planClip(view, orbits ? { ...shot, symmetry: FULL_TURN } : shot);
  const loopFrames = plan.frames;
  const frameS = plan.periodS / loopFrames;
  const introFrames = shot.easeMs > 0 ? Math.ceil(shot.easeMs / 1000 / frameS) : 0;
  const introS = introFrames * frameS;
  const times: ClipFrameTime[] = [];
  for (let at = 0; at < introFrames; at += 1) {
    times.push({ elapsedS: at * frameS, progress: shotProgress(at * frameS * 1000, shot.easeMs) });
  }
  for (let at = 0; at < loopFrames; at += 1) {
    times.push({ elapsedS: introS + at * frameS, progress: 1 });
  }
  const phase = positiveMod(shot.stillAt - introS, plan.periodS);
  const stillFrame = Math.round(phase / frameS) % loopFrames;
  return { introFrames, loopFrames, frameS, periodS: plan.periodS, stillFrame, times };
}

export interface AtlasGrid {
  readonly columns: number;
  readonly rows: number;
}

export function atlasGrid(frames: number): AtlasGrid {
  const columns = Math.max(1, Math.ceil(Math.sqrt(frames)));
  return { columns, rows: Math.max(1, Math.ceil(frames / columns)) };
}

export function unionRect(rects: readonly (PixelRect | null)[]): PixelRect | null {
  const shown = rects.filter((rect): rect is PixelRect => rect !== null);
  if (shown.length === 0) return null;
  const x = Math.min(...shown.map((rect) => rect.x));
  const y = Math.min(...shown.map((rect) => rect.y));
  const right = Math.max(...shown.map((rect) => rect.x + rect.width));
  const bottom = Math.max(...shown.map((rect) => rect.y + rect.height));
  return { x, y, width: right - x, height: bottom - y };
}

export function cellOrigin(index: number, grid: AtlasGrid, cell: PixelRect): PixelRect {
  const column = index % grid.columns;
  const row = Math.floor(index / grid.columns);
  return { x: column * cell.width, y: row * cell.height, width: cell.width, height: cell.height };
}

export function yieldTask(): Promise<void> {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = (): void => {
      channel.port1.close();
      resolve();
    };
    channel.port2.postMessage(null);
  });
}

export interface StagingDraw<S> {
  readonly copy: (image: S, from: PixelRect, to: PixelRect) => void;
}

export interface StagingCanvas<S> {
  readonly canvas: S;
  readonly draw: StagingDraw<S> | null;
}

export type MakeCanvas<S> = (width: number, height: number) => StagingCanvas<S>;

export interface CroppedFrame<S> {
  readonly canvas: S;
  readonly rect: PixelRect;
}

export interface PackedAtlas<S> {
  readonly canvas: S;
  readonly crop: PixelRect;
  readonly grid: AtlasGrid;
}

function canvas2d(width: number, height: number): StagingCanvas<HTMLCanvasElement> {
  const made = document.createElement('canvas');
  made.width = width;
  made.height = height;
  const context = made.getContext('2d');
  if (context === null) return { canvas: made, draw: null };
  const copy = (image: HTMLCanvasElement, from: PixelRect, to: PixelRect): void => {
    context.drawImage(
      image,
      from.x,
      from.y,
      from.width,
      from.height,
      to.x,
      to.y,
      to.width,
      to.height,
    );
  };
  return { canvas: made, draw: { copy } };
}

export function cropFrame<S>(
  source: S,
  rect: PixelRect | null,
  make: MakeCanvas<S>,
): CroppedFrame<S> | null {
  if (rect === null) return null;
  const { canvas, draw } = make(rect.width, rect.height);
  draw?.copy(source, rect, { x: 0, y: 0, width: rect.width, height: rect.height });
  return { canvas, rect };
}

export function packFrames<S>(
  frames: readonly (CroppedFrame<S> | null)[],
  make: MakeCanvas<S>,
): PackedAtlas<S> | null {
  const crop = unionRect(frames.map((frame) => frame?.rect ?? null));
  if (crop === null) return null;
  const grid = atlasGrid(frames.length);
  const atlas = make(grid.columns * crop.width, grid.rows * crop.height);
  for (const [index, frame] of frames.entries()) {
    if (frame === null) continue;
    const to = cellOrigin(index, grid, crop);
    const { width, height } = frame.rect;
    atlas.draw?.copy(
      frame.canvas,
      { x: 0, y: 0, width, height },
      { x: to.x + frame.rect.x - crop.x, y: to.y + frame.rect.y - crop.y, width, height },
    );
  }
  return { canvas: atlas.canvas, crop, grid };
}

export interface ClipBake {
  readonly context: BakeContext;
  readonly rig: BakeRig;
  readonly key: BakeKey;
}

async function drawFrames(
  { context, rig, key }: ClipBake,
  run: {
    readonly shot: ModelSpecShot;
    readonly signals: ChannelSignals;
    readonly schedule: ClipSchedule;
  },
  pause: () => Promise<void>,
): Promise<readonly (CroppedFrame<HTMLCanvasElement> | null)[]> {
  const size = { width: key.width, height: key.height, dpr: key.dpr };
  const frames: (CroppedFrame<HTMLCanvasElement> | null)[] = [];
  for (const time of run.schedule.times) {
    rig.live.setSignals(run.signals, { timeS: time.elapsedS });
    rig.halos.sync();
    const frame = { view: key.view, aspect: key.width / key.height, shot: run.shot, ...time };
    const camera = aimCamera(context, framedShot(rig.built, rig.spec, frame), size);
    renderPass(context.renderer, rig, camera, () => 'show');
    frames.push(cropFrame(context.renderer.domElement, readBounds(context), canvas2d));
    await pause();
  }
  return frames;
}

function releaseFrames(frames: readonly (CroppedFrame<HTMLCanvasElement> | null)[]): void {
  for (const frame of frames) {
    if (frame === null) continue;
    frame.canvas.width = 0;
    frame.canvas.height = 0;
  }
}

export async function bakeClip(
  bake: ClipBake,
  signals: ChannelSignals,
  pause: () => Promise<void>,
): Promise<Omit<ClipResult, 'id' | 'ms'> | null> {
  const { rig, key } = bake;
  if (key.target.kind !== 'shot') return null;
  const { shotId } = key.target;
  const shot = rig.spec.shots?.find((each) => each.id === shotId);
  if (shot === undefined) return null;
  const schedule = clipSchedule(key.view, shot);
  const frames = await drawFrames(bake, { shot, signals, schedule }, pause);
  const atlas = packFrames(frames, canvas2d);
  releaseFrames(frames);
  if (atlas === null) throw new Error('the clip rendered blank');
  return {
    kind: 'clip',
    width: key.width,
    height: key.height,
    dpr: key.dpr,
    shotId,
    uri: atlas.canvas.toDataURL('image/png'),
    rect: cssRect(atlas.crop, key.dpr),
    columns: atlas.grid.columns,
    rows: atlas.grid.rows,
    introFrames: schedule.introFrames,
    loopFrames: schedule.loopFrames,
    stillFrame: schedule.stillFrame,
    frameS: schedule.frameS,
    periodS: schedule.periodS,
  };
}
