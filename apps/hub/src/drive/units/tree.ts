import type { DriveItem } from '@smarteverything/domain';
import { storeUnit } from '../../store/host/unit';
import { itemAccess, type DriveActor } from '../access';
import type { NewItem } from '../change-rows';
import { announce, appendFeed } from './change-feed';
import type { ChangeActor } from '../changes';
import { NO_IDENTITY, specialDraft } from '../posix/drafts';
import { DriveWriteError } from '../write-error';
import { DriveReadRules } from './read';

export interface AnnounceInput {
  readonly rootId: string;
  readonly parentId: string | null;
  readonly items: readonly DriveItem[];
}

export const DRIVE_STAR_UNIT = storeUnit(
  (
    store,
    input: { readonly actor: DriveActor; readonly itemId: string; readonly starred: boolean },
  ) => {
    const { actor, itemId } = input;
    const item = new DriveReadRules(store).readItem(actor, itemId);
    if (input.starred) store.driveStars.star(actor.profileId, itemId);
    else store.driveStars.unstar(actor.profileId, itemId);
    announce({ store }, item.rootId, item.parentId, [item]);
  },
);

export const DRIVE_ITEM_ACCESS_UNIT = storeUnit(
  (store, input: { readonly actor: DriveActor; readonly item: DriveItem }) =>
    itemAccess(store, input.actor, store.driveRoots.byId(input.item.rootId), input.item),
);

export const DRIVE_ANNOUNCE_UNIT = storeUnit((store, input: AnnounceInput) => {
  announce({ store }, input.rootId, input.parentId, input.items);
});

export interface CopySpecialInput {
  readonly added: NewItem;
  readonly sourceItemId: string;
  readonly actor: ChangeActor;
}

export const DRIVE_COPY_SPECIAL_UNIT = storeUnit((store, input: CopySpecialInput) => {
  const source = store.driveInodes.ofItem(input.sourceItemId);
  if (source === undefined) {
    throw new DriveWriteError('missing', 'The special file has no inode to copy.');
  }
  const specialType = source.type;
  if (
    specialType !== 'fifo' &&
    specialType !== 'socket' &&
    specialType !== 'char' &&
    specialType !== 'block'
  ) {
    throw new DriveWriteError('missing', 'The item is not a special file.');
  }
  const env = { store };
  const written = store.driveItems.write({
    item: specialDraft(input.added),
    identity: NO_IDENTITY,
    inode: {
      specialType,
      rdev: source.rdev,
      mode: source.mode,
      uid: source.uid,
      gid: source.gid,
    },
  }).item;
  appendFeed(env, written, 'create', input.actor);
  announce(env, written.rootId, written.parentId, [written]);
  return written;
});
