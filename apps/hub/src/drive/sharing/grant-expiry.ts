import { background, type Logger } from '@smarteverything/logging';
import type { Store } from '../../store/store';

const MAX_TIMER_DELAY_MS = 2_147_000_000;

export type GrantExpiryStore = Pick<Store, 'host' | 'feed'>;

export interface GrantExpiryEnv {
  readonly store: GrantExpiryStore;
  readonly now: () => Date;
  readonly log: Logger;
}

export class GrantExpiry {
  private timer: NodeJS.Timeout | undefined;
  private stopFeed: (() => void) | undefined;
  private arming = 0;
  private running = false;
  private readonly pending = new Set<Promise<void>>();

  constructor(private readonly env: GrantExpiryEnv) {}

  start(): () => void {
    this.running = true;
    this.stopFeed = this.env.store.feed.subscribe((change) => {
      if (change.table === 'drive_grants' && change.operation !== 'DELETE') this.rearm();
    });
    this.track(this.sweepThenArm(), 'drive.grant_expiry_start_failed');
    return (): void => {
      this.stop();
    };
  }

  stop(): void {
    this.running = false;
    this.stopFeed?.();
    this.stopFeed = undefined;
    this.arming += 1;
    clearTimeout(this.timer);
    this.timer = undefined;
  }

  rearm(): void {
    this.track(this.arm(), 'drive.grant_expiry_arm_failed');
  }

  async idle(): Promise<void> {
    while (this.pending.size > 0) await Promise.allSettled([...this.pending]);
  }

  async sweep(): Promise<number> {
    const removed = await this.env.store.host.call(
      'driveGrants',
      'removeExpired',
      this.env.now().toISOString(),
    );
    for (const grant of removed) {
      this.env.log.info('drive.grant_expired', {
        grantId: grant.id,
        itemId: grant.itemId,
        profileId: grant.profileId,
        expiresAt: grant.expiresAt,
      });
    }
    return removed.length;
  }

  private async arm(): Promise<void> {
    const turn = (this.arming += 1);
    const soonest = await this.env.store.host.call('driveGrants', 'nextExpiry');
    if (turn !== this.arming || !this.running) return;
    clearTimeout(this.timer);
    this.timer = undefined;
    if (soonest === null) return;
    const wait = Math.min(
      Math.max(Date.parse(soonest) - this.env.now().getTime(), 0),
      MAX_TIMER_DELAY_MS,
    );
    this.timer = setTimeout(this.fire, wait);
    this.timer.unref();
  }

  private async sweepThenArm(): Promise<void> {
    try {
      await this.sweep();
    } catch (cause) {
      this.env.log.error('drive.grant_expiry_failed', cause);
    }
    await this.arm();
  }

  private readonly fire = (): void => {
    this.timer = undefined;
    this.track(this.sweepThenArm(), 'drive.grant_expiry_fire_failed');
  };

  private track(work: Promise<void>, event: string): void {
    this.pending.add(work);
    const done = (): void => {
      this.pending.delete(work);
    };
    work.then(done, done);
    background(work, event);
  }
}
