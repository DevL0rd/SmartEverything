import { utimes } from 'node:fs/promises';
import type { DriveItem } from '@smarteverything/domain';
import {
  commitContent,
  folderDraft,
  identityOf,
  isoOf,
  recordItem,
  type ChangeActor,
  type ChangeEnv,
} from '../changes';
import { DriveWriteError, locate, type DriveWriteRoot } from '../intents';
import { checkDriveWrite, DriveFreeSpaceError, DriveQuotaExceededError } from '../quotas';
import type { DriveWriteGuard } from '../quotas';
import { freeNameAt } from '../uploads-tus-wire';
import { stageBytes, type StagedBytes } from '../versions';
import { GoogleImportError } from './errors';

export interface DestinationEnv extends ChangeEnv {
  readonly rootOf: (profileId: string) => DriveWriteRoot | null;
  readonly held: (profileId: string, sha256: string) => string | null;
  readonly guard: DriveWriteGuard;
}

export interface Arrival {
  readonly segments: readonly string[];
  readonly name: string;
  readonly modifiedAt: Date;
  readonly source: AsyncIterable<Uint8Array>;
}

export type Placed =
  { readonly kind: 'copied'; readonly bytes: number } | { readonly kind: 'duplicate' };

export function safeName(name: string, fallback: string): string {
  const cleaned = Array.from(name.normalize('NFC'))
    .map((character) =>
      character === '/' || character === '\\' || character === '\0' ? '-' : character,
    )
    .join('')
    .trim();
  return cleaned === '' || cleaned === '.' || cleaned === '..' ? fallback : cleaned;
}

export class Destination {
  private lane: Promise<unknown> = Promise.resolve();
  private readonly root: DriveWriteRoot;
  private readonly actor: ChangeActor;

  constructor(
    private readonly env: DestinationEnv,
    private readonly profileId: string,
  ) {
    const root = env.rootOf(profileId);
    if (root === null) {
      throw new GoogleImportError('no_library_folder');
    }
    this.root = root;
    this.actor = { actorProfileId: profileId, via: 'app', deviceId: null };
  }

  async place(arrival: Arrival): Promise<Placed> {
    const staged = await stageBytes(this.env, this.root, arrival.source);
    try {
      return await this.serialized(() => this.settle(arrival, staged));
    } catch (cause) {
      await this.discard(staged);
      if (cause instanceof DriveQuotaExceededError || cause instanceof DriveFreeSpaceError) {
        throw new GoogleImportError('storage_full', cause);
      }
      throw cause;
    }
  }

  private async settle(arrival: Arrival, staged: StagedBytes): Promise<Placed> {
    if (this.env.held(this.profileId, staged.sha256) !== null) {
      await this.discard(staged);
      return { kind: 'duplicate' };
    }
    await checkDriveWrite(this.env.guard, {
      profileId: this.profileId,
      addBytes: staged.bytes,
      releasedBytes: 0,
      path: this.root.path,
    });
    await utimes(await locate(this.root, staged.relPath), arrival.modifiedAt, arrival.modifiedAt);
    const folder = await this.ensure(arrival.segments);
    const relPath = await this.freePath(folder, arrival.name);
    await commitContent(this.env, {
      root: this.root,
      staged,
      relPath,
      actor: this.actor,
    });
    return { kind: 'copied', bytes: staged.bytes };
  }

  private async discard(staged: StagedBytes): Promise<void> {
    await this.env.files.remove(await locate(this.root, staged.relPath));
  }

  private serialized<T>(work: () => Promise<T>): Promise<T> {
    const run = this.lane.then(work, work);
    this.lane = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private async ensure(segments: readonly string[]): Promise<DriveItem | null> {
    let folder: DriveItem | null = null;
    for (const segment of segments) {
      folder = await this.ensureFolder(folder, segment);
    }
    return folder;
  }

  private async ensureFolder(parent: DriveItem | null, name: string): Promise<DriveItem> {
    const relPath = parent === null ? name : `${parent.relPath}/${name}`;
    const indexed = this.env.store.driveItems.byPath(this.root.id, relPath);
    if (indexed !== undefined) {
      if (indexed.kind !== 'folder') {
        throw new DriveWriteError('exists', `A file named ${relPath} is in the way of the folder.`);
      }
      return indexed;
    }
    const absolute = await locate(this.root, relPath);
    await this.env.files.mkdir(absolute);
    const stamp = await this.env.files.stamp(absolute);
    if (stamp?.directory !== true) {
      throw new DriveWriteError('missing', `The folder ${relPath} is missing after it was made.`);
    }
    return recordItem(this.env, {
      draft: folderDraft(
        {
          rootId: this.root.id,
          parentId: parent?.id ?? null,
          relPath,
          modifiedAt: isoOf(stamp.mtimeNs),
          addedAt: this.env.now().toISOString(),
          outside: false,
          addedByProfileId: this.profileId,
        },
        0,
      ),
      identity: identityOf(stamp),
      op: 'create',
      actor: this.actor,
    });
  }

  private async freePath(folder: DriveItem | null, name: string): Promise<string> {
    for (let attempt = 1; ; attempt += 1) {
      const candidate = freeNameAt(name, attempt);
      const relPath = folder === null ? candidate : `${folder.relPath}/${candidate}`;
      const indexed = this.env.store.driveItems.byPath(this.root.id, relPath);
      const onDisk = await this.env.files.stamp(await locate(this.root, relPath));
      if (indexed === undefined && onDisk === null) {
        return relPath;
      }
    }
  }
}
