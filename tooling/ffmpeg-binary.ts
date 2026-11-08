import { execFile } from 'node:child_process';
import { statSync } from 'node:fs';
import { rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { env } from 'node:process';
import { promisify } from 'node:util';
import { archOfElfMachine, elfMachine } from './native-binary.ts';

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

function matchesLinuxTarget(binary: string, platform: string, arch: string): boolean {
  if (platform !== 'linux') return false;
  if (arch !== 'x64' && arch !== 'arm64') return false;
  if (statSync(binary, { throwIfNoEntry: false })?.isFile() !== true) return false;
  const machine = elfMachine(binary);
  return machine !== undefined && archOfElfMachine(machine) === arch;
}

export async function stageFfmpeg(
  serviceDirectory: string,
  platform: string,
  arch: string,
): Promise<void> {
  const directory = path.join(serviceDirectory, 'node_modules', FFMPEG_PACKAGE);
  const binary = path.join(directory, ffmpegShippedName(platform));
  try {
    if (matchesLinuxTarget(binary, platform, arch)) return;
    await Promise.all(FFMPEG_FILES.map((name) => rm(path.join(directory, name), { force: true })));
    await run(process.execPath, ['install.js'], {
      cwd: directory,
      env: { ...env, npm_config_platform: platform, npm_config_arch: arch },
    });
    if (!(await stat(binary)).isFile()) throw new Error(`${binary} is not a file.`);
    if (
      platform === 'linux' &&
      (arch === 'x64' || arch === 'arm64') &&
      !matchesLinuxTarget(binary, platform, arch)
    ) {
      throw new Error(`${binary} is not a Linux ${arch} binary.`);
    }
  } catch (cause) {
    throw new Error(
      `Could not stage the ffmpeg binary for ${platform}-${arch}; it is downloaded from the ffmpeg-static releases, so the packaging machine needs network access.`,
      { cause },
    );
  }
}
