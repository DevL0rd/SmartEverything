import { ApiError, type DriveItem } from '@smarteverything/domain';
import { folderDraft, recordItem, type ChangeActor, type ChangeEnv } from '../drive/changes';
import { identityOf, isoOf } from '../drive/change-rows';
import { locate, type DriveWriteRoot } from '../drive/intents';
import { DriveWriteError } from '../drive/write-error';
import { DriveSpaceMissingError } from '../drive/space-missing-error';
import { PHOTOS_FOLDER } from './membership';

export type BackupEnv = ChangeEnv;

export interface BackupTarget {
  readonly folderId: string;
  readonly path: string;
}

export class BackupService {
  private lane: Promise<unknown> = Promise.resolve();

  constructor(private readonly env: BackupEnv) {}

  async backupTarget(profileId: string, deviceId: string): Promise<BackupTarget> {
    await this.env.store.host.write('photoBackupTouch', { profileId, deviceId });
    return await this.manualTarget(profileId);
  }

  manualTarget(profileId: string): Promise<BackupTarget> {
    return this.serialized(() => this.ensure(profileId, [PHOTOS_FOLDER]));
  }

  private serialized<T>(work: () => Promise<T>): Promise<T> {
    const run = this.lane.then(work, work);
    this.lane = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private async ensure(
    profileId: string,
    segments: readonly [string, ...string[]],
  ): Promise<BackupTarget> {
    const root = await this.env.store.host.call('driveRoots', 'byIdentity', 'person', profileId);
    if (root === undefined) throw new DriveSpaceMissingError('person', profileId);
    const actor: ChangeActor = { actorProfileId: profileId, via: 'app', deviceId: null };
    const [head, ...rest] = segments;
    let folder = await this.ensureFolder(root, actor, null, head);
    for (const segment of rest) {
      folder = await this.ensureFolder(root, actor, folder, `${folder.relPath}/${segment}`);
    }
    return { folderId: folder.id, path: folder.relPath };
  }

  private async ensureFolder(
    root: DriveWriteRoot,
    actor: ChangeActor,
    parent: DriveItem | null,
    relPath: string,
  ): Promise<DriveItem> {
    const indexed = await this.env.store.host.call('driveItems', 'byPath', root.id, relPath, null);
    if (indexed !== undefined) {
      if (indexed.kind !== 'folder') {
        throw new ApiError('conflict', `A file named ${relPath} is in the way of the folder.`);
      }
      return indexed;
    }
    const absolute = await locate(root, relPath);
    await this.env.files.mkdir(absolute);
    const stamp = await this.env.files.stamp(absolute);
    if (stamp?.directory !== true) {
      throw new DriveWriteError('missing', `The folder ${relPath} is missing after it was made.`);
    }
    return recordItem(this.env, {
      draft: folderDraft(
        {
          rootId: root.id,
          parentId: parent?.id ?? null,
          relPath,
          modifiedAt: isoOf(stamp.mtimeNs),
          addedAt: this.env.now().toISOString(),
          outside: false,
          addedByProfileId: actor.actorProfileId,
        },
        0,
      ),
      identity: identityOf(stamp),
      op: 'create',
      actor,
    });
  }
}
