import { background, messageOf } from '@smarteverything/logging';
import type { ChangeEnv, PurgeSchedule } from './changes';
import { removeTrashEntry } from './trash';
import { purgeVersions } from './versions';

export const MAX_TIMER_DELAY_MS = 2 ** 31 - 1;

const PURGE_PAGE = 500;

export interface PurgeTally {
  readonly trash: number;
  readonly versions: number;
  readonly failed: number;
}

async function purgeTrash(env: ChangeEnv, at: string): Promise<{ done: number; failed: number }> {
  const tally = { done: 0, failed: 0 };
  for (;;) {
    const page = await env.store.host.call('driveTrash', 'due', at, PURGE_PAGE);
    const before = tally.done;
    for (const entry of page) {
      try {
        await removeTrashEntry(env, entry);
        tally.done += 1;
      } catch (cause) {
        tally.failed += 1;
        env.log.error('drive.purge_trash_failed', cause, {
          rootId: entry.rootId,
          reason: messageOf(cause),
        });
      }
    }
    if (page.length === 0 || tally.done === before) {
      return tally;
    }
  }
}

async function purgeOldVersions(
  env: ChangeEnv,
  at: string,
): Promise<{ done: number; failed: number }> {
  const tally = { done: 0, failed: 0 };
  for (;;) {
    const page = await env.store.host.call('driveVersions', 'due', at, PURGE_PAGE);
    if (page.length === 0) {
      return tally;
    }
    try {
      tally.done += (
        await purgeVersions(
          env,
          page.map((entry) => entry.version.id),
        )
      ).length;
    } catch (cause) {
      tally.failed += page.length;
      env.log.error('drive.purge_versions_failed', cause, { reason: messageOf(cause) });
      return tally;
    }
  }
}

export async function purgeDue(env: ChangeEnv): Promise<PurgeTally> {
  const at = env.now().toISOString();
  const trash = await purgeTrash(env, at);
  const versions = await purgeOldVersions(env, at);
  if (trash.done + versions.done > 0) {
    const roots = await env.store.host.call('driveRoots', 'list');
    const cursor = await env.store.host.call('driveFeed', 'latestSeq');
    env.store.feed.notice({
      type: 'drive_changed',
      rootIds: roots.map((root) => root.id),
      folderIds: [],
      albumIds: [],
      months: [],
      cursor,
    });
  }
  return { trash: trash.done, versions: versions.done, failed: trash.failed + versions.failed };
}

export class PurgeTimer implements PurgeSchedule {
  private timer: NodeJS.Timeout | undefined;
  private arming: Promise<void> | undefined;
  private running: Promise<void> | undefined;
  private again = false;
  private stopped = false;

  constructor(private readonly env: ChangeEnv) {}

  start(): void {
    this.stopped = false;
    this.rearm();
  }

  rearm = (): void => {
    if (this.running !== undefined) {
      this.again = true;
      return;
    }
    this.arm(false);
  };

  private async due(): Promise<PurgeTally | null> {
    const soonest = await this.soonest();
    if (soonest === null || soonest > this.env.now().getTime()) return null;
    return purgeDue(this.env);
  }

  stop(): void {
    this.stopped = true;
    clearTimeout(this.timer);
    this.timer = undefined;
  }

  async settled(): Promise<void> {
    await this.arming;
    await this.running;
  }

  private async soonest(): Promise<number | null> {
    const { host } = this.env.store;
    const dates = [
      await host.call('driveTrash', 'soonestPurge'),
      await host.call('driveVersions', 'soonestPurge'),
    ].flatMap((at) => (at === null ? [] : [Date.parse(at)]));
    return dates.length === 0 ? null : Math.min(...dates);
  }

  private arm(stalled: boolean): void {
    this.arming = this.armed(stalled);
    background(this.arming, 'drive.purge_arm_failed');
  }

  private async armed(stalled: boolean): Promise<void> {
    const soonest = await this.soonest();
    clearTimeout(this.timer);
    this.timer = undefined;
    if (soonest === null || this.stopped) {
      return;
    }
    const wait = soonest - this.env.now().getTime();
    if (wait <= 0 && stalled) {
      this.env.log.warn('drive.purge_stalled', {});
      return;
    }
    this.timer = setTimeout(this.fire, Math.min(Math.max(wait, 0), MAX_TIMER_DELAY_MS));
    this.timer.unref();
  }

  private fire = (): void => {
    this.timer = undefined;
    this.running = this.due()
      .then((tally) => {
        if (tally === null) {
          this.running = undefined;
          this.arm(false);
          return;
        }
        this.running = undefined;
        this.arm(tally.failed > 0 && !this.again);
        this.again = false;
      })
      .catch((cause: unknown) => {
        this.running = undefined;
        this.env.log.error('drive.purge_failed', cause, {});
        this.again = false;
      });
  };
}
