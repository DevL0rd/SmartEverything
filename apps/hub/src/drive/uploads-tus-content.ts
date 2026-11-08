import { createHash } from 'node:crypto';
import type { DriveUpload } from '@smarteverything/domain';
import type { ChangeEnv } from './changes';
import { locate, type DriveWriteRoot } from './intents';
import { tmpPath, TusError } from './uploads-tus-wire';
import type { StagedBytes } from './versions';

export async function stagedUpload(
  env: ChangeEnv,
  root: DriveWriteRoot,
  upload: DriveUpload,
  expected: string | null,
): Promise<StagedBytes> {
  const relPath = tmpPath(upload.id);
  const hash = createHash('sha256');
  for await (const chunk of env.files.read(await locate(root, relPath))) hash.update(chunk);
  const sha256 = hash.digest('hex');
  if (expected !== null && expected !== sha256) {
    throw new TusError(460, 'The file checksum does not match the expected upload content.');
  }
  return { relPath, bytes: upload.length, sha256 };
}
