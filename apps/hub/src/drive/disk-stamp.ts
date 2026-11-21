import { lstat } from 'node:fs/promises';
import type { FileStamp } from './intents';

export async function diskStampOf(path: string): Promise<FileStamp> {
  const stat = await lstat(path, { bigint: true });
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
