import type { ChangeActor, ChangeEnv, ContentResult } from './changes';
import { finishContent, locateExisting, trustedSha } from './changes';
import type { DriveWriteRoot } from './intents';
import { DriveWriteError } from './write-error';
import { commitPatch } from './patch-commit';
import type { ContentPatch } from './patch-files';
import type { ContentAlongside, SettledContent } from './units/content';

export interface PatchWrite {
  readonly root: DriveWriteRoot;
  readonly staged: { readonly relPath: string };
  readonly relPath: string;
  readonly patch: ContentPatch;
  readonly actor: ChangeActor;
  readonly alongside?: readonly ContentAlongside[];
  readonly settled?: (settled: SettledContent) => void;
}

export async function commitPatchContent(
  env: ChangeEnv,
  write: PatchWrite,
): Promise<ContentResult> {
  const { root, relPath, actor } = write;
  const located = await locateExisting(env, root, relPath);
  if (located.existing === undefined) {
    throw new DriveWriteError('missing', 'The file to patch is not in the index.');
  }
  const committed = await commitPatch(env, {
    root,
    staged: write.staged,
    relPath,
    previousSha256: trustedSha(located.existing, located.before),
    patch: write.patch,
  });
  const content = {
    root,
    relPath,
    actor,
    ...(write.alongside === undefined ? {} : { alongside: write.alongside }),
    ...(write.settled === undefined ? {} : { settled: write.settled }),
  };
  return finishContent(env, { write: content, located, committed });
}
