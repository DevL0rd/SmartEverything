import { Logger } from '@smarteverything/logging';
import type { PhotoPartnerShareRow } from '../../store/repositories/photo-partner-shares';
import type { Store } from '../../store/store';
import { recordDelivered, unsavedPartnerItemIds } from './partner-items';
import type { SavedAlbums } from './saved';

export type AutoSaveStore = Pick<
  Store,
  'context' | 'write' | 'driveAlbums' | 'photoPartnerShares' | 'profiles' | 'feed'
>;

const log = new Logger('hub.photos');

const TRIGGERS: ReadonlySet<string> = new Set(['drive_changed', 'photos_ai']);

export type Defer = (work: () => void) => void;

export class PartnerAutoSaver {
  private stops: (() => void)[] = [];
  private pending = false;

  constructor(
    private readonly store: AutoSaveStore,
    private readonly saved: SavedAlbums,
    private readonly defer: Defer = setImmediate,
  ) {}

  start(): void {
    this.stops.push(
      this.store.feed.subscribeNotices((notice) => {
        if (TRIGGERS.has(notice.type)) this.schedule();
      }),
    );
  }

  stop(): void {
    for (const stop of this.stops) stop();
    this.stops = [];
  }

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

  private schedule(): void {
    if (this.pending) return;
    this.pending = true;
    this.defer(() => {
      this.pending = false;
      try {
        this.reconcile();
      } catch (cause) {
        log.error('photos_partner.auto_save_failed', cause);
      }
    });
  }
}
