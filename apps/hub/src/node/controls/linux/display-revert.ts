import { randomUUID } from 'node:crypto';
import { DISPLAY_REVERT_SECONDS, type PendingRevert } from '@smarteverything/domain';
import { NodeFailureError } from '../../node-failure';
import type { DisplayRestore } from './display-backend';

export type Schedule = (run: () => void, delayMs: number) => () => void;

export const systemSchedule: Schedule = (run, delayMs) => {
  const timer = setTimeout(run, delayMs);
  return (): void => {
    clearTimeout(timer);
  };
};

interface Active {
  readonly pending: PendingRevert;
  readonly restore: DisplayRestore;
  readonly cancel: () => void;
}

export interface DisplayRevertOptions {
  readonly now: () => Date;
  readonly schedule: Schedule;
  readonly token: () => string;
}

export const systemRevertOptions: Pick<DisplayRevertOptions, 'token'> = { token: randomUUID };

export class DisplayRevert {
  private active: Active | null = null;

  constructor(private readonly options: DisplayRevertOptions) {}

  pending(): PendingRevert | null {
    return this.active?.pending ?? null;
  }

  begin(
    summary: string,
    restore: DisplayRestore,
    expired: (restore: DisplayRestore) => void,
  ): PendingRevert {
    if (this.active !== null) {
      throw new NodeFailureError('blocked', 'Keep or revert the last display change first.');
    }
    const startedAt = this.options.now();
    const pending: PendingRevert = {
      token: this.options.token(),
      startedAt: startedAt.toISOString(),
      revertsAt: new Date(startedAt.getTime() + DISPLAY_REVERT_SECONDS * 1000).toISOString(),
      summary,
    };
    const cancel = this.options.schedule(() => {
      this.active = null;
      expired(restore);
    }, DISPLAY_REVERT_SECONDS * 1000);
    this.active = { pending, restore, cancel };
    return pending;
  }

  take(token: string): DisplayRestore {
    const active = this.active;
    if (active?.pending.token !== token) {
      throw new NodeFailureError(
        'not_found',
        'There is no display change waiting to be kept or reverted with that token.',
      );
    }
    return this.release(active);
  }

  abandon(): DisplayRestore | null {
    return this.active === null ? null : this.release(this.active);
  }

  private release(active: Active): DisplayRestore {
    active.cancel();
    this.active = null;
    return active.restore;
  }
}
