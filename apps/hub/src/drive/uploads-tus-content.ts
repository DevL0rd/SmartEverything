import type { DriveUpload } from '@smarteverything/domain';
import type { BlockHashes } from './blocks';
import type { ChangeEnv } from './changes';
import type { ContentHasher } from './hasher';
import { locate, type DriveWriteRoot } from './intents';
import { absent, tmpPath, TusError } from './uploads-tus-wire';
import type { StagedBytes } from './versions';

export interface StagedEnv extends ChangeEnv {
  readonly hasher: Pick<ContentHasher, 'hash'>;
}

export interface StagedUpload {
  readonly staged: StagedBytes;
  readonly blocks: BlockHashes | null;
}

export async function stagedUpload(
  env: StagedEnv,
  root: DriveWriteRoot,
  upload: DriveUpload,
  expected: string | null,
): Promise<StagedUpload> {
  const relPath = tmpPath(upload.id);
  const stamp = await env.files.stamp(await locate(root, relPath));
  if (stamp === null) throw absent();
  const placements = await env.store.host.call('drivePlacements', 'forRoot', root.id);
  const { sha256, blocks } = await env.hasher.hash(
    { rootPath: root.path, relPath, dev: stamp.dev, ino: stamp.ino },
    placements.some((placement) => placement.mode === 'synced'),
  );
  if (expected !== null && expected !== sha256) {
    throw new TusError(460, 'The file checksum does not match the expected upload content.');
  }
  return { staged: { relPath, bytes: upload.length, sha256 }, blocks };
}
