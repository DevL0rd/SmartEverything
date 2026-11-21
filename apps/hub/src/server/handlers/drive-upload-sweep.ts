import { background, type Logger } from '@smarteverything/logging';
import { MAX_TIMER_DELAY_MS } from '../../drive/purge-timer';
import type { TusUploads } from '../../drive/uploads-tus';

export class UploadSweeper {
  private timer: NodeJS.Timeout | undefined;
  private stopped = false;

  constructor(
    private readonly uploads: Pick<TusUploads, 'sweepExpired' | 'soonestExpiry'>,
    private readonly now: () => Date,
    private readonly log: Logger,
  ) {}

  rearm = (): void => {
    clearTimeout(this.timer);
    this.timer = undefined;
    this.stopped = false;
    background(this.arm(), 'drive_upload.rearm_failed');
  };

  private readonly arm = async (): Promise<void> => {
    const soonest = await this.uploads.soonestExpiry();
    if (soonest === null || this.stopped) return;
    clearTimeout(this.timer);
    const wait = Math.min(
      Math.max(Date.parse(soonest) - this.now().getTime(), 0),
      MAX_TIMER_DELAY_MS,
    );
    this.timer = setTimeout(this.fire, wait);
    this.timer.unref();
  };

  stop(): void {
    this.stopped = true;
    clearTimeout(this.timer);
    this.timer = undefined;
  }

  private fire = (): void => {
    this.timer = undefined;
    background(
      this.uploads.sweepExpired().then((removed) => {
        this.log.info('drive_upload.swept', { removed });
        this.rearm();
      }),
      'drive_upload.sweep_failed',
    );
  };
}
