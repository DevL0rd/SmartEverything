import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { locate, TMP_DIRECTORY, tmpRelPath, type DriveWriteRoot, type FileEnv } from './intents';
import { stageBytes, type StagedBytes } from './versions';

const EMPTY_SHA256 = createHash('sha256').digest('hex');

export async function stageEmpty(env: FileEnv, root: DriveWriteRoot): Promise<StagedBytes> {
  const relPath = tmpRelPath();
  const path = await locate(root, relPath);
  await env.files.mkdir(await locate(root, TMP_DIRECTORY));
  await env.files.stageEmpty(path);
  return { relPath, bytes: 0, sha256: EMPTY_SHA256 };
}

export async function stageContent(
  env: FileEnv,
  root: DriveWriteRoot,
  content: Uint8Array,
): Promise<StagedBytes> {
  if (content.length === 0) return stageEmpty(env, root);
  return stageBytes(env, root, Readable.from([Buffer.from(content)]));
}
