import type { DriveUpload } from '@smarteverything/domain';
import type { ChangeEnv } from './changes';
import type { ContentHasher } from './hasher';
import { locate, type DriveWriteRoot } from './intents';
import { absent, tmpPath, TusError } from './uploads-tus-wire';
import type { StagedBytes } from './versions';

export interface StagedEnv extends ChangeEnv {
  readonly hasher: Pick<ContentHasher, 'sha256'>;
}

export async function stagedUpload(
  env: StagedEnv,
  root: DriveWriteRoot,
  upload: DriveUpload,
  expected: string | null,
): Promise<StagedBytes> {
  const relPath = tmpPath(upload.id);
  const stamp = await env.files.stamp(await locate(root, relPath));
  if (stamp === null) throw absent();
  const sha256 = await env.hasher.sha256({
    rootPath: root.path,
    relPath,
    dev: stamp.dev,
    ino: stamp.ino,
  });
  if (expected !== null && expected !== sha256) {
    throw new TusError(460, 'The file checksum does not match the expected upload content.');
  }
  return { relPath, bytes: upload.length, sha256 };
}
