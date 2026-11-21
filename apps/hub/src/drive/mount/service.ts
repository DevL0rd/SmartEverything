import type { DriveSettings } from '@smarteverything/domain';
import { LEASE_MS } from '@smarteverything/domain/drive-mount';
import { background, type Logger } from '@smarteverything/logging';
import type { Store } from '../../store/store';
import type { DriveActivity } from '../activity';
import type { DriveRootLanes } from '../root-lanes';
import type { PosixChangeEnv, PosixEnv } from '../posix/env';
import { DrivePosix } from '../posix/service';
import { MountCommits } from './commits';
import { MountCopy } from './copy';
import { MountDedupe, type MountOpMemory } from './dedupe';
import { Dispatch } from './dispatch';
import { resolversOf } from './lanes';
import { MountFinish } from './finish';
import { GroupFsync } from './fsync';
import { HandleTable, HeldInodes } from './handles';
import { ListingCache } from './listing-cache';
import { LockService } from './lock-service';
import { fileOperations } from './ops-files';
import { namespaceOperations } from './ops-namespace';
import { PushPump } from './push';
import { onDriveSettingsChanged } from '../settings';
import { BUNDLED_MOUNT_HASH_WORKER, HashPool } from './workers';
import { MountRegistry } from './registry';
import type { MountServices } from './services';
import type { Attachment } from './session';
import { Staging } from './staging';

export interface MountEnv {
  readonly store: Store;
  readonly change: PosixChangeEnv;
  readonly guard: PosixEnv['guard'];
  readonly space: PosixEnv['space'];
  readonly activity: DriveActivity;
  readonly lanes: DriveRootLanes;
  readonly log: Logger;
  readonly settings: DriveSettings;
  readonly leaseMs?: number;
  readonly hashWorker?: string;
}

function journalOf(store: Pick<Store, 'path'>): () => string | null {
  return (): string => `${store.path}-wal`;
}

function posixOf(env: MountEnv, held: HeldInodes): DrivePosix {
  return new DrivePosix({
    change: env.change,
    guard: env.guard,
    space: env.space,
    holds: (inodeId): boolean => held.holds(inodeId),
    lanes: env.lanes,
  });
}

function memoryOf(store: Store): MountOpMemory {
  return {
    recall: (placementId, opId) => store.host.call('driveSyncOps', 'recall', placementId, opId),
    rememberAll: (entries) => store.host.call('driveSyncOps', 'rememberAll', entries),
  };
}

function servicesOf(env: MountEnv): MountServices {
  const { store, change } = env;
  const leaseMs = env.leaseMs ?? LEASE_MS;
  let settings = env.settings;
  const held = new HeldInodes();
  const posix = posixOf(env, held);
  const handles = new HandleTable({ posix, files: change.files, store }, held);
  let pool: HashPool | null = null;
  const hashes = (): HashPool => {
    pool ??= new HashPool(env.hashWorker ?? BUNDLED_MOUNT_HASH_WORKER, settings.cpuWorkers);
    return pool;
  };
  const listings = new ListingCache(settings.listingCacheSeconds);
  const staging = new Staging({ files: change.files, store, hashes });
  const fsync = new GroupFsync(journalOf(store));
  const dedupe = new MountDedupe(memoryOf(store), env.log);
  const locks = new LockService(leaseMs);
  const shared = { posix, change, staging, handles };
  const commits = new MountCommits(shared);
  const finishing = { ...shared, guard: env.guard, fsync, dedupe, log: env.log };
  return {
    store,
    posix,
    handles,
    commits,
    copy: new MountCopy({ handles, commits, staging, files: change.files, store, log: env.log }),
    finish: new MountFinish(finishing, commits),
    staging,
    locks,
    dedupe,
    fsync,
    stopHashes: (): Promise<void> => (pool === null ? Promise.resolve() : pool.stop()),
    applySettings: (next): void => {
      settings = next;
      pool?.resize(next.cpuWorkers);
      listings.setSeconds(next.listingCacheSeconds);
    },
    listings,
    push: new PushPump(store),
    registry: new MountRegistry({
      leaseMs,
      posix,
      handles,
      locks,
      latestSeq: () => store.host.call('driveFeed', 'latestSeq'),
    }),
  };
}

export class DriveMount {
  readonly services: MountServices;
  readonly dispatch: Dispatch;
  private readonly unsubscribe: () => void;
  private readonly unsubscribeSettings: () => void;

  constructor(private readonly env: MountEnv) {
    this.services = servicesOf(env);
    this.dispatch = new Dispatch(
      { ...namespaceOperations(this.services), ...fileOperations(this.services) },
      env.log,
      resolversOf(this.services),
      env.activity,
    );
    const missing = this.dispatch.complete();
    if (missing.length > 0) {
      throw new Error(`The drive mount has no handler for ${missing.join(', ')}.`);
    }
    this.unsubscribeSettings = onDriveSettingsChanged(env.store, (settings) => {
      this.services.applySettings(settings);
    });
    this.unsubscribe = env.store.feed.subscribeNotices((notice) => {
      if (notice.type === 'drive_changed') this.changed(notice.rootIds);
    });
  }

  private changed(rootIds: readonly string[]): void {
    for (const rootId of rootIds) {
      this.services.listings.invalidateRoot(rootId);
      background(this.pump(rootId), 'drive_mount.push_failed');
    }
  }

  async pump(rootId: string): Promise<void> {
    const { registry, push } = this.services;
    const pumped: Attachment[] = [];
    const pumps: Promise<void>[] = [];
    for (const session of registry.ofRoot(rootId)) {
      for (const attachment of session.attachments.values()) {
        if (attachment.scope.drive.id !== rootId) continue;
        pumps.push(push.pump(session, attachment));
        pumped.push(attachment);
      }
    }
    await Promise.all(pumps);
    const oldest = Math.min(...pumped.map((attachment) => attachment.sentSeq));
    push.settle(
      rootId,
      Number.isFinite(oldest)
        ? oldest
        : await this.env.store.host.call('driveFeed', 'latestSeqInRoot', rootId),
    );
  }

  stop(): void {
    this.unsubscribe();
    this.unsubscribeSettings();
    this.services.registry.stop();
    this.services.listings.clear();
    background(this.services.stopHashes(), 'drive_mount.hash_pool_stop_failed');
  }
}
