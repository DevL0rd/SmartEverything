import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { ffmpegPath } from '../media/ffmpeg-path';

const run = promisify(execFile);

export const REQUEST_BYTES_MAX = 18 * 1024 * 1024;
const BASE_TIMEOUT_MS = 90_000;
const TIMEOUT_PER_MIB_MS = 30_000;

export function requestTimeoutMs(bytes: number): number {
  return BASE_TIMEOUT_MS + Math.ceil(bytes / (1024 * 1024)) * TIMEOUT_PER_MIB_MS;
}

interface Shrunk {
  readonly data: Buffer;
  readonly mime: string;
  readonly extension: string;
}

const SPEECH = {
  mime: 'audio/ogg',
  extension: 'ogg',
  args: ['-vn', '-ac', '1', '-ar', '16000', '-c:a', 'libopus', '-b:a', '16k'],
} as const;
const VIDEO = {
  mime: 'video/mp4',
  extension: 'mp4',
  args: [
    ...['-vf', 'scale=-2:360,fps=5', '-c:v', 'libx264', '-crf', '35', '-preset', 'veryfast'],
    ...['-ac', '1', '-ar', '16000', '-c:a', 'aac', '-b:a', '24k', '-movflags', '+faststart'],
  ],
} as const;
const STILL = {
  mime: 'image/jpeg',
  extension: 'jpg',
  args: ['-vf', "scale='min(2048,iw)':-2", '-frames:v', '1', '-q:v', '4'],
} as const;

function recipeOf(mime: string): typeof SPEECH | typeof VIDEO | typeof STILL | undefined {
  if (mime.startsWith('audio/')) return SPEECH;
  if (mime.startsWith('video/')) return VIDEO;
  if (mime.startsWith('image/')) return STILL;
  return undefined;
}

export async function shrinkMedia(
  data: Buffer,
  mime: string,
  limit: number = REQUEST_BYTES_MAX,
): Promise<Shrunk | undefined> {
  const recipe = recipeOf(mime);
  if (recipe === undefined) return undefined;
  const directory = await mkdtemp(join(tmpdir(), 'smarteverything-media-'));
  try {
    const source = join(directory, 'source');
    const target = join(directory, `shrunk.${recipe.extension}`);
    await writeFile(source, data);
    await run(ffmpegPath(), ['-v', 'error', '-i', source, ...recipe.args, '-y', target]);
    const shrunk = await readFile(target);
    return shrunk.byteLength > limit
      ? undefined
      : { data: shrunk, mime: recipe.mime, extension: recipe.extension };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
