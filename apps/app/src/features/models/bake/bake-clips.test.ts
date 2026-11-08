import type { ModelSpecShot } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import {
  atlasGrid,
  cellOrigin,
  clipSchedule,
  cropFrame,
  packFrames,
  unionRect,
  type MakeCanvas,
  type StagingCanvas,
} from './bake-clips';
import type { PixelRect } from './bake-layers';

interface FakeCanvas {
  readonly name: string;
  readonly width: number;
  readonly height: number;
  readonly drawn: (readonly [string, PixelRect, PixelRect])[];
}

function fakeCanvases(): { readonly made: FakeCanvas[]; readonly make: MakeCanvas<FakeCanvas> } {
  const made: FakeCanvas[] = [];
  return {
    made,
    make: (width, height): StagingCanvas<FakeCanvas> => {
      const canvas: FakeCanvas = { name: `c${String(made.length)}`, width, height, drawn: [] };
      made.push(canvas);
      return {
        canvas,
        draw: {
          copy: (image, from, to): void => {
            canvas.drawn.push([image.name, from, to]);
          },
        },
      };
    },
  };
}

const bytes = (canvas: { readonly width: number; readonly height: number }): number =>
  canvas.width * canvas.height * 4;

const SHOT: ModelSpecShot = {
  id: 'blades',
  when: { anyOf: [{ allOf: [{ signal: 'speed', op: 'gt', value: 0 }] }] },
  focus: 'blades',
  zoom: 1.5,
  yaw: 0,
  pitch: 0,
  easeMs: 0,
  loopS: 1,
  symmetry: 72,
  stillAt: 0.1,
};

describe('bake clips', () => {
  it('loops a symmetric part in its share of the frames and period', () => {
    const schedule = clipSchedule('card', SHOT);
    expect(schedule.loopFrames).toBe(8);
    expect(schedule.periodS).toBeCloseTo(0.2);
    expect(schedule.introFrames).toBe(0);
    expect(schedule.times).toHaveLength(8);
    expect(schedule.times.every((time) => time.progress === 1)).toBe(true);
    expect(schedule.stillFrame).toBe(4);
  });

  it('uses the full frame count of the view when nothing is symmetric', () => {
    expect(clipSchedule('tile', { ...SHOT, symmetry: 360 }).loopFrames).toBe(24);
    expect(clipSchedule('hero', { ...SHOT, symmetry: 360 }).loopFrames).toBe(48);
  });

  it('ignores symmetry while the camera orbits, so the loop stays seamless', () => {
    const schedule = clipSchedule('card', { ...SHOT, orbit: 360 });
    expect(schedule.loopFrames).toBe(36);
    expect(schedule.periodS).toBeCloseTo(1);
  });

  it('eases the focus camera move in before the loop, which starts where the move ends', () => {
    const schedule = clipSchedule('card', { ...SHOT, easeMs: 100 });
    const frameS = schedule.frameS;
    expect(schedule.introFrames).toBe(Math.ceil(0.1 / frameS));
    const intro = schedule.times.slice(0, schedule.introFrames);
    const loop = schedule.times.slice(schedule.introFrames);
    expect(intro[0]?.progress).toBe(0);
    expect(
      intro.every((time, at) => at === 0 || time.progress >= (intro[at - 1]?.progress ?? 0)),
    ).toBe(true);
    expect(loop[0]?.elapsedS).toBeCloseTo(schedule.introFrames * frameS);
    expect(loop.every((time) => time.progress === 1)).toBe(true);
    const stillS = loop[schedule.stillFrame]?.elapsedS ?? -1;
    const turns = (stillS - 0.1) / schedule.periodS;
    expect(Math.abs(turns - Math.round(turns))).toBeLessThan(1e-6);
  });

  it('packs frames into a near square grid', () => {
    expect(atlasGrid(36)).toEqual({ columns: 6, rows: 6 });
    expect(atlasGrid(8)).toEqual({ columns: 3, rows: 3 });
    expect(atlasGrid(1)).toEqual({ columns: 1, rows: 1 });
    const cell = { x: 0, y: 0, width: 10, height: 20 };
    expect(cellOrigin(4, atlasGrid(8), cell)).toEqual({ x: 10, y: 20, width: 10, height: 20 });
  });

  it('crops every frame with one shared rectangle', () => {
    expect(unionRect([null, null])).toBeNull();
    const rect = unionRect([
      { x: 2, y: 4, width: 4, height: 2 },
      null,
      { x: 1, y: 5, width: 2, height: 6 },
    ]);
    expect(rect).toEqual({ x: 1, y: 4, width: 5, height: 7 });
  });

  it('stages each frame cropped to its own bounds, never the full frame grid, at dpr 3', () => {
    const dpr = 3;
    const side = 280 * dpr;
    const renderer: FakeCanvas = { name: 'webgl', width: side, height: side, drawn: [] };
    const { made, make } = fakeCanvases();
    const count = 36;
    const bounds = (index: number): PixelRect | null =>
      index === 5 ? null : { x: 200 + (index % 4) * 10, y: 150, width: 420, height: 500 + index };
    const frames = Array.from({ length: count }, (_, index) =>
      cropFrame(renderer, bounds(index), make),
    );
    const atlas = packFrames(frames, make);
    expect(atlas).not.toBeNull();
    if (atlas === null) return;
    const grid = atlasGrid(count);
    expect(atlas.crop).toEqual({ x: 200, y: 150, width: 450, height: 535 });
    const staged = made.filter((canvas) => canvas !== atlas.canvas);
    expect(staged).toHaveLength(count - 1);
    for (const canvas of staged) {
      expect(canvas.width).toBe(420);
      expect(canvas.height).toBeLessThanOrEqual(atlas.crop.height);
    }
    for (const canvas of made) {
      expect(canvas.width).toBeLessThanOrEqual(grid.columns * atlas.crop.width);
      expect(canvas.height).toBeLessThanOrEqual(grid.rows * atlas.crop.height);
    }
    expect(atlas.canvas.width).toBe(grid.columns * atlas.crop.width);
    expect(atlas.canvas.height).toBe(grid.rows * atlas.crop.height);
    const peak = made.reduce((sum, canvas) => sum + bytes(canvas), 0);
    const fullGrid = grid.columns * side * grid.rows * side * 4;
    expect(peak).toBeLessThan(fullGrid);
  });

  it('places each cropped frame at its offset inside its shared atlas cell', () => {
    const renderer: FakeCanvas = { name: 'webgl', width: 100, height: 100, drawn: [] };
    const { make } = fakeCanvases();
    const frames = [
      cropFrame(renderer, { x: 10, y: 20, width: 30, height: 40 }, make),
      null,
      cropFrame(renderer, { x: 15, y: 25, width: 20, height: 10 }, make),
    ];
    const rect = (x: number, y: number, width: number, height: number): PixelRect => ({
      x,
      y,
      width,
      height,
    });
    expect(frames[0]?.canvas.drawn).toEqual([['webgl', rect(10, 20, 30, 40), rect(0, 0, 30, 40)]]);
    const atlas = packFrames(frames, make);
    expect(atlas?.grid).toEqual({ columns: 2, rows: 2 });
    expect(atlas?.canvas.drawn).toEqual([
      ['c0', rect(0, 0, 30, 40), rect(0, 0, 30, 40)],
      ['c1', rect(0, 0, 20, 10), rect(5, 45, 20, 10)],
    ]);
    expect(packFrames([null, null], make)).toBeNull();
  });
});
