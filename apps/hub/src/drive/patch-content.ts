import type { ChangeActor, ChangeEnv, ContentResult } from './changes';
import { finishContent, locateExisting, settleContent, trustedSha } from './changes';
import type { DriveItem } from '@smarteverything/domain';
import { DriveWriteError, type DriveWriteRoot } from './intents';
import { commitPatch } from './patch-commit';
import type { ContentPatch } from './patch-files';
import { parentOf } from './changes';

export interface PatchWrite {
  readonly root: DriveWriteRoot;
  readonly staged: { readonly relPath: string };
  readonly relPath: string;
  readonly patch: ContentPatch;
  readonly actor: ChangeActor;
  readonly alongside?: (item: DriveItem) => void;
}

export async function commitPatchContent(
  env: ChangeEnv,
  write: PatchWrite,
): Promise<ContentResult> {
  const { root, relPath, actor } = write;
  const { existing, before } = await locateExisting(env, root, relPath);
  if (existing === undefined) {
    throw new DriveWriteError('missing', 'The file to patch is not in the index.');
  }
  const parent = parentOf(env, root.id, relPath);
  const committed = await commitPatch(env, {
    root,
    staged: write.staged,
    relPath,
    previousSha256: trustedSha(existing, before),
    patch: write.patch,
  });
  const settle = { env, root, relPath, actor, alongside: write.alongside, mode: undefined };
  return finishContent(env, root, committed, () =>
    settleContent({ ...settle, existing, parent, before, committed }),
  );
}
