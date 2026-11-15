import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { renderDerived } from '../../src/photos/pipeline/preview';

const SIDE = 16_400;
const SHARP_DEFAULT_LIMIT = 268_402_689;

let directory = '';

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'pixel-limit-'));
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

describe('derived images of very large photos', () => {
  it('renders a photo above the default input pixel limit of the decoder', async () => {
    const path = join(directory, 'panorama.jpg');
    await sharp({
      create: { width: SIDE, height: SIDE, channels: 3, background: '#808080' },
      limitInputPixels: false,
    })
      .jpeg({ quality: 40 })
      .toFile(path);
    expect(SIDE * SIDE).toBeGreaterThan(SHARP_DEFAULT_LIMIT);
    await expect(sharp(path).resize(8).toBuffer()).rejects.toThrow(/pixel limit/);
    const rendered = await renderDerived({ kind: 'encoded', path });
    expect(rendered.width).toBeGreaterThan(0);
    expect(rendered.thumb.length).toBeGreaterThan(0);
  }, 120_000);
});
