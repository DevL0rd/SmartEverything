import { randomUUID } from 'node:crypto';
import type { Store } from '../../../src/store/store';
import type { DriveActor } from '../../../src/drive/access';
import { DriveAlbumsService } from '../../../src/drive/albums';
import { AlbumActivityService } from '../../../src/photos/sharing/activity';
import { SharedAlbumMembers } from '../../../src/photos/sharing/members';
import { PartnerAutoSaver, PartnerAutoSaveTrigger } from '../../../src/photos/sharing/auto-save';
import { PartnerSharing } from '../../../src/photos/sharing/partners';
import { SharingReader } from '../../../src/photos/sharing/reads';
import { SavedAlbums } from '../../../src/photos/sharing/saved';
import { AlbumSeen } from '../../../src/photos/sharing/seen';
import { driveRoot } from '../../drive/drive-fixture';
import { openKit as openBase, type Kit as BaseKit } from '../organise/fixture';

export interface Kit extends BaseKit {
  readonly carol: DriveActor;
  readonly carolRoot: string;
  readonly seen: AlbumSeen;
  readonly members: SharedAlbumMembers;
  readonly activity: AlbumActivityService;
  readonly partners: PartnerSharing;
  readonly auto: PartnerAutoSaver;
  readonly trigger: PartnerAutoSaveTrigger;
  readonly reader: SharingReader;
  readonly albums: DriveAlbumsService;
  readonly deferred: (() => void)[];
  readonly album: (owner: DriveActor, itemIds: readonly string[]) => string;
}

function albumsOf(store: Store, time: { current: Date }): DriveAlbumsService {
  return new DriveAlbumsService({
    albums: store.driveAlbums,
    items: store.driveItems,
    roots: store.driveRoots,
    grants: store.driveGrants,
    runner: {
      rows: (): readonly never[] => [],
      count: (): number => 0,
    },
    newId: randomUUID,
    now: (): string => time.current.toISOString(),
    timeZone: 'UTC',
  });
}

export async function openKit(): Promise<Kit> {
  const base = await openBase();
  const { store } = base;
  const carolProfile = store.profiles.create({ name: 'Carol' }).id;
  const carolRoot = store.driveRoots.insert(
    driveRoot(randomUUID(), { scope: 'person', ownerProfileId: carolProfile }),
  ).id;
  const seen = new AlbumSeen(store);
  const saved = new SavedAlbums(store);
  const deferred: (() => void)[] = [];
  const auto = new PartnerAutoSaver(store, saved);
  const trigger = new PartnerAutoSaveTrigger(
    store.feed,
    () => Promise.resolve(auto.reconcile()),
    (work) => {
      deferred.push(work);
    },
  );
  const albums = albumsOf(store, base.time);
  return {
    ...base,
    carol: { profileId: carolProfile },
    carolRoot,
    seen,
    members: new SharedAlbumMembers(store, seen),
    activity: new AlbumActivityService(store, seen, (): Date => base.time.current),
    partners: new PartnerSharing(store, saved, auto),
    auto,
    trigger,
    reader: new SharingReader(store, seen),
    albums,
    deferred,
    album: (owner, itemIds): string => {
      const created = store.driveAlbums.insert({
        id: randomUUID(),
        title: 'Holiday',
        kind: 'manual',
        surface: 'photos',
        scope: 'person',
        ownerProfileId: owner.profileId,
        coverItemId: null,
      });
      store.driveAlbums.addItems(created.id, itemIds, owner.profileId);
      return created.id;
    },
  };
}
