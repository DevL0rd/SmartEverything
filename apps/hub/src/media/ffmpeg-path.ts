import { createRequire } from 'node:module';
import { z } from 'zod';

const BUNDLED_FFMPEG = z.string().min(1).nullable();

export class FfmpegUnavailableError extends Error {
  override readonly name = 'FfmpegUnavailableError';

  constructor(
    readonly platform: string,
    readonly arch: string,
  ) {
    super(`No ffmpeg ships with the service for ${platform}-${arch}.`);
  }
}

export function ffmpegPath(): string {
  const path = BUNDLED_FFMPEG.parse(createRequire(import.meta.url)('ffmpeg-static'));
  if (path === null) throw new FfmpegUnavailableError(process.platform, process.arch);
  return path;
}
