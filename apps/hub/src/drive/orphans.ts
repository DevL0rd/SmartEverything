import { join } from 'node:path';
import {
  locate,
  moveWithin,
  orphanRelPath,
  type DriveFiles,
  type DriveWriteRoot,
  type FileEnv,
} from './intents';
import { ORPHAN_DIRECTORY } from './paths';

export async function holdOrphan(
  files: DriveFiles,
  root: DriveWriteRoot,
  relPath: string,
  inodeId: number,
): Promise<void> {
  await moveWithin(files, root, { from: relPath, to: orphanRelPath(inodeId), mode: 'replace' });
}

export async function dropOrphan(
  files: DriveFiles,
  root: DriveWriteRoot,
  inodeId: number,
): Promise<void> {
  await files.remove(await locate(root, orphanRelPath(inodeId)));
}

export async function sweepOrphansAtStart(env: FileEnv, root: DriveWriteRoot): Promise<number> {
  const directory = await locate(root, ORPHAN_DIRECTORY);
  const names = await env.files.list(directory);
  for (const name of names) {
    await env.files.remove(join(directory, name));
  }
  await env.store.host.write('driveOrphansSweep', root.id);
  return names.length;
}
