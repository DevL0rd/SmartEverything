import { describe, expect, it } from 'vitest';
import {
  IDENTITY_RECIPE,
  PHOTO_RECIPE,
  type EditJob,
  type PhotoRecipe,
} from '@smarteverything/domain';
import { coverTile, shownView, stageOf } from './canvas-view';
import { dragged, minimumOf, presetBox, ratioOf, WHOLE } from './crop-model';
import { brushPx, erasedSummary, pointIn } from './eraser-model';
import { apply } from './geometry';
import { tileRect } from './gl-render';
import { canRedo, canUndo, committed, drafted, historyOf, redone, shown, undone } from './history';
import { jobViewOf } from './job-view';
import {
  adjustValue,
  adjusted,
  chipLabel,
  cropped,
  mirrored,
  rotatedClockwise,
  sameRecipe,
  withFilter,
  withFilterStrength,
  withPatch,
} from './recipe-ops';
import { frameCount, frameTimes, movedTrim, trimOf, trimSummary, videoEditOf } from './trim-model';

const SOURCE = { width: 400, height: 300 };

const PATCH = '6f1d3c7a-2b4e-4f5a-9c8d-1e2f3a4b5c6d';

function valid(recipe: PhotoRecipe): boolean {
  return PHOTO_RECIPE.safeParse(recipe).success;
}

describe('recipe changes', () => {
  it('rotates four times back to where it started, crop included', () => {
    const start = cropped(IDENTITY_RECIPE, { x: 0.1, y: 0.2, w: 0.3, h: 0.4 });
    const once = rotatedClockwise(start);
    expect(once.quarterTurns).toBe(1);
    expect(once.crop).toEqual({ x: 1 - 0.2 - 0.4, y: 0.1, w: 0.4, h: 0.3 });
    let turned = start;
    for (let step = 0; step < 4; step += 1) turned = rotatedClockwise(turned);
    expect(turned.quarterTurns).toBe(0);
    expect(turned.crop?.x).toBeCloseTo(0.1, 9);
    expect(turned.crop?.w).toBeCloseTo(0.3, 9);
  });

  it('flips what is shown, the vertical axis of the photo when it is turned sideways', () => {
    expect(mirrored(IDENTITY_RECIPE).flipHorizontal).toBe(true);
    const sideways = mirrored({ ...IDENTITY_RECIPE, quarterTurns: 1, straighten: 5 });
    expect(sideways.flipVertical).toBe(true);
    expect(sideways.flipHorizontal).toBe(false);
    expect(sideways.straighten).toBe(-5);
  });

  it('mirrors the shown picture exactly when flipped', () => {
    const start = { ...IDENTITY_RECIPE, quarterTurns: 1, crop: { x: 0.1, y: 0, w: 0.5, h: 1 } };
    const before = shownView(start, SOURCE, 'result').view.transform;
    const after = shownView(mirrored(start), SOURCE, 'result').view.transform;
    const left = apply(before, 0, 0.3);
    const right = apply(after, 1, 0.3);
    expect(right.x).toBeCloseTo(left.x, 9);
    expect(right.y).toBeCloseTo(left.y, 9);
  });

  it('keeps every change inside the strict recipe schema', () => {
    const recipe = withPatch(
      withFilterStrength(withFilter(adjusted(IDENTITY_RECIPE, 'warmth', 40), 'noir'), 30),
      PATCH,
      { x: 0, y: 0, w: 0.5, h: 0.5 },
    );
    expect(valid(recipe)).toBe(true);
    expect(adjustValue(recipe, 'warmth')).toBe(40);
    expect(recipe.filter).toEqual({ preset: 'noir', strength: 30 });
    expect(withFilter(recipe, 'mono').filter).toEqual({ preset: 'mono', strength: 30 });
    expect(withFilter(recipe, null).filter).toBeNull();
    expect(cropped(IDENTITY_RECIPE, WHOLE).crop).toBeNull();
    expect(chipLabel('exposure', 0)).toBe('Exposure');
    expect(chipLabel('exposure', 12)).toBe('Exposure +12');
    expect(chipLabel('tint', -3)).toBe('Tint -3');
  });
});

describe('history', () => {
  it('commits, undoes and redoes, while drafts stay out of the history', () => {
    const warm = adjusted(IDENTITY_RECIPE, 'warmth', 10);
    let history = drafted(historyOf(IDENTITY_RECIPE), warm);
    expect(shown(history)).toBe(warm);
    expect(canUndo(history)).toBe(false);
    history = committed(history, warm);
    expect(canUndo(history)).toBe(true);
    history = undone(history);
    expect(sameRecipe(shown(history), IDENTITY_RECIPE)).toBe(true);
    expect(canRedo(history)).toBe(true);
    history = redone(history);
    expect(shown(history)).toBe(warm);
    expect(committed(history, warm).past).toHaveLength(1);
    expect(undone(historyOf(warm)).present).toBe(warm);
  });
});

describe('crop handles', () => {
  const min = minimumOf(48, { width: 480, height: 480 });

  it('drags an edge and stops at the picture and the minimum size', () => {
    const box = { x: 0.2, y: 0.2, w: 0.6, h: 0.6 };
    expect(dragged({ start: box, handle: 'e', dx: 0.5, dy: 0, min, share: null }).w).toBeCloseTo(
      0.8,
    );
    expect(dragged({ start: box, handle: 'w', dx: 0.7, dy: 0, min, share: null }).w).toBeCloseTo(
      0.2,
    );
    expect(dragged({ start: box, handle: 'move', dx: 1, dy: -1, min, share: null })).toEqual({
      x: 0.4,
      y: 0,
      w: 0.6,
      h: 0.6,
    });
  });

  it('keeps a locked aspect while dragging a corner', () => {
    const box = presetBox(1, 4 / 3);
    const grown = dragged({ start: box, handle: 'se', dx: -0.1, dy: 0, min, share: 0.75 });
    expect(grown.w / grown.h).toBeCloseTo(0.75, 9);
    expect(grown.x).toBeCloseTo(box.x, 9);
    expect(grown.y + grown.h).toBeLessThanOrEqual(1 + 1e-9);
  });

  it('centres a preset inside the picture', () => {
    expect(presetBox(1, 2)).toEqual({ x: 0.25, y: 0, w: 0.5, h: 1 });
    expect(ratioOf('free', 2)).toBeNull();
    expect(ratioOf('original', 1.5)).toBe(1.5);
    expect(ratioOf('16:9', 1)).toBeCloseTo(16 / 9);
  });
});

describe('canvas views', () => {
  it('shows the uncropped picture while cropping and the original while comparing', () => {
    const recipe = cropped(adjusted(IDENTITY_RECIPE, 'exposure', 50), {
      x: 0,
      y: 0,
      w: 0.5,
      h: 0.5,
    });
    expect(shownView(recipe, SOURCE, 'crop').size).toEqual(SOURCE);
    expect(shownView(recipe, SOURCE, 'result').size).toEqual({ width: 200, height: 150 });
    const original = shownView(recipe, SOURCE, 'original').view;
    expect(original.curves.slice(0, 6)).toEqual([0, 0, 0, 1, 1, 1]);
    expect(shownView(recipe, SOURCE, 'result').view.curves[3]).toBeGreaterThan(1);
    expect(stageOf('crop', false)).toBe('crop');
    expect(stageOf('eraser', false)).toBe('source');
    expect(stageOf('adjust', true)).toBe('original');
    expect(shownView(recipe, SOURCE, 'source').view.patched).toBe(true);
    expect(shownView(recipe, SOURCE, 'result').view.patched).toBe(true);
    expect(shownView(recipe, SOURCE, 'crop').view.patched).toBe(true);
    expect(original.patched).toBe(false);
  });

  it('covers a tile without stretching', () => {
    const tile = coverTile(shownView(IDENTITY_RECIPE, { width: 200, height: 100 }, 'result'), 1);
    expect(apply(tile.transform, 0, 0).x).toBeCloseTo(0.25);
    expect(apply(tile.transform, 1, 1).x).toBeCloseTo(0.75);
    expect(apply(tile.transform, 1, 1).y).toBeCloseTo(1);
  });

  it('lays the filter tiles side by side with the gap', () => {
    const layout = { width: 320, height: 72, columns: 3, gap: 10, rowGap: 0 };
    expect(tileRect(2, 3, layout)).toEqual({ x: 220, y: 0, width: 100, height: 72 });
  });

  it('wraps the filter tiles into rows counted from the top of the canvas', () => {
    const layout = { width: 320, height: 172, columns: 3, gap: 10, rowGap: 28 };
    expect(tileRect(0, 5, layout)).toEqual({ x: 0, y: 100, width: 100, height: 72 });
    expect(tileRect(4, 5, layout)).toEqual({ x: 110, y: 0, width: 100, height: 72 });
  });
});

describe('eraser', () => {
  it('turns touches into points on the photo', () => {
    const rect = { left: 0, top: 0, width: 200, height: 100 };
    expect(pointIn(rect, 50, 150)).toEqual({ x: 0.25, y: 1 });
    expect(brushPx(0.1, rect)).toBe(10);
    expect(erasedSummary(0, false)).toBe('Brush over what to remove, then tap Erase.');
    expect(erasedSummary(0, true)).toBe('Brush over what to remove, then click Erase.');
    expect(erasedSummary(2, true)).toContain('2 areas');
    expect(erasedSummary(1, false)).toBe('One area erased.');
  });
});

describe('video trim', () => {
  it('keeps the start before the end and builds the edit', () => {
    const trim = trimOf(10_000);
    expect(videoEditOf(trim, false, 'version')).toBeNull();
    expect(videoEditOf(trim, true, 'copy')).toEqual({ trim: null, stabilize: true, mode: 'copy' });
    const cut = movedTrim(movedTrim(trim, 'start', 2_000), 'end', 1_000);
    expect(cut).toMatchObject({ startMs: 2_000, endMs: 2_001 });
    expect(movedTrim(trim, 'start', -5).startMs).toBe(0);
    expect(videoEditOf(movedTrim(trim, 'end', 8_000), false, 'version')).toEqual({
      trim: { startMs: 0, endMs: 8_000 },
      stabilize: false,
      mode: 'version',
    });
    expect(trimSummary(movedTrim(trim, 'end', 8_000))).toBe('0:00 to 0:08 · 0:08 kept');
  });

  it('fills the bar with frames spread over the video', () => {
    expect(frameCount(300, 64)).toBe(5);
    expect(frameCount(0, 64)).toBe(0);
    expect(frameTimes(2, 1_000)).toEqual([250, 750]);
  });
});

describe('job view', () => {
  it('names the progress of a video edit', () => {
    const job: EditJob = {
      id: PATCH,
      itemId: PATCH,
      state: 'running',
      progress: 0.42,
      resultItemId: null,
      error: null,
    };
    expect(jobViewOf(job)).toEqual({ progress: 0.42, label: 'Saving the edited video, 42%' });
    expect(jobViewOf(null).progress).toBeNull();
  });
});
