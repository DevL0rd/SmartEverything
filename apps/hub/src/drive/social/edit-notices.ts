import type { CommittedNotice } from '@smarteverything/domain';
import { background, type Logger } from '@smarteverything/logging';
import { Coalesced } from '../../store/reader';
import type { Store } from '../../store/store';

export type EditNoticeStore = Pick<Store, 'host' | 'feed'>;

export class DriveEditNoticesNotStartedError extends Error {
  override readonly name = 'DriveEditNoticesNotStartedError';

  constructor() {
    super('The drive edit notices caught up before they started.');
  }
}

export class DriveEditNotices {
  private seen: number | null = null;
  private baseline: Promise<number> | undefined;
  private readonly pass: Coalesced;

  constructor(
    private readonly store: EditNoticeStore,
    log: Logger,
  ) {
    this.pass = new Coalesced(
      () => this.catchUp(),
      (cause) => {
        log.error('drive.edit_notices_catch_up_failed', cause);
      },
    );
  }

  async ready(): Promise<void> {
    if (this.baseline === undefined) throw new DriveEditNoticesNotStartedError();
    await this.baseline;
  }

  start(): () => void {
    this.baseline = this.store.host.call('driveFeed', 'latestSeq');
    const stop = this.store.feed.subscribeNotices((notice) => {
      this.noticed(notice);
    });
    return (): void => {
      stop();
      background(this.pass.stop(), 'drive.edit_notices_stop_failed');
    };
  }

  noticed(notice: CommittedNotice): void {
    if (notice.type !== 'drive_changed') return;
    if (this.seen !== null && notice.cursor <= this.seen) return;
    this.pass.trigger();
  }

  idle(): Promise<void> {
    return this.pass.idle();
  }

  private async catchUp(): Promise<void> {
    if (this.baseline === undefined) throw new DriveEditNoticesNotStartedError();
    let seen = this.seen ?? (await this.baseline);
    for (;;) {
      const page = await this.store.host.write('driveEditNotices', { after: seen });
      if (page.last !== null) seen = page.last;
      this.seen = seen;
      if (!page.more) return;
    }
  }
}
