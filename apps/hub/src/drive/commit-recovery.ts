import { join } from 'node:path';
import type { DriveIntent } from '../store/repositories/drive-intents';
import { fileDraft, parentIn, type ChangeEnv } from './changes';
import { isoOf } from './change-rows';
import { diskStampOf } from './disk-stamp';
import { onlyFile } from './file-item';
import type { DriveWriteRoot } from './intents';

export function finishCommitFromDisk(
  env: ChangeEnv,
): (intent: DriveIntent, root: DriveWriteRoot) => Promise<void> {
  return async (intent, root) => {
    const stamp = await diskStampOf(join(root.path, intent.toPath));
    const existing = onlyFile(
      await env.store.host.call('driveItems', 'byPath', root.id, intent.toPath, null),
    );
    const added =
      existing === undefined
        ? fileDraft(
            {
              rootId: root.id,
              parentId: (await parentIn(env, root.id, intent.toPath))?.id ?? null,
              relPath: intent.toPath,
              modifiedAt: isoOf(stamp.mtimeNs),
              addedAt: env.now().toISOString(),
              outside: true,
              addedByProfileId: null,
            },
            { bytes: stamp.size, sha256: null },
          )
        : null;
    await env.store.host.write('driveFinishCommit', {
      rootId: root.id,
      intent,
      existing,
      added,
      stamp,
    });
    env.purge.rearm();
  };
}
