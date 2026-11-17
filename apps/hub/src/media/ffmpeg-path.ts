import { createRequire } from 'node:module';
import type { Logger } from '@smarteverything/logging';
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

export interface SystemFfmpeg {
  readonly binary: string;
  readonly vaapiDevice?: string | undefined;
}

let system: SystemFfmpeg | null = null;

export function selectFfmpeg(configured: SystemFfmpeg | undefined, log: Logger): void {
  system = configured ?? null;
  if (system === null) {
    log.info('media.ffmpeg_selected', { source: 'bundled', video: 'software' });
    return;
  }
  log.info('media.ffmpeg_selected', {
    source: 'system',
    binary: system.binary,
    video: system.vaapiDevice === undefined ? 'software' : 'vaapi',
    ...(system.vaapiDevice === undefined ? {} : { device: system.vaapiDevice }),
  });
}

export function vaapiDevice(): string | null {
  return system?.vaapiDevice ?? null;
}

function bundledFfmpegPath(): string {
  const path = BUNDLED_FFMPEG.parse(createRequire(import.meta.url)('ffmpeg-static'));
  if (path === null) throw new FfmpegUnavailableError(process.platform, process.arch);
  return path;
}

export function ffmpegPath(): string {
  return system === null ? bundledFfmpegPath() : system.binary;
}
