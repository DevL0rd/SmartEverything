import { execFile } from 'node:child_process';
import { rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { env } from 'node:process';
import { promisify } from 'node:util';

const run = promisify(execFile);

const FFMPEG_PACKAGE = 'ffmpeg-static';
const FFMPEG_FILES = ['ffmpeg', 'ffmpeg.exe'].flatMap((name) => [
  name,
  `${name}.README`,
  `${name}.LICENSE`,
]);

export function ffmpegShippedName(platform: string): string {
  return platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
}

export async function stageFfmpeg(
  serviceDirectory: string,
  platform: string,
  arch: string,
): Promise<void> {
  const directory = path.join(serviceDirectory, 'node_modules', FFMPEG_PACKAGE);
  const binary = path.join(directory, ffmpegShippedName(platform));
  try {
    await Promise.all(FFMPEG_FILES.map((name) => rm(path.join(directory, name), { force: true })));
    await run(process.execPath, ['install.js'], {
      cwd: directory,
      env: { ...env, npm_config_platform: platform, npm_config_arch: arch },
    });
    if (!(await stat(binary)).isFile()) throw new Error(`${binary} is not a file.`);
  } catch (cause) {
    throw new Error(
      `Could not stage the ffmpeg binary for ${platform}-${arch}; it is downloaded from the ffmpeg-static releases, so the packaging machine needs network access.`,
      { cause },
    );
  }
}
