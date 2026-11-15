import { lstatSync } from 'node:fs';
import type { FileStamp } from './intents';

export function statSyncOf(path: string): FileStamp {
  const stat = lstatSync(path, { bigint: true });
  return {
    dev: stat.dev,
    ino: stat.ino,
    size: Number(stat.size),
    mtimeNs: stat.mtimeNs,
    mode: Number(stat.mode & 0o7777n),
    nlink: Number(stat.nlink),
    directory: stat.isDirectory(),
    symlink: stat.isSymbolicLink(),
  };
}
