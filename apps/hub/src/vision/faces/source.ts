import { execFile } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import sharp from 'sharp';
import { ffmpegPath, vaapiDevice } from '../../media/ffmpeg-path';
import { DERIVED_LONG_EDGE } from '../../photos/pipeline/derived-paths';
import { RGB_CHANNELS, type RgbImage } from './image';

const run = promisify(execFile);

export const SCENE_CHANGE_THRESHOLD = 0.3;

export async function rgbOf(bytes: Uint8Array): Promise<RgbImage> {
  const edge = DERIVED_LONG_EDGE.preview;
  const { data, info } = await sharp(bytes)
    .rotate()
    .resize({ width: edge, height: edge, fit: 'inside', withoutEnlargement: true })
    .removeAlpha()
    .toColourspace('srgb')
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (info.channels !== RGB_CHANNELS)
    throw new Error(`Expected ${String(RGB_CHANNELS)} channels, decoded ${String(info.channels)}.`);
  return { width: info.width, height: info.height, data: new Uint8Array(data) };
}

export function sceneArguments(
  videoPath: string,
  pattern: string,
  device: string | null,
): readonly string[] {
  const hardware = device === null ? [] : ['-hwaccel', 'vaapi', '-hwaccel_device', device];
  const select = `select='gt(scene,${String(SCENE_CHANGE_THRESHOLD)})'`;
  return [
    ...['-hide_banner', '-loglevel', 'error', ...hardware, '-i', videoPath, '-an'],
    ...['-vf', device === null ? select : `${select},format=yuvj420p`],
    ...['-fps_mode', 'vfr', '-q:v', '3', pattern],
  ];
}

export async function sceneFrames(
  videoPath: string,
  scratch: string,
  signal: AbortSignal,
): Promise<Buffer[]> {
  const directory = await mkdtemp(join(scratch, 'faces-frames-'));
  try {
    await run(
      ffmpegPath(),
      [...sceneArguments(videoPath, join(directory, 'scene-%06d.jpg'), vaapiDevice())],
      { signal },
    );
    const files = (await readdir(directory)).toSorted();
    return await Promise.all(files.map((file) => readFile(join(directory, file))));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
