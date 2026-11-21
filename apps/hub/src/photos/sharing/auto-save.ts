import { Logger } from '@smarteverything/logging';
import type { PhotoPartnerShareRow } from '../../store/repositories/photo-partner-shares';
import type { ChangeFeed } from '../../store/feed';
import { storeUnit } from '../../store/host/unit';
import type { Store } from '../../store/store';
import { recordDelivered, unsavedPartnerItemIds } from './partner-items';
import { SavedAlbums } from './saved';

export type AutoSaveStore = Pick<
  Store,
  'context' | 'write' | 'driveAlbums' | 'photoPartnerShares' | 'profiles'
>;

const log = new Logger('hub.photos');

const TRIGGERS: ReadonlySet<string> = new Set(['drive_changed', 'photos_ai']);

export type Defer = (work: () => void) => void;

export class PartnerAutoSaver {
  constructor(
    private readonly store: AutoSaveStore,
    private readonly saved: SavedAlbums,
  ) {}

  reconcile(): number {
    return this.store.profiles
      .list()
      .flatMap((profile) => this.store.photoPartnerShares.sharedBy(profile.id))
      .filter((share) => share.state === 'accepted' && share.autoSave)
      .reduce((total, share) => total + this.reconcileShare(share), 0);
  }

  reconcileShare(share: PhotoPartnerShareRow): number {
    return this.store.write(() => {
      const albumId = this.saved.ensure(share);
      const itemIds = unsavedPartnerItemIds(this.store.context, share, albumId);
      if (itemIds.length === 0) return 0;
      this.store.driveAlbums.addItems(albumId, itemIds, share.recipientId);
      recordDelivered(this.store.context, albumId, itemIds);
      return itemIds.length;
    });
  }
}

export const PHOTO_PARTNER_AUTO_SAVE_UNIT = storeUnit(
  (store, _input: Readonly<Record<string, never>>) =>
    new PartnerAutoSaver(store, new SavedAlbums(store)).reconcile(),
);

export class PartnerAutoSaveTrigger {
  private stops: (() => void)[] = [];
  private pending = false;

  constructor(
    private readonly feed: Pick<ChangeFeed, 'subscribeNotices'>,
    private readonly run: () => Promise<number>,
    private readonly defer: Defer = setImmediate,
  ) {}

  start(): void {
    this.stops.push(
      this.feed.subscribeNotices((notice) => {
        if (TRIGGERS.has(notice.type)) this.schedule();
      }),
    );
  }

  stop(): void {
    for (const stop of this.stops) stop();
    this.stops = [];
  }

  private schedule(): void {
    if (this.pending) return;
    this.pending = true;
    this.defer(() => {
      this.pending = false;
      this.run().catch((cause: unknown) => {
        log.error('photos_partner.auto_save_failed', cause);
      });
    });
  }
}
