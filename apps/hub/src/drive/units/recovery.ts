import type { DriveItem } from '@smarteverything/domain';
import type { DriveIntent } from '../../store/repositories/drive-intents';
import type { DriveItemDraft } from '../../store/repositories/drive-items';
import type { HostStore } from '../../store/host/host-store';
import { storeUnit } from '../../store/host/unit';
import type { ChangeActor } from '../changes';
import { identityOf, isoOf, newVersion } from '../change-rows';
import { announce, appendFeed } from './change-feed';
import type { FileItem } from '../file-item';
import { shaOfVersionPath, type FileStamp } from '../intents';
import { namesSharing } from '../shared-names';

const OUTSIDE: ChangeActor = { actorProfileId: null, via: 'outside', deviceId: null };

export interface FinishCommitInput {
  readonly rootId: string;
  readonly intent: DriveIntent;
  readonly existing: FileItem | undefined;
  readonly added: DriveItemDraft | null;
  readonly stamp: FileStamp;
}

function outsideDraft(existing: FileItem, stamp: FileStamp): DriveItemDraft {
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

export class FinishCommitDraftError extends Error {
  override readonly name = 'FinishCommitDraftError';

  constructor(readonly relPath: string) {
    super(`The finished commit of ${relPath} has no new item to record.`);
  }
}

function addedOf(input: FinishCommitInput): { draft: DriveItemDraft; op: 'create' }[] {
  if (input.added === null) throw new FinishCommitDraftError(input.intent.toPath);
  return [{ draft: input.added, op: 'create' }];
}

export function finishCommitIn(store: HostStore, input: FinishCommitInput): readonly DriveItem[] {
  const { rootId, intent, existing, stamp } = input;
  const env = { store };
  if (intent.versionPath !== null && existing !== undefined) {
    store.driveVersions.insert(
      rootId,
      newVersion(store, {
        itemId: existing.id,
        rev: existing.rev,
        sha256: shaOfVersionPath(intent.versionPath),
        bytes: existing.bytes,
        actorProfileId: null,
        via: 'outside',
        deviceId: null,
        addedByProfileId: existing.addedByProfileId,
      }),
    );
  }
  const inode = { mtimeNs: stamp.mtimeNs };
  const identity = identityOf(stamp);
  const drafts =
    existing === undefined
      ? addedOf(input)
      : [existing, ...namesSharing(store, existing)].map((name) => ({
          draft: outsideDraft(name, stamp),
          op: 'update' as const,
        }));
  const touched = drafts.map(({ draft, op }) => {
    const written = store.driveItems.write({ item: draft, identity, inode }).item;
    appendFeed(env, written, op, OUTSIDE);
    return written;
  });
  store.driveIntents.clear(intent.id);
  announce(env, rootId, touched[0]?.parentId ?? null, touched);
  return touched;
}

export const DRIVE_FINISH_COMMIT_UNIT = storeUnit((store, input: FinishCommitInput) =>
  finishCommitIn(store, input),
);
