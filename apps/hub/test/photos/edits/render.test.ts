import { IDENTITY_RECIPE, compileRecipe, type PhotoRecipe } from '@smarteverything/domain';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { applyColour, isIdentityPlan } from '../../../src/photos/edits/colour-pass';
import { ColourRunner } from '../../../src/photos/edits/colour-runner';
import { renderPhoto } from '../../../src/photos/edits/render';
import { openPhoto } from '../../../src/photos/edits/source';
import { PreviewDecoders, SHARP_DECODER } from '../../../src/photos/pipeline/preview';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  bundleColourWorker,
  pixelAt,
  quadrants,
  rawOf,
  type ColourWorkerBundle,
} from './edit-fixture';

const RED = { r: 200, g: 40, b: 40 };
const GREEN = { r: 40, g: 200, b: 40 };
const BLUE = { r: 40, g: 40, b: 200 };
const GREY = { r: 120, g: 120, b: 120 };

let bundle: ColourWorkerBundle;
let folder = '';
let runner: ColourRunner;
const decoders = new PreviewDecoders();
decoders.register(SHARP_DECODER);

beforeAll(async () => {
  bundle = await bundleColourWorker();
  runner = new ColourRunner(bundle.script);
  folder = mkdtempSync(join(tmpdir(), 'edit-render-'));
});

afterAll(() => {
  bundle.dispose();
  rmSync(folder, { recursive: true, force: true });
});

function recipe(change: Partial<PhotoRecipe>): PhotoRecipe {
  return { ...IDENTITY_RECIPE, ...change };
}

async function render(
  image: Buffer,
  change: Partial<PhotoRecipe>,
  format: 'jpeg' | 'png' = 'png',
): Promise<Buffer> {
  const path = join(folder, `source-${String(Math.random())}.png`);
  writeFileSync(path, image);
  const photo = await openPhoto(
    { path, mime: 'image/png', name: 'a.png' },
    decoders,
    AbortSignal.timeout(10_000),
  );
  const done = await renderPhoto({
    photo,
    recipe: recipe(change),
    format,
    colour: runner,
    patch: () => Promise.reject(new Error('no patch expected')),
  });
  return done.bytes;
}

function near(actual: number, expected: number, tolerance = 1): void {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tolerance);
}

describe('the colour pass', () => {
  it('leaves an identity plan alone without starting a worker', async () => {
    const pixels = Uint8Array.from([1, 2, 3, 255]);
    expect(isIdentityPlan(compileRecipe(IDENTITY_RECIPE))).toBe(true);
    expect(
      await new ColourRunner('/no/such/worker.mjs').run(pixels, 4, compileRecipe(IDENTITY_RECIPE)),
    ).toBe(pixels);
  });

  it('gives the worker the same pixels as the direct pass', async () => {
    const plan = compileRecipe(
      recipe({
        light: { ...IDENTITY_RECIPE.light, exposure: 30, contrast: 20 },
        colour: { saturation: -40, warmth: 30, tint: -10 },
        filter: { preset: 'sepia', strength: 60 },
      }),
    );
    const source = Uint8Array.from({ length: 4 * 64 }, (_, index) => (index * 37) % 256);
    const direct = applyColour(source, 4, plan);
    const worked = await runner.run(Uint8Array.from(source), 4, plan);
    expect(Array.from(worked)).toStrictEqual(Array.from(direct));
    expect(Array.from(direct)).not.toStrictEqual(Array.from(source));
  });

  it('keeps the alpha channel and matches the compiled curve and matrix per pixel', () => {
    const plan = compileRecipe(recipe({ light: { ...IDENTITY_RECIPE.light, exposure: 50 } }));
    const pixels = applyColour(Uint8Array.from([64, 128, 200, 77]), 4, plan);
    expect(pixels[0]).toBe(plan.curves.red[64]);
    expect(pixels[1]).toBe(plan.curves.green[128]);
    expect(pixels[2]).toBe(plan.curves.blue[200]);
    expect(pixels[3]).toBe(77);
  });
});

describe('rendering a photo', () => {
  it('returns the same pixels for the identity recipe', async () => {
    const image = await quadrants(40, 30, [RED, GREEN, BLUE, GREY]);
    const out = await rawOf(await render(image, {}));
    expect(out.width).toBe(40);
    expect(out.height).toBe(30);
    expect(pixelAt(out, 5, 5)).toStrictEqual(RED);
    expect(pixelAt(out, 35, 25)).toStrictEqual(GREY);
  });

  it('flips, turns and crops in the compiled order', async () => {
    const image = await quadrants(40, 30, [RED, GREEN, BLUE, GREY]);
    const flipped = await rawOf(await render(image, { flipHorizontal: true }));
    expect(pixelAt(flipped, 5, 5)).toStrictEqual(GREEN);
    const turned = await rawOf(await render(image, { quarterTurns: 1 }));
    expect(turned.width).toBe(30);
    expect(turned.height).toBe(40);
    expect(pixelAt(turned, 25, 5)).toStrictEqual(RED);
    const cropped = await rawOf(
      await render(image, { quarterTurns: 1, crop: { x: 0, y: 0.5, w: 1, h: 0.5 } }),
    );
    expect(cropped.width).toBe(30);
    expect(cropped.height).toBe(20);
    expect(pixelAt(cropped, 25, 5)).toStrictEqual(GREEN);
    expect(pixelAt(cropped, 5, 5)).toStrictEqual(GREY);
  });

  it('straightens to the largest upright rectangle without empty corners', async () => {
    const image = await quadrants(200, 100, [GREY, GREY, GREY, GREY]);
    const out = await rawOf(await render(image, { straighten: 10 }));
    expect(out.width).toBeLessThan(200);
    expect(out.height).toBeLessThan(100);
    for (const [x, y] of [
      [0, 0],
      [out.width - 1, 0],
      [0, out.height - 1],
      [out.width - 1, out.height - 1],
    ] as const) {
      near(pixelAt(out, x, y).r, 120, 3);
    }
    expect(out.width / out.height).toBeCloseTo(2, 1);
  });

  it('applies light and colour within one level of the compiled values', async () => {
    const image = await quadrants(20, 20, [GREY, GREY, GREY, GREY]);
    const change = recipe({
      light: { ...IDENTITY_RECIPE.light, exposure: 40, shadows: 30 },
      colour: { saturation: 20, warmth: 25, tint: 0 },
    });
    const plan = compileRecipe(change);
    const expected = applyColour(Uint8Array.from([120, 120, 120, 255]), 4, plan);
    const out = await rawOf(await render(image, change));
    const got = pixelAt(out, 10, 10);
    near(got.r, expected[0] ?? 0);
    near(got.g, expected[1] ?? 0);
    near(got.b, expected[2] ?? 0);
  });

  it('writes a JPEG with the original EXIF and an upright orientation', async () => {
    const source = await sharp(await quadrants(40, 30, [RED, GREEN, BLUE, GREY]))
      .withMetadata({ orientation: 6 })
      .withExif({ IFD0: { Make: 'Test Maker' } })
      .jpeg()
      .toBuffer();
    const path = join(folder, 'exif.jpg');
    writeFileSync(path, source);
    const photo = await openPhoto(
      { path, mime: 'image/jpeg', name: 'exif.jpg' },
      decoders,
      AbortSignal.timeout(10_000),
    );
    const done = await renderPhoto({
      photo,
      recipe: IDENTITY_RECIPE,
      format: 'jpeg',
      colour: runner,
      patch: () => Promise.reject(new Error('none')),
    });
    const meta = await sharp(done.bytes).metadata();
    expect(meta.format).toBe('jpeg');
    expect(meta.orientation).toBe(1);
    expect(meta.exif?.toString('latin1')).toContain('Test Maker');
    expect(meta.width).toBe(30);
    expect(meta.height).toBe(40);
  });
});
