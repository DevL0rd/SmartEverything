import { ApiError, type DriveItem } from '@smarteverything/domain';
import {
  commitContent,
  folderDraft,
  identityOf,
  isoOf,
  recordItem,
  type ChangeActor,
} from '../../drive/changes';
import { DriveWriteError, locate, type DriveWriteRoot } from '../../drive/intents';
import { stageBytes } from '../../drive/versions';
import type { SourcesEnv } from './shapes';

export interface KeepCopy {
  readonly root: DriveWriteRoot;
  readonly folders: readonly [string, ...string[]];
  readonly name: string;
  readonly source: string;
  readonly actor: ChangeActor;
}

export function safeName(name: string, fallback: string): string {
  const cleaned = Array.from(name.normalize('NFC'))
    .map((character) =>
      character === '/' || character === '\\' || character === '\0' ? '-' : character,
    )
    .join('')
    .trim();
  return cleaned === '' || cleaned === '.' || cleaned === '..' ? fallback : cleaned;
}

export class Keeper {
  private lane: Promise<unknown> = Promise.resolve();

  constructor(private readonly env: SourcesEnv) {}

  serialized<T>(work: () => Promise<T>): Promise<T> {
    const run = this.lane.then(work, work);
    this.lane = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  async copy({ root, folders, name, source, actor }: KeepCopy): Promise<DriveItem> {
    const { files, store } = this.env;
    const stamp = await files.stamp(source);
    if (stamp === null || stamp.directory) {
      throw new ApiError('not_found', 'The file is no longer on the hub.');
    }
    const parent = await this.ensureFolders(root, actor, folders);
    const relPath = `${parent.relPath}/${name}`;
    const existing = store.driveItems.byPath(root.id, relPath);
    if (existing?.kind === 'folder') {
      throw new ApiError('conflict', `A folder named ${relPath} is in the way of the file.`);
    }
    if (existing !== undefined) return existing;
    const staged = await stageBytes(this.env, root, files.read(source));
    return (await commitContent(this.env, { root, staged, relPath, actor })).item;
  }

  private async ensureFolders(
    root: DriveWriteRoot,
    actor: ChangeActor,
    folders: readonly [string, ...string[]],
  ): Promise<DriveItem> {
    const [head, ...rest] = folders;
    let folder = await this.ensureFolder(root, actor, null, head);
    for (const segment of rest) {
      folder = await this.ensureFolder(root, actor, folder, `${folder.relPath}/${segment}`);
    }
    return folder;
  }

  private async ensureFolder(
    root: DriveWriteRoot,
    actor: ChangeActor,
    parent: DriveItem | null,
    relPath: string,
  ): Promise<DriveItem> {
    const indexed = this.env.store.driveItems.byPath(root.id, relPath);
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
