import { ApiError, type DriveItem } from '@smarteverything/domain';
import { z } from 'zod';
import { FS_OP_ID, FsOps, type FsEntry, type FsOpMemory } from './fs-api-ops';
import {
  entryOf,
  joined,
  makeFolder,
  mount,
  refusalOf,
  refused,
  relocate,
  settled,
  stampItem,
} from './fs-api-write';
import { isInside, normalizeRelativePath } from './paths';
import type { ChangeEnv } from './changes';
import type { DriveActor, DriveReadService } from './service-read';
import { writableRoot } from './service-write-support';
import type { DriveWriteService } from './service-write';

const NAME = z
  .string()
  .min(1)
  .max(255)
  .refine((name) => !name.includes('/') && !name.includes('\0'), {
    message: 'a name has no slash and no NUL',
  })
  .refine((name) => name !== '.' && name !== '..', { message: 'a name is not a dot entry' });

const ID = z.uuid();

const BASE = ID.optional();

export const FS_LIST_QUERY = z.strictObject({
  base: BASE,
  folder: ID.optional(),
  cursor: z.string().min(1).optional(),
});

export const FS_STAT_QUERY = z.strictObject({ base: BASE, path: z.string() });

export const FS_MKDIR = z.strictObject({
  opId: FS_OP_ID,
  base: BASE,
  parentId: ID.nullable(),
  name: NAME,
});

export const FS_RENAME = z.strictObject({
  opId: FS_OP_ID,
  base: BASE,
  itemId: ID,
  parentId: ID.nullable(),
  name: NAME,
});

export const FS_REMOVE = z.strictObject({ opId: FS_OP_ID, base: BASE, itemId: ID });

export const FS_UTIMENS = z.strictObject({
  opId: FS_OP_ID,
  base: BASE,
  itemId: ID,
  modifiedAt: z.iso.datetime({ offset: true }),
});

export type FsListQuery = z.infer<typeof FS_LIST_QUERY>;
export type FsMkdir = z.infer<typeof FS_MKDIR>;
export type FsRename = z.infer<typeof FS_RENAME>;
export type FsRemove = z.infer<typeof FS_REMOVE>;
export type FsStatQuery = z.infer<typeof FS_STAT_QUERY>;
export type FsUtimens = z.infer<typeof FS_UTIMENS>;

export interface FsPage {
  readonly folder: FsEntry | null;
  readonly entries: readonly FsEntry[];
  readonly next: string | null;
}

export interface FsCaller extends DriveActor {
  readonly nodeId: string;
}

export interface FsEnv {
  readonly env: ChangeEnv;
  readonly read: DriveReadService;
  readonly write: Pick<DriveWriteService, 'change'>;
  readonly ops: FsOpMemory;
}

export class DriveFsApi {
  private readonly ops: FsOps;

  constructor(private readonly deps: FsEnv) {
    this.ops = new FsOps(deps.ops);
  }

  list(actor: DriveActor, rootId: string, query: FsListQuery): FsPage {
    const base = this.baseIn(actor, rootId, query.base);
    if (query.folder !== undefined && query.folder !== base?.id) {
      this.itemIn(actor, rootId, query.folder, base);
    }
    const page = this.deps.read.browseFolder(actor, {
      rootId,
      folderId: query.folder ?? base?.id,
      cursor: query.cursor,
    });
    const folder = page.folder === null || page.folder.id === base?.id ? null : page.folder;
    return {
      folder: folder === null ? null : entryOf(folder, base),
      entries: page.items.map((item) => entryOf(item, base)),
      next: page.next,
    };
  }

  stat(actor: DriveActor, rootId: string, query: FsStatQuery): FsEntry | null {
    const base = this.baseIn(actor, rootId, query.base);
    const relPath = refused(() => normalizeRelativePath(query.path));
    if (relPath === '') {
      return null;
    }
    const item = this.deps.env.store.driveItems.byPath(rootId, joined(base, relPath));
    if (item === undefined) {
      throw new ApiError('not_found', 'There is no such file or folder.');
    }
    return entryOf(item, base);
  }

  mkdir(caller: FsCaller, rootId: string, input: FsMkdir): Promise<FsEntry> {
    return this.ops.entry(caller.nodeId, { id: input.opId, action: 'mkdir' }, () =>
      this.guarded(async () => {
        const base = this.baseIn(caller, rootId, input.base);
        const root = writableRoot(this.deps.read, mount(caller), rootId);
        const parent = this.parentIn(caller, rootId, input.parentId, base);
        return entryOf(
          await makeFolder(this.deps.env, caller, { root, parent, name: input.name }),
          base,
        );
      }),
    );
  }

  rename(caller: FsCaller, rootId: string, input: FsRename): Promise<FsEntry> {
    return this.ops.entry(caller.nodeId, { id: input.opId, action: 'rename' }, () =>
      this.guarded(async () => {
        const base = this.baseIn(caller, rootId, input.base);
        const item = this.itemIn(caller, rootId, input.itemId, base);
        const parent = this.parentIn(caller, rootId, input.parentId, base);
        if (item.kind === 'folder' && parent !== null && isInside(item.relPath, parent.relPath)) {
          throw new ApiError('invalid_request', 'A folder cannot move into itself.');
        }
        const root = writableRoot(this.deps.read, mount(caller), rootId);
        await relocate(this.deps.env, caller, { root, item, parent, name: input.name });
        return entryOf(this.deps.env.store.driveItems.byId(item.id), base);
      }),
    );
  }

  unlink(caller: FsCaller, rootId: string, input: FsRemove): Promise<void> {
    return this.ops.done(caller.nodeId, { id: input.opId, action: 'unlink' }, () =>
      this.guarded(async () => {
        const item = this.itemIn(
          caller,
          rootId,
          input.itemId,
          this.baseIn(caller, rootId, input.base),
        );
        if (item.kind === 'folder') {
          throw new ApiError('invalid_request', 'That is a folder; remove it with rmdir.');
        }
        await this.trash(caller, rootId, item);
      }),
    );
  }

  rmdir(caller: FsCaller, rootId: string, input: FsRemove): Promise<void> {
    return this.ops.done(caller.nodeId, { id: input.opId, action: 'rmdir' }, () =>
      this.guarded(async () => {
        const item = this.itemIn(
          caller,
          rootId,
          input.itemId,
          this.baseIn(caller, rootId, input.base),
        );
        if (item.kind !== 'folder') {
          throw new ApiError('invalid_request', 'That is a file; remove it with unlink.');
        }
        const children = this.deps.env.store.driveItems.children(rootId, item.id, null, 1);
        if (children.entries.length > 0) {
          throw new ApiError('conflict', 'The folder is not empty.');
        }
        await this.trash(caller, rootId, item);
      }),
    );
  }

  utimens(caller: FsCaller, rootId: string, input: FsUtimens): Promise<FsEntry> {
    return this.ops.entry(caller.nodeId, { id: input.opId, action: 'utimens' }, () =>
      this.guarded(() => this.stamped(caller, rootId, input)),
    );
  }

  readable(
    caller: FsCaller,
    rootId: string,
    itemId: string,
    baseId: string | undefined,
  ): DriveItem {
    const item = this.itemIn(caller, rootId, itemId, this.baseIn(caller, rootId, baseId));
    if (item.kind === 'folder') {
      throw new ApiError('invalid_request', 'A folder has no bytes to read.');
    }
    return item;
  }

  private async guarded<T>(operation: () => Promise<T> | T): Promise<T> {
    try {
      return await operation();
    } catch (cause) {
      throw refusalOf(cause) ?? cause;
    }
  }

  private baseIn(actor: DriveActor, rootId: string, baseId: string | undefined): DriveItem | null {
    this.deps.read.rootFor(actor, rootId);
    if (baseId === undefined) {
      return null;
    }
    const folder = this.deps.read.readItem(actor, baseId);
    if (folder.rootId !== rootId || folder.kind !== 'folder') {
      throw new ApiError('not_found', 'There is no such folder in this library folder.');
    }
    return folder;
  }

  private itemIn(
    actor: DriveActor,
    rootId: string,
    itemId: string,
    base: DriveItem | null,
  ): DriveItem {
    const item = this.deps.read.readItem(actor, itemId);
    const outside =
      item.rootId !== rootId ||
      (base !== null && (item.id === base.id || !isInside(base.relPath, item.relPath)));
    if (outside) {
      throw new ApiError('not_found', 'There is no such file or folder in this library folder.');
    }
    return item;
  }

  private parentIn(
    actor: DriveActor,
    rootId: string,
    parentId: string | null,
    base: DriveItem | null,
  ): DriveItem | null {
    if (parentId === null || parentId === base?.id) {
      return base;
    }
    const parent = this.itemIn(actor, rootId, parentId, base);
    if (parent.kind !== 'folder') {
      throw new ApiError('invalid_request', 'The destination is not a folder.');
    }
    return parent;
  }

  private async stamped(caller: FsCaller, rootId: string, input: FsUtimens): Promise<FsEntry> {
    const base = this.baseIn(caller, rootId, input.base);
    const item = this.itemIn(caller, rootId, input.itemId, base);
    const root = writableRoot(this.deps.read, mount(caller), rootId);
    const { modifiedAt } = input;
    return entryOf(await stampItem(this.deps.env, caller, { root, item, modifiedAt }), base);
  }

  private async trash(caller: FsCaller, rootId: string, item: DriveItem): Promise<void> {
    writableRoot(this.deps.read, mount(caller), rootId);
    settled(await this.deps.write.change(mount(caller), { action: 'trash', itemIds: [item.id] }));
  }
}
