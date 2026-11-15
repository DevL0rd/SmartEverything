import type { CommittedNotice, DriveFeedOp, DriveFeedRow } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { Store } from '../../store/store';
import { peopleWithAccess, type AudienceStore } from './audience';

const EDIT_OPS: ReadonlySet<DriveFeedOp> = new Set(['update', 'rename', 'move']);

const FEED_BATCH = 500;

export type EditNoticeStore = AudienceStore &
  Pick<Store, 'driveFeed' | 'driveNotifications' | 'feed'>;

export class DriveEditNotices {
  private seen: number;
  private busy = false;
  private again = false;

  constructor(
    private readonly store: EditNoticeStore,
    private readonly log: Logger,
  ) {
    this.seen = store.driveFeed.latestSeq();
  }

  start(): () => void {
    return this.store.feed.subscribeNotices((notice) => {
      this.noticed(notice);
    });
  }

  noticed(notice: CommittedNotice): void {
    if (notice.type !== 'drive_changed' || notice.cursor <= this.seen) return;
    if (this.busy) {
      this.again = true;
      return;
    }
    this.busy = true;
    try {
      do {
        this.catchUp();
      } while (this.repeat());
    } finally {
      this.busy = false;
    }
  }

  private repeat(): boolean {
    const repeat = this.again;
    this.again = false;
    return repeat;
  }

  private catchUp(): void {
    for (;;) {
      const window = this.store.driveFeed.since(this.seen, FEED_BATCH);
      for (const row of window.rows) {
        this.seen = row.seq;
        this.rowWritten(row);
      }
      if (window.next === null) return;
    }
  }

  private rowWritten(row: DriveFeedRow): void {
    if (!EDIT_OPS.has(row.op) || row.actorProfileId === null) return;
    try {
      this.tell(row, row.actorProfileId);
    } catch (cause) {
      this.log.error('drive.edit_notice_failed', cause, { itemId: row.itemId, seq: row.seq });
    }
  }

  private tell(row: DriveFeedRow, editor: string): void {
    const item = this.store.driveItems.find(row.itemId, null);
    if (item === undefined) return;
    for (const person of peopleWithAccess(this.store, item)) {
      const watching =
        person.access === 'own' || person.access === 'edit' || person.access === 'view';
      if (!watching || person.profileId === editor) continue;
      this.store.driveNotifications.add({
        profileId: person.profileId,
        kind: 'edited',
        itemId: item.id,
        actorProfileId: editor,
        actorName: null,
        refId: null,
      });
    }
  }
}
