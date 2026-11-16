import { join } from 'node:path';
import type { DriveIntent } from '../store/repositories/drive-intents';
import type { DriveItemDraft } from '../store/repositories/drive-items';
import {
  announce,
  appendFeed,
  fileDraft,
  identityOf,
  isoOf,
  parentOf,
  type ChangeActor,
  type ChangeEnv,
} from './changes';
import { statSyncOf } from './disk-stamp';
import { onlyFile, type FileItem } from './file-item';
import type { DriveWriteRoot, FileStamp } from './intents';
import { namesSharing } from './shared-names';
import { recordOutsideVersion } from './versions';

const OUTSIDE: ChangeActor = { actorProfileId: null, via: 'outside', deviceId: null };

interface Finished {
  readonly env: ChangeEnv;
  readonly root: DriveWriteRoot;
  readonly intent: DriveIntent;
  readonly existing: FileItem | undefined;
  readonly stamp: FileStamp;
}

function finishedDraft({ env, root, intent, existing, stamp }: Finished): DriveItemDraft {
  if (existing === undefined) {
    const added = {
      rootId: root.id,
      parentId: parentOf(env, root.id, intent.toPath)?.id ?? null,
      relPath: intent.toPath,
      modifiedAt: isoOf(stamp.mtimeNs),
      addedAt: env.now().toISOString(),
      outside: true,
      addedByProfileId: null,
    };
    return fileDraft(added, { bytes: stamp.size, sha256: null });
  }
  return {
    ...existing,
    bytes: stamp.size,
    modifiedAt: isoOf(stamp.mtimeNs),
    sha256: null,
    integrity: 'unknown',
    thumb: { state: 'none' },
    outside: true,
  };
}

export function finishCommitFromDisk(
  env: ChangeEnv,
): (intent: DriveIntent, root: DriveWriteRoot) => void {
  return (intent, root) => {
    const stamp = statSyncOf(join(root.path, intent.toPath));
    const existing = onlyFile(env.store.driveItems.byPath(root.id, intent.toPath, null));
    env.store.write(() => {
      if (intent.versionPath !== null && existing !== undefined) {
        recordOutsideVersion(env, root.id, { item: existing, versionPath: intent.versionPath });
      }
      const inode = { mtimeNs: stamp.mtimeNs };
      const identity = identityOf(stamp);
      const names = existing === undefined ? [] : [existing, ...namesSharing(env.store, existing)];
      const touched = (names.length === 0 ? [undefined] : names).map((name) => {
        const item = finishedDraft({ env, root, intent, existing: name, stamp });
        const written = env.store.driveItems.write({ item, identity, inode }).item;
        appendFeed(env, written, name === undefined ? 'create' : 'update', OUTSIDE);
        return written;
      });
      env.store.driveIntents.clear(intent.id);
      announce(env, root.id, touched[0]?.parentId ?? null, touched);
    });
    env.purge.rearm();
  };
}
