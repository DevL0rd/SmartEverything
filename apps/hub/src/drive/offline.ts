import type {
  DriveOfflineItem,
  DriveOfflineReport,
  DriveOfflineSet,
} from '@smarteverything/domain';
import { z } from 'zod';
import { background, type Logger } from '@smarteverything/logging';
import type { PushCommandChannel } from '../extensions/push/commands';
import type { DriveOfflineKey } from '../store/repositories/drive-offline';
import { Coalesced } from '../store/reader';
import type { Store } from '../store/store';
import type { DriveActor } from './access';
import { decodeCursor, encodeCursor } from './search';

const OFFLINE_PAGE_SIZE = 200;

const OFFLINE_CURSOR = z.strictObject({ clientId: z.uuid(), itemId: z.uuid() });

export interface OfflineEnv {
  readonly store: Pick<Store, 'host' | 'feed'>;
  readonly push: Pick<PushCommandChannel, 'send'>;
  readonly log: Logger;
}

export interface OfflinePage {
  readonly items: readonly DriveOfflineItem[];
  readonly next: string | null;
}

function cursorOf(key: DriveOfflineKey | null): string | null {
  return key === null ? null : encodeCursor(key);
}

export class DriveOfflineNotStartedError extends Error {
  override readonly name = 'DriveOfflineNotStartedError';

  constructor() {
    super('The drive offline catch up ran before the offline service started.');
  }
}

export class DriveOffline {
  private seen: number | null = null;
  private baseline: Promise<number> | undefined;
  private readonly pass: Coalesced;
  private stopFeed: (() => void) | undefined;

  constructor(private readonly env: OfflineEnv) {
    this.pass = new Coalesced(
      () => this.drain(),
      (cause) => {
        env.log.error('drive.offline_catch_up_failed', cause);
      },
    );
  }

  async ready(): Promise<void> {
    if (this.baseline === undefined) throw new DriveOfflineNotStartedError();
    await this.baseline;
  }

  idle(): Promise<void> {
    return this.pass.idle();
  }

  start(): () => void {
    this.baseline = this.env.store.host.call('driveFeed', 'latestSeq');
    this.stopFeed = this.env.store.feed.subscribeNotices((notice) => {
      if (notice.type === 'drive_changed' && (this.seen === null || notice.cursor > this.seen)) {
        this.pass.trigger();
      }
    });
    return (): void => {
      this.stopFeed?.();
      this.stopFeed = undefined;
      background(this.pass.stop(), 'drive.offline_stop_failed');
    };
  }

  async list(
    actor: DriveActor,
    clientId: string | undefined,
    cursor: string | undefined,
  ): Promise<OfflinePage> {
    const after = cursor === undefined ? null : decodeCursor(OFFLINE_CURSOR, cursor);
    const window = await this.env.store.host.call(
      'driveOffline',
      'forProfile',
      actor.profileId,
      clientId ?? null,
      after,
      OFFLINE_PAGE_SIZE,
    );
    return { items: window.items, next: cursorOf(window.next) };
  }

  async set(actor: DriveActor, input: DriveOfflineSet): Promise<void> {
    const pushed = await this.env.store.host.write('driveOfflineSet', { actor, set: input });
    if (pushed !== null) this.send(input.clientId, [pushed]);
  }

  async report(actor: DriveActor, input: DriveOfflineReport): Promise<void> {
    await this.env.store.host.write('driveOfflineReport', { actor, report: input });
  }

  private async drain(): Promise<void> {
    const { host } = this.env.store;
    if (this.baseline === undefined) throw new DriveOfflineNotStartedError();
    let seen = this.seen ?? (await this.baseline);
    const changed = new Map<string, Set<string>>();
    for (;;) {
      const gathered = await host.read('driveOfflineGather', { after: seen });
      if (gathered.kind === 'idle') {
        seen = gathered.latest;
        break;
      }
      if (gathered.last !== null) seen = gathered.last;
      for (const { clientId, itemId } of gathered.changes) {
        const ids = changed.get(clientId) ?? new Set<string>();
        ids.add(itemId);
        changed.set(clientId, ids);
      }
      if (!gathered.more) break;
    }
    this.seen = seen;
    for (const [clientId, itemIds] of changed) {
      this.send(clientId, [...itemIds]);
    }
  }

  private send(clientId: string, itemIds: readonly string[]): void {
    background(this.tell(clientId, itemIds), 'drive.offline_push_failed', { clientId });
  }

  private async tell(clientId: string, itemIds: readonly string[]): Promise<void> {
    const outcome = await this.env.push.send({
      clientId,
      command: 'drive_offline_changed',
      payload: { itemIds: [...itemIds] },
    });
    if (outcome.outcome === 'sent') return;
    this.env.log.warn('drive.offline_push_not_sent', {
      clientId,
      outcome: outcome.outcome,
      reason: outcome.reason,
      items: itemIds.length,
    });
  }
}
