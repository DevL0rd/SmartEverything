import {
  ApiError,
  type DriveFeedOp,
  type DriveItem,
  type DriveOfflineItem,
  type DriveOfflineReport,
  type DriveOfflineSet,
} from '@smarteverything/domain';
import { z } from 'zod';
import { background, type Logger } from '@smarteverything/logging';
import type { PushCommandChannel } from '../extensions/push/commands';
import type { DriveOfflineKey } from '../store/repositories/drive-offline';
import { Coalesced } from '../store/reader';
import type { Store } from '../store/store';
import { canRead, itemAccess, mayExport, type DriveActor } from './access';
import { decodeCursor, encodeCursor } from './search';
import { requireExport } from './sharing/export-guard';

const OFFLINE_PAGE_SIZE = 200;

const FEED_BATCH = 500;

const CHANGING: ReadonlySet<DriveFeedOp> = new Set([
  'create',
  'update',
  'rename',
  'move',
  'restore',
  'trash',
]);

const OFFLINE_CURSOR = z.strictObject({ clientId: z.uuid(), itemId: z.uuid() });

export type OfflineStore = Pick<
  Store,
  | 'clients'
  | 'profiles'
  | 'driveOffline'
  | 'driveItems'
  | 'driveRoots'
  | 'driveGrants'
  | 'driveFeed'
  | 'feed'
>;

export interface OfflineEnv {
  readonly store: OfflineStore;
  readonly push: Pick<PushCommandChannel, 'send'>;
  readonly log: Logger;
}

export interface OfflinePage {
  readonly items: readonly DriveOfflineItem[];
  readonly next: string | null;
}

function noPhone(): ApiError {
  return new ApiError('not_found', 'There is no phone of yours with that id.');
}

function cursorOf(key: DriveOfflineKey | null): string | null {
  return key === null ? null : encodeCursor(key);
}

export class DriveOffline {
  private seen: number;
  private readonly pass: Coalesced;
  private stopFeed: (() => void) | undefined;

  constructor(private readonly env: OfflineEnv) {
    this.seen = env.store.driveFeed.latestSeq();
    this.pass = new Coalesced(
      () => this.drain(),
      (cause) => {
        env.log.error('drive.offline_catch_up_failed', cause);
      },
    );
  }

  start(): () => void {
    this.stopFeed = this.env.store.feed.subscribeNotices((notice) => {
      if (notice.type === 'drive_changed' && notice.cursor > this.seen) this.catchUp();
    });
    return (): void => {
      this.stopFeed?.();
      this.stopFeed = undefined;
      background(this.pass.stop(), 'drive.offline_stop_failed');
    };
  }

  list(actor: DriveActor, clientId: string | undefined, cursor: string | undefined): OfflinePage {
    const after = cursor === undefined ? null : decodeCursor(OFFLINE_CURSOR, cursor);
    const window = this.env.store.driveOffline.forProfile(
      actor.profileId,
      clientId ?? null,
      after,
      OFFLINE_PAGE_SIZE,
    );
    return { items: window.items, next: cursorOf(window.next) };
  }

  set(actor: DriveActor, input: DriveOfflineSet): void {
    const { store } = this.env;
    this.phoneOf(actor, input.clientId);
    if (!input.on) {
      store.driveOffline.set(input.clientId, input.itemId, actor.profileId, false);
      return;
    }
    const item = store.driveItems.find(input.itemId, actor.profileId);
    const access =
      item === undefined
        ? 'none'
        : itemAccess(store, actor, store.driveRoots.byId(item.rootId), item);
    if (item === undefined || !canRead(access)) {
      throw new ApiError('not_found', 'There is no such file or folder for this caller.');
    }
    requireExport(access, item);
    store.driveOffline.set(input.clientId, item.id, actor.profileId, true);
    this.send(input.clientId, [item.id]);
  }

  report(actor: DriveActor, input: DriveOfflineReport): void {
    this.phoneOf(actor, input.clientId);
    this.env.store.driveOffline.report(input.clientId, input.items);
  }

  private phoneOf(actor: DriveActor, clientId: string): void {
    const client = this.env.store.clients.find(clientId);
    if (
      client?.platform !== 'android' ||
      this.env.store.profiles.activeOf(clientId).id !== actor.profileId
    ) {
      throw noPhone();
    }
  }

  private catchUp(): void {
    this.pass.trigger();
  }

  private async drain(): Promise<void> {
    const { store } = this.env;
    if (!store.driveOffline.held()) {
      this.seen = store.driveFeed.latestSeq();
      return;
    }
    const changed = new Map<string, Set<string>>();
    for (;;) {
      const window = store.driveFeed.since(this.seen, FEED_BATCH);
      const last = window.rows.at(-1);
      if (last !== undefined) this.seen = last.seq;
      this.gather(
        window.rows.filter((row) => CHANGING.has(row.op)).map((row) => row.itemId),
        changed,
      );
      if (window.next === null) break;
      await new Promise<void>((resolve) => {
        setImmediate(resolve);
      });
    }
    for (const [clientId, itemIds] of changed) {
      this.send(clientId, [...itemIds]);
    }
  }

  private gather(itemIds: readonly string[], changed: Map<string, Set<string>>): void {
    if (itemIds.length === 0) return;
    const { store } = this.env;
    for (const held of store.driveOffline.holdersOfEach([...new Set(itemIds)])) {
      const item = store.driveItems.find(held.itemId, null);
      if (item === undefined || !this.holds(held.profileId, item)) continue;
      const ids = changed.get(held.clientId) ?? new Set<string>();
      ids.add(item.id);
      changed.set(held.clientId, ids);
    }
  }

  private holds(profileId: string, item: DriveItem): boolean {
    const { store } = this.env;
    const actor = { profileId };
    const view = store.driveItems.find(item.id, profileId);
    if (view === undefined) return false;
    const access = itemAccess(store, actor, store.driveRoots.byId(view.rootId), view);
    return canRead(access) && mayExport(access, view.locked);
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
