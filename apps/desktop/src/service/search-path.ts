import path from 'node:path';
import type { DesktopPlatform } from '@smarteverything/domain';

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
