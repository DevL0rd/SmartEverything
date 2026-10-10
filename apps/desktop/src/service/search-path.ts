import path from 'node:path';
import type { DesktopFfmpeg, DesktopPlatform } from '@smarteverything/domain';

const EXTRA_DIRECTORIES: Readonly<Record<DesktopPlatform, readonly string[]>> = {
  linux: ['/usr/local/bin', '/usr/bin', '/bin'],
  darwin: ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin'],
  win32: [],
};

function pathModule(platform: DesktopPlatform): typeof path.posix {
  return platform === 'win32' ? path.win32 : path.posix;
}

function delimiterOf(platform: DesktopPlatform): string {
  return platform === 'win32' ? ';' : ':';
}

export function servicePath(platform: DesktopPlatform, current: string): string {
  const paths = pathModule(platform);
  const entries = [...current.split(delimiterOf(platform)), ...EXTRA_DIRECTORIES[platform]]
    .map((entry) => entry.trim())
    .filter((entry) => paths.isAbsolute(entry))
    .filter((entry) => !entry.split(/[\\/]/u).includes('node_modules'));
  return [...new Set(entries)].join(delimiterOf(platform));
}

export function executableCandidates(
  name: string,
  platform: DesktopPlatform,
  searchPath: string,
): readonly string[] {
  const paths = pathModule(platform);
  const file = platform === 'win32' ? `${name}.exe` : name;
  return searchPath
    .split(delimiterOf(platform))
    .filter((entry) => entry !== '')
    .map((directory) => paths.join(directory, file));
}

const FFMPEG_INSTRUCTIONS: Readonly<Record<DesktopPlatform, string>> = {
  linux:
    'Install ffmpeg with your package manager: "sudo pacman -S ffmpeg" on Arch, "sudo apt install ffmpeg" on Debian and Ubuntu, "sudo dnf install ffmpeg" on Fedora (with RPM Fusion). Then restart the server in Settings.',
  darwin:
    'Install ffmpeg with Homebrew: "brew install ffmpeg" in Terminal (https://brew.sh installs Homebrew). Then restart the server in Settings.',
  win32:
    'Install ffmpeg: "winget install --exact --id Gyan.FFmpeg" in a terminal, or download it from https://ffmpeg.org and add its bin folder to PATH. Then quit SmartEverything, open it again and restart the server in Settings.',
};

export function ffmpegCheck(
  platform: DesktopPlatform,
  searchPath: string,
  isFile: (candidate: string) => boolean,
): DesktopFfmpeg {
  const found = executableCandidates('ffmpeg', platform, searchPath).find(isFile);
  return {
    found: found !== undefined,
    path: found ?? null,
    instructions: found === undefined ? FFMPEG_INSTRUCTIONS[platform] : '',
  };
}
