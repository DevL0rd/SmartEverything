import { NAME_MAX_BYTES, type ReplyMeta } from '@smarteverything/domain/drive-mount';
import { fsStatfs } from '../fs-space';
import type { PosixEnv, PosixScope } from './env';
import type { PosixNodes } from './nodes';

export const FILESYSTEM_BLOCK_BYTES = 4096;

export type StatfsReply = ReplyMeta<'STATFS'>;

export async function statfsOf(
  env: PosixEnv,
  nodes: PosixNodes,
  scope: PosixScope,
  ino: number,
): Promise<StatfsReply> {
  await nodes.node(scope, ino);
  const space = await fsStatfs(env.space, scope.caller, scope.drive.id, scope.baseId ?? undefined);
  const used = await env.change.store.host.call('driveInodes', 'inodeCount', scope.drive.id);
  const free = Math.floor(space.freeBytes / FILESYSTEM_BLOCK_BYTES);
  return {
    blocks: Math.ceil(space.totalBytes / FILESYSTEM_BLOCK_BYTES),
    free,
    avail: free,
    files: used + space.freeFiles,
    ffree: space.freeFiles,
    bsize: FILESYSTEM_BLOCK_BYTES,
    namelen: NAME_MAX_BYTES,
  };
}
