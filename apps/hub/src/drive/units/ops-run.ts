import type { DriveFeedOp, DriveItem } from '@smarteverything/domain';
import type { DriveInode, DriveInodeDraft } from '../../store/repositories/drive-inodes';
import type { DriveVersionPurge } from '../../store/repositories/drive-versions';
import type { DriveItemDraft } from '../../store/repositories/drive-items';
import type { XattrSetResult } from '../../store/repositories/drive-xattrs';
import type { Store } from '../../store/store';
import type { ChangeActor } from '../changes';
import { announce, appendFeed } from '../change-rows';
import { repathItem } from '../service-write-repath';
import { settleContentIn } from './content';
import type { DriveOp, DriveOpResult, Reinstate, TrashRecord, XattrChange } from './ops';

export class DriveOpEntryError extends Error {
  override readonly name = 'DriveOpEntryError';

  constructor(readonly relPath: string) {
    super(`The item at ${relPath} has no inode.`);
  }
}

export function recordTrashIn(store: Store, trash: TrashRecord): void {
  const { item, entry, actor } = trash;
  const env = { store };
  store.driveTrash.insert(entry);
  store.driveTrash.stash(item.id);
  appendFeed(env, { ...item, rev: item.rev + 1 }, 'trash', actor);
  store.driveItems.remove(item.id);
  if (trash.intentId !== null) store.driveIntents.clear(trash.intentId);
  announce(env, trash.rootId, item.parentId, [item]);
}

function adopted(store: Store, draft: DriveItemDraft): DriveItemDraft {
  const taken = store.driveItems.lookups.placed(draft.rootId, draft.relPath);
  if (taken?.kind !== draft.kind) return draft;
  return { ...draft, id: taken.id, addedAt: taken.addedAt };
}

function created(store: Store, op: Extract<DriveOp, { kind: 'create' }>): DriveItem {
  const env = { store };
  const written = store.driveItems.write({
    item: adopted(store, op.draft),
    identity: op.identity,
    inode: op.inode,
  });
  appendFeed(env, written.item, 'create', op.actor);
  announce(env, written.item.rootId, written.item.parentId, [written.item]);
  return written.item;
}

function inodeRecorded(store: Store, op: Extract<DriveOp, { kind: 'inode' }>): DriveItem {
  const env = { store };
  const written = store.driveItems.write({
    item: op.item,
    identity: op.identity,
    inode: op.patch,
  });
  if (written.changed) {
    appendFeed(env, written.item, 'update', op.actor);
    announce(env, written.item.rootId, written.item.parentId, [written.item]);
  }
  return written.item;
}

function dropped(store: Store, item: DriveItem, actor: ChangeActor): void {
  const env = { store };
  appendFeed(env, { ...item, rev: item.rev + 1 }, 'delete', actor);
  store.driveItems.remove(item.id);
  announce(env, item.rootId, item.parentId, [item]);
}

function entryOf(store: Store, rootId: string, relPath: string): DriveOpResult {
  const placed = store.driveItems.lookups.placed(rootId, relPath);
  const inode = placed === undefined ? undefined : store.driveInodes.ofItem(placed.id);
  if (inode === undefined) throw new DriveOpEntryError(relPath);
  return { kind: 'entry', inode, nlink: store.driveInodes.linkCount(inode.id) };
}

function purgeTrashIn(store: Store, itemId: string): DriveVersionPurge {
  store.driveTrash.forgetPhoto(itemId);
  store.driveTrash.remove(itemId);
  store.driveGrants.sweepOrphans();
  store.driveShortcuts.sweepOrphans();
  return store.driveVersions.purgeItem(itemId);
}

function dropScanRows(
  store: Store,
  reinstate: Reinstate,
  rows: ReturnType<Store['driveTrash']['stashed']>,
): void {
  const items = rows.filter((row) => row.table === 'drive_items');
  const top = items.find((row) => row.values['id'] === reinstate.itemId)?.values['rel_path'];
  const paths = [reinstate.relPath];
  if (typeof top === 'string') {
    for (const row of items) {
      const path = row.values['rel_path'];
      if (row.values['id'] !== reinstate.itemId && typeof path === 'string') {
        paths.push(
          path.startsWith(`${top}/`) ? `${reinstate.relPath}${path.slice(top.length)}` : path,
        );
      }
    }
  }
  for (const path of paths) {
    const indexed = store.driveItems.byPath(reinstate.rootId, path, null);
    if (indexed !== undefined) store.driveItems.remove(indexed.id);
  }
}

function reinstated(store: Store, reinstate: Reinstate): DriveItem {
  const env = { store };
  const rows = store.driveTrash.stashed(reinstate.itemId);
  dropScanRows(store, reinstate, rows);
  store.driveTrash.remove(reinstate.itemId);
  store.driveTrash.reinstateInodes(rows);
  const written = store.driveItems.write({
    item: reinstate.draft,
    identity: reinstate.identity,
    ...(reinstate.shareInode === null ? {} : { shareInode: reinstate.shareInode }),
  }).item;
  store.driveTrash.reinstate(reinstate.itemId, rows, reinstate.relPath);
  appendFeed(env, written, 'restore', reinstate.actor);
  if (reinstate.intentId !== null) store.driveIntents.clear(reinstate.intentId);
  announce(env, reinstate.rootId, reinstate.parentId, [written]);
  return written;
}

function announced(store: Store, item: DriveItem, op: DriveFeedOp, actor: ChangeActor): void {
  const env = { store };
  appendFeed(env, item, op, actor);
  announce(env, item.rootId, item.parentId, [item]);
}

function xattrTouched(store: Store, xattr: XattrChange): void {
  store.driveInodes.setTimes(xattr.inodeId, xattr.times);
  for (const id of store.driveInodes.names(xattr.inodeId)) {
    const item = store.driveItems.find(id, null);
    if (item !== undefined) announced(store, item, 'update', xattr.actor);
  }
}

function xattrSet(store: Store, op: Extract<DriveOp, { kind: 'xattrSet' }>): XattrSetResult {
  const { xattr } = op;
  const set = store.driveXattrs.set(xattr.inodeId, xattr.name, op.value, op.flag);
  if (set.stored) xattrTouched(store, xattr);
  return set;
}

function xattrRemoved(store: Store, xattr: XattrChange): boolean {
  const removed = store.driveXattrs.remove(xattr.inodeId, xattr.name);
  if (removed) xattrTouched(store, xattr);
  return removed;
}

function written(store: Store, op: Extract<DriveOp, { kind: 'write' }>): DriveItem {
  const item = store.driveItems.write({
    item: op.draft,
    identity: op.identity,
    ...(op.shareInode === null ? {} : { shareInode: op.shareInode }),
  }).item;
  if (op.blocksOf !== null) {
    const blocks = store.driveBlocks.find(op.blocksOf.itemId, op.blocksOf.rev);
    if (blocks !== undefined) store.driveBlocks.put({ ...blocks, itemId: item.id, rev: item.rev });
  }
  return item;
}

function orphanMade(store: Store, draft: DriveInodeDraft): DriveInode {
  const inode = store.driveInodes.create(draft);
  store.driveInodes.setOrphan(inode.id, true);
  return inode;
}

const DONE: DriveOpResult = { kind: 'done' };

type OpOf<K extends DriveOp['kind']> = Extract<DriveOp, { readonly kind: K }>;

const ITEM_KINDS = [
  'content',
  'create',
  'inode',
  'write',
  'repath',
  'reinstate',
  'entry',
  'announce',
] as const;

const TRASH_KINDS = [
  'trash',
  'forget',
  'orphan',
  'purgeTrash',
  'purgeVersions',
  'resolve',
  'intent',
  'clearIntent',
] as const;

const INODE_KINDS = [
  'times',
  'diskTimes',
  'attributes',
  'orphanFlag',
  'orphanInode',
  'removeInode',
] as const;

function within<const K extends readonly DriveOp['kind'][]>(
  kinds: K,
  op: DriveOp,
): op is OpOf<K[number]> {
  return kinds.some((kind) => kind === op.kind);
}

function runItemOp(store: Store, op: OpOf<(typeof ITEM_KINDS)[number]>): DriveOpResult {
  switch (op.kind) {
    case 'content':
      return { kind: 'content', settled: settleContentIn(store, op.input) };
    case 'create':
      return { kind: 'item', item: created(store, op) };
    case 'inode':
      return { kind: 'item', item: inodeRecorded(store, op) };
    case 'write':
      return { kind: 'item', item: written(store, op) };
    case 'repath':
      repathItem({ store }, store.driveItems.byId(op.itemId, null), op.target, op.change);
      return DONE;
    case 'reinstate':
      return { kind: 'item', item: reinstated(store, op.reinstate) };
    case 'entry':
      return entryOf(store, op.rootId, op.relPath);
    case 'announce':
      announced(store, op.item, op.op, op.actor);
      return DONE;
  }
}

function runTrashOp(store: Store, op: OpOf<(typeof TRASH_KINDS)[number]>): DriveOpResult {
  switch (op.kind) {
    case 'trash':
      recordTrashIn(store, op.trash);
      return DONE;
    case 'forget':
      dropped(store, op.item, op.actor);
      return DONE;
    case 'orphan':
      store.driveInodes.setOrphan(op.inodeId, true);
      dropped(store, op.item, op.actor);
      return DONE;
    case 'purgeTrash':
      return { kind: 'purged', purged: purgeTrashIn(store, op.itemId) };
    case 'purgeVersions':
      return { kind: 'purged', purged: store.driveVersions.purge(op.ids) };
    case 'resolve':
      return {
        kind: 'conflict',
        conflict: store.driveConflicts.resolve(op.conflictId, op.resolution, op.at),
      };
    case 'intent':
      return { kind: 'intent', intent: store.driveIntents.open(op.intent) };
    case 'clearIntent':
      store.driveIntents.clear(op.intentId);
      return DONE;
  }
}

function runInodeOp(store: Store, op: OpOf<(typeof INODE_KINDS)[number]>): DriveOpResult {
  switch (op.kind) {
    case 'times':
      store.driveInodes.setTimes(op.inodeId, op.times);
      return DONE;
    case 'diskTimes':
      store.driveInodes.setTimesOnDisk(op.inodeId, op.times, op.disk);
      return DONE;
    case 'attributes':
      store.driveInodes.setAttributes(op.inodeId, op.attributes);
      return DONE;
    case 'orphanFlag':
      store.driveInodes.setOrphan(op.inodeId, op.orphan);
      return DONE;
    case 'orphanInode':
      return { kind: 'inode', inode: orphanMade(store, op.draft) };
    case 'removeInode':
      store.driveInodes.remove(op.inodeId);
      return DONE;
  }
}

type OtherOp = Exclude<
  DriveOp,
  OpOf<(typeof ITEM_KINDS)[number] | (typeof TRASH_KINDS)[number] | (typeof INODE_KINDS)[number]>
>;

function runOtherOp(store: Store, op: OtherOp): DriveOpResult {
  switch (op.kind) {
    case 'xattrSet':
      return { kind: 'xattr', set: xattrSet(store, op) };
    case 'xattrRemove':
      return xattrRemoved(store, op.xattr) ? DONE : { kind: 'missing' };
    case 'mountRanges':
      for (const entry of op.ranges) store.driveMountCommits.setRanges(entry.id, entry.ranges);
      return DONE;
    case 'mountFinish':
      store.driveMountCommits.finish(op.commitId, op.size, op.rev);
      return DONE;
    case 'claim':
      store.driveSyncOps.claim(op.claim);
      return DONE;
  }
}

export function runOp(store: Store, op: DriveOp): DriveOpResult {
  if (within(ITEM_KINDS, op)) return runItemOp(store, op);
  if (within(TRASH_KINDS, op)) return runTrashOp(store, op);
  if (within(INODE_KINDS, op)) return runInodeOp(store, op);
  return runOtherOp(store, op);
}
