import type { Logger } from '@smarteverything/logging';
import type { Store } from '../../store/store';

const MAX_TIMER_DELAY_MS = 2_147_000_000;

export type GrantExpiryStore = Pick<Store, 'driveGrants' | 'feed'>;

export interface GrantExpiryEnv {
  readonly store: GrantExpiryStore;
  readonly now: () => Date;
  readonly log: Logger;
}

export class GrantExpiry {
  private timer: NodeJS.Timeout | undefined;
  private stopFeed: (() => void) | undefined;

  constructor(private readonly env: GrantExpiryEnv) {}

  start(): () => void {
    this.sweep();
    this.stopFeed = this.env.store.feed.subscribe((change) => {
      if (change.table === 'drive_grants' && change.operation !== 'DELETE') this.rearm();
    });
    this.rearm();
    return (): void => {
      this.stop();
    };
  }

  stop(): void {
    this.stopFeed?.();
    this.stopFeed = undefined;
    clearTimeout(this.timer);
    this.timer = undefined;
  }

  rearm(): void {
    clearTimeout(this.timer);
    this.timer = undefined;
    const soonest = this.env.store.driveGrants.nextExpiry();
    if (soonest === null) return;
    const wait = Math.min(
      Math.max(Date.parse(soonest) - this.env.now().getTime(), 0),
      MAX_TIMER_DELAY_MS,
    );
    this.timer = setTimeout(this.fire, wait);
    this.timer.unref();
  }

  sweep(): number {
    const removed = this.env.store.driveGrants.removeExpired(this.env.now().toISOString());
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

  private readonly fire = (): void => {
    this.timer = undefined;
    try {
      this.sweep();
    } catch (cause) {
      this.env.log.error('drive.grant_expiry_failed', cause);
    }
    this.rearm();
  };
}
