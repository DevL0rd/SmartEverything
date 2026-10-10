import { existsSync, readlinkSync } from 'node:fs';
import { join } from 'node:path';
import { platform } from 'node:process';
import type { ClaudeStatus } from '@smarteverything/domain';
import { ClaudeProcReadError } from './errors';
import { processStart } from './proc';

export const SINGLETON_LOCK = 'SingletonLock';

type DesktopState = ClaudeStatus['desktop']['state'];

const LOCK_HOLDER = /-(\d+)$/;

function lockHolder(path: string): number | null {
  let target: string;
  try {
    target = readlinkSync(path);
  } catch (cause) {
    if (cause instanceof Error && 'code' in cause && cause.code === 'ENOENT') {
      return null;
    }
    throw new ClaudeProcReadError(path, cause instanceof Error ? cause.message : String(cause));
  }
  const holder = LOCK_HOLDER.exec(target)?.[1];
  if (holder === undefined) {
    throw new ClaudeProcReadError(path, 'the lock does not name a process');
  }
  return Number(holder);
}

export function desktopStateOf(desktopDirectory: string): DesktopState {
  if (platform !== 'linux') {
    return 'unsupported_platform';
  }
  if (!existsSync(desktopDirectory)) {
    return 'not_found';
  }
  const holder = lockHolder(join(desktopDirectory, SINGLETON_LOCK));
  return holder !== null && processStart(holder) !== null ? 'running' : 'not_running';
}
