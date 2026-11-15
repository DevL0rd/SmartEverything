import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ffmpegPath } from '../../src/media/ffmpeg-path';
import { rgbOf, sceneFrames } from '../../src/vision/faces/source';

const run = promisify(execFile);

let directory = '';

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'faces-source-'));
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

describe('face sources', () => {
  it('decodes any image to upright sRGB pixels no larger than the preview', async () => {
    const wide = await sharp({
      create: {
        width: 3000,
        height: 1000,
        channels: 4,
        background: { r: 200, g: 0, b: 0, alpha: 1 },
      },
    })
      .png()
      .toBuffer();
    const image = await rgbOf(wide);
    expect(image.width).toBe(2048);
    expect(image.height).toBe(683);
    expect(image.data).toHaveLength(image.width * image.height * 3);
    expect([...image.data.subarray(0, 3)]).toStrictEqual([200, 0, 0]);
  });

  it('honours the orientation of a photo', async () => {
    const turned = await sharp({
      create: { width: 40, height: 20, channels: 3, background: { r: 1, g: 2, b: 3 } },
    })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();
    const image = await rgbOf(turned);
    expect([image.width, image.height]).toStrictEqual([20, 40]);
  });

  it('pulls one frame at each scene change of a video', async () => {
    const video = join(directory, 'cuts.mp4');
    await run(ffmpegPath(), [
      ...[
        '-hide_banner',
        '-loglevel',
        'error',
        '-f',
        'lavfi',
        '-i',
        'color=c=red:s=96x96:d=1:r=10',
      ],
      ...['-f', 'lavfi', '-i', 'color=c=blue:s=96x96:d=1:r=10'],
      ...['-f', 'lavfi', '-i', 'color=c=green:s=96x96:d=1:r=10'],
      ...['-filter_complex', '[0][1][2]concat=n=3:v=1:a=0,format=yuv420p', '-y', video],
    ]);
    const frames = await sceneFrames(video, directory, new AbortController().signal);
    expect(frames).toHaveLength(2);
    const [first, second] = await Promise.all(frames.map((frame) => rgbOf(frame)));
    expect(first?.data[2]).toBeGreaterThan(first?.data[0] ?? 255);
    expect(second?.data[1]).toBeGreaterThan(second?.data[2] ?? 255);
  }, 60_000);

  it('returns nothing for a video without a scene change', async () => {
    const video = join(directory, 'still.mp4');
    await run(ffmpegPath(), [
      ...[
        '-hide_banner',
        '-loglevel',
        'error',
        '-f',
        'lavfi',
        '-i',
        'color=c=red:s=96x96:d=1:r=10',
      ],
      ...['-pix_fmt', 'yuv420p', '-y', video],
    ]);
    expect(await sceneFrames(video, directory, new AbortController().signal)).toStrictEqual([]);
  }, 60_000);
});
