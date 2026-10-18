import { execFile } from 'node:child_process';
import { rename, rm, stat } from 'node:fs/promises';
import { basename } from 'node:path';
import { promisify } from 'node:util';
import { THUMBNAIL_WIDTH } from '@smarteverything/domain';
import { ffmpegPath } from '../media/ffmpeg-path';
import { isMissing } from '../fs-util';
import { messageOf } from '@smarteverything/logging';

const run = promisify(execFile);

const FFMPEG_TIMEOUT_MS = 20_000;

export class ThumbnailError extends Error {
  override readonly name = 'ThumbnailError';

  constructor(
    source: string,
    override readonly cause: unknown,
  ) {
    super(`ffmpeg could not make a thumbnail of ${basename(source)}: ${messageOf(cause)}`);
  }
}

export function thumbnailPathOf(source: string): string {
  return `${source}.thumb.jpg`;
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (cause) {
    if (isMissing(cause)) {
      return false;
    }
    throw cause;
  }
}

async function render(source: string, target: string): Promise<void> {
  const partial = `${target}.part`;
  try {
    await run(
      ffmpegPath(),
      [
        '-v',
        'error',
        '-i',
        source,
        '-frames:v',
        '1',
        '-vf',
        `scale='min(${String(THUMBNAIL_WIDTH)},iw)':-2`,
        '-f',
        'mjpeg',
        '-y',
        partial,
      ],
      { timeout: FFMPEG_TIMEOUT_MS },
    );
    await rename(partial, target);
  } catch (cause) {
    await rm(partial, { force: true });
    throw new ThumbnailError(source, cause);
  }
}

export class Thumbnails {
  private readonly making = new Map<string, Promise<string>>();

  of(source: string): Promise<string> {
    const target = thumbnailPathOf(source);
    const pending = this.making.get(target);
    if (pending !== undefined) {
      return pending;
    }
    const made = this.make(source, target).finally(() => {
      this.making.delete(target);
    });
    this.making.set(target, made);
    return made;
  }

  private async make(source: string, target: string): Promise<string> {
    if (!(await exists(target))) {
      await render(source, target);
    }
    return target;
  }
}
