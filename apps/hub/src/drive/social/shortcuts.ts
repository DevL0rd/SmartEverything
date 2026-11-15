import {
  ApiError,
  DRIVE_SHORTCUT,
  type DriveFolderPlace,
  type DriveItem,
  type DriveQuery,
  type DriveShortcut,
  type DriveShortcutChange,
  type DriveShortcutCreate,
  type DriveVia,
} from '@smarteverything/domain';
import { z } from 'zod';
import type { StoreContext } from '../../store/context';
import type { DriveShortcutRecord } from '../../store/repositories/drive-shortcuts';
import type { Store } from '../../store/store';
import {
  accessSql,
  canRead,
  canWrite,
  driveAccess,
  driveSql,
  itemAccess,
  type DriveActor,
} from '../access';
import type { DriveReadService } from '../service-read';

export type ShortcutStore = Pick<
  Store,
  'driveShortcuts' | 'driveItems' | 'driveRoots' | 'driveGrants'
>;

export interface ShortcutsEnv {
  readonly store: ShortcutStore;
  readonly context: StoreContext;
  readonly read: DriveReadService;
}

export type ShortcutActor = DriveActor & { readonly via: DriveVia };

interface Placement {
  readonly rootId: string;
  readonly parent: DriveItem | null;
}

const MATCHED = z.strictObject({ id: z.string() });

function targetOf(
  store: ShortcutStore,
  actor: DriveActor,
  record: DriveShortcutRecord,
): DriveShortcut['target'] {
  const item = store.driveItems.find(record.targetItemId, actor.profileId);
  if (item === undefined) {
    return { state: 'unavailable', reason: record.trashed ? 'trashed' : 'no_access' };
  }
  const drive = store.driveRoots.find(item.rootId);
  if (drive === undefined || !canRead(itemAccess(store, actor, drive, item))) {
    return { state: 'unavailable', reason: 'no_access' };
  }
  return { state: 'available', item };
}

export function shortcutFrom(
  record: DriveShortcutRecord,
  target: DriveShortcut['target'],
): DriveShortcut {
  return DRIVE_SHORTCUT.parse({
    id: record.id,
    rootId: record.rootId,
    parentId: record.parentId,
    name: record.name,
    createdBy: record.createdBy,
    createdAt: record.createdAt,
    target,
  });
}

export function shortcutOf(
  store: ShortcutStore,
  actor: DriveActor,
  record: DriveShortcutRecord,
): DriveShortcut {
  return shortcutFrom(record, targetOf(store, actor, record));
}

export function shortcutsInFolder(
  store: ShortcutStore,
  actor: DriveActor,
  rootId: string,
  parentId: string | null,
): DriveShortcut[] {
  return store.driveShortcuts
    .inFolder(rootId, parentId)
    .map((record) => shortcutOf(store, actor, record));
}

export function shortcutsMatching(
  env: Pick<ShortcutsEnv, 'store' | 'context'>,
  actor: DriveActor,
  text: string,
  scope: { readonly rootId: string | null },
): DriveShortcut[] {
  const words = text.split(/\s+/u).filter((word) => word !== '');
  if (words.length === 0) return [];
  const conditions = words.map(
    (_, index) => `instr(lower(s.name), lower($word${String(index)})) > 0`,
  );
  const rows = env.context.sql.all(
    MATCHED,
    `select s.id from drive_shortcuts s
        join drive_roots r on r.id = s.root_id
        left join drive_items p on p.id = s.parent_item_id
        where ${conditions.join(' and ')}
          and ((s.parent_item_id is null and ${driveSql('r')})
            or (s.parent_item_id is not null and ${accessSql('p', 'r')}))
          ${scope.rootId === null ? '' : 'and s.root_id = $rootId'}
        order by s.name, s.id`,
    {
      profile: actor.profileId,
      ...Object.fromEntries(words.map((word, index) => [`word${String(index)}`, word])),
      ...(scope.rootId === null ? {} : { rootId: scope.rootId }),
    },
  );
  return rows
    .map((row) => shortcutOf(env.store, actor, env.store.driveShortcuts.byId(row.id)))
    .filter((shortcut) => shortcut.target.state === 'available');
}

function withinFolder(
  store: ShortcutStore,
  actor: DriveActor,
  shortcut: DriveShortcut,
  folder: DriveItem,
): boolean {
  if (shortcut.parentId === null) return false;
  if (shortcut.parentId === folder.id) return true;
  const parent = store.driveItems.find(shortcut.parentId, actor.profileId);
  return parent?.rootId === folder.rootId && parent.relPath.startsWith(`${folder.relPath}/`);
}

export function shortcutsForQuery(
  env: Pick<ShortcutsEnv, 'store' | 'context'>,
  actor: DriveActor,
  query: DriveQuery,
): DriveShortcut[] {
  if (
    query.text === null ||
    query.cursor !== null ||
    query.kinds !== null ||
    query.starred !== null ||
    query.duration !== null ||
    query.taken !== null
  ) {
    return [];
  }
  const found = shortcutsMatching(env, actor, query.text, { rootId: query.rootId });
  if (query.folderId === null) return found;
  const folder = env.store.driveItems.find(query.folderId, actor.profileId);
  return folder === undefined
    ? []
    : found.filter((shortcut) => withinFolder(env.store, actor, shortcut, folder));
}

export class DriveShortcuts {
  constructor(private readonly env: ShortcutsEnv) {}

  create(actor: ShortcutActor, input: DriveShortcutCreate): DriveShortcut {
    const { store, read } = this.env;
    const target = read.readItem(actor, input.targetItemId);
    const placement = this.placement(actor, input.place);
    this.assertFree(actor, placement, input.name, null);
    const record = store.driveShortcuts.create({
      rootId: placement.rootId,
      parentId: placement.parent?.id ?? null,
      targetItemId: target.id,
      name: input.name,
      createdBy: actor.profileId,
      createdVia: actor.via,
    });
    return shortcutOf(store, actor, record);
  }

  update(actor: DriveActor, shortcutId: string, change: DriveShortcutChange): DriveShortcut {
    const { store } = this.env;
    const record = this.writable(actor, shortcutId);
    const placement =
      change.place === undefined
        ? this.currentPlacement(actor, record)
        : this.placement(actor, change.place);
    const name = change.name ?? record.name;
    this.assertFree(actor, placement, name, record.id);
    const updated = store.driveShortcuts.update(record.id, {
      rootId: placement.rootId,
      parentId: placement.parent?.id ?? null,
      name,
    });
    return shortcutOf(store, actor, updated);
  }

  remove(actor: DriveActor, shortcutId: string): void {
    const record = this.writable(actor, shortcutId);
    this.env.store.driveShortcuts.remove(record.id);
  }

  matching(
    actor: DriveActor,
    text: string,
    scope: { readonly rootId: string | null },
  ): DriveShortcut[] {
    return shortcutsMatching(this.env, actor, text, scope);
  }

  private writable(actor: DriveActor, shortcutId: string): DriveShortcutRecord {
    const { store } = this.env;
    const record = store.driveShortcuts.find(shortcutId);
    if (record === undefined) throw this.missing();
    const placement = this.currentPlacement(actor, record);
    this.assertWritable(actor, placement);
    return record;
  }

  private currentPlacement(actor: DriveActor, record: DriveShortcutRecord): Placement {
    const { store, read } = this.env;
    if (record.parentId === null) {
      read.rootFor(actor, record.rootId);
      return { rootId: record.rootId, parent: null };
    }
    const parent = store.driveItems.find(record.parentId, actor.profileId);
    if (parent === undefined) throw this.missing();
    read.rootOfItem(actor, parent);
    return { rootId: record.rootId, parent };
  }

  private placement(actor: DriveActor, place: DriveFolderPlace): Placement {
    const { store, read } = this.env;
    if (place.kind === 'drive') {
      read.rootFor(actor, place.rootId);
      return { rootId: place.rootId, parent: null };
    }
    const folder = store.driveItems.find(place.folderId, actor.profileId);
    if (folder?.kind !== 'folder') {
      throw new ApiError('not_found', 'There is no such folder.');
    }
    read.rootOfItem(actor, folder);
    return { rootId: folder.rootId, parent: folder };
  }

  private assertWritable(actor: DriveActor, placement: Placement): void {
    const { store } = this.env;
    const drive = store.driveRoots.byId(placement.rootId);
    const access =
      placement.parent === null
        ? driveAccess(actor, drive)
        : itemAccess(store, actor, drive, placement.parent);
    if (!canWrite(access)) {
      throw new ApiError('forbidden', 'You cannot add or change shortcuts in this folder.');
    }
  }

  private nameTaken(
    actor: DriveActor,
    placement: Placement,
    name: string,
    except: string | null,
  ): boolean {
    const { store } = this.env;
    const clash = store.driveShortcuts
      .inFolder(placement.rootId, placement.parent?.id ?? null)
      .some((record) => record.name === name && record.id !== except);
    const relPath = placement.parent === null ? name : `${placement.parent.relPath}/${name}`;
    return (
      clash || store.driveItems.byPath(placement.rootId, relPath, actor.profileId) !== undefined
    );
  }

  private assertFree(
    actor: DriveActor,
    placement: Placement,
    name: string,
    except: string | null,
  ): void {
    this.assertWritable(actor, placement);
    if (this.nameTaken(actor, placement, name, except)) {
      throw new ApiError('conflict', `Something named ${name} is already in that folder.`);
    }
  }

  private missing(): ApiError {
    return new ApiError('not_found', 'There is no such shortcut.');
  }
}
