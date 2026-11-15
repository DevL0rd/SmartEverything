import { LEASE_MS } from '@smarteverything/domain/drive-mount';
import { background, type Logger } from '@smarteverything/logging';
import type { Store } from '../../store/store';
import type { DriveActivity } from '../activity';
import type { PosixChangeEnv, PosixEnv } from '../posix/env';
import { DrivePosix } from '../posix/service';
import { MountCommits } from './commits';
import { MountCopy } from './copy';
import { MountDedupe } from './dedupe';
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
import { onDriveSettingsChanged, readDriveSettings } from '../settings';
import { SettleGroup } from './settle-group';
import { BUNDLED_MOUNT_HASH_WORKER, HashPool } from './workers';
import { MountRegistry } from './registry';
import type { MountServices } from './services';
import { Staging } from './staging';

export interface MountEnv {
  readonly store: Store;
  readonly change: PosixChangeEnv;
  readonly guard: PosixEnv['guard'];
  readonly space: PosixEnv['space'];
  readonly activity: DriveActivity;
  readonly log: Logger;
  readonly leaseMs?: number;
  readonly hashWorker?: string;
}

function journalOf(store: Store): () => string | null {
  return (): string | null => {
    const file = store.database.location();
    return file === null ? null : `${file}-wal`;
  };
}

function servicesOf(env: MountEnv): MountServices {
  const { store, change } = env;
  const leaseMs = env.leaseMs ?? LEASE_MS;
  const held = new HeldInodes();
  const posix = new DrivePosix({
    change,
    guard: env.guard,
    space: env.space,
    holds: (inodeId): boolean => held.holds(inodeId),
  });
  const handles = new HandleTable({ posix, files: change.files, store }, held);
  let pool: HashPool | null = null;
  const hashes = (): HashPool => {
    pool ??= new HashPool(
      env.hashWorker ?? BUNDLED_MOUNT_HASH_WORKER,
      readDriveSettings(store).cpuWorkers,
    );
    return pool;
  };
  const listings = new ListingCache(readDriveSettings(store).listingCacheSeconds, (rootId) =>
    store.driveFeed.latestSeqInRoot(rootId),
  );
  const staging = new Staging({ files: change.files, store, hashes });
  const settle = new SettleGroup(store, env.log);
  const fsync = new GroupFsync(journalOf(store));
  const dedupe = new MountDedupe(store.driveSyncOps);
  const locks = new LockService(leaseMs);
  const commits = new MountCommits({ posix, change, staging, handles });
  const finishing = { posix, change, staging, handles, guard: env.guard, fsync, settle, dedupe };
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
    applySettings: (settings): void => {
      pool?.resize(settings.cpuWorkers);
      listings.setSeconds(settings.listingCacheSeconds);
    },
    listings,
    push: new PushPump(store),
    registry: new MountRegistry({ leaseMs, posix, handles, locks }),
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
      background(
        Promise.resolve().then(() => {
          this.pump(rootId);
        }),
        'drive_mount.push_failed',
      );
    }
  }

  pump(rootId: string): void {
    const { registry, push } = this.services;
    let oldest = Number.POSITIVE_INFINITY;
    for (const session of registry.ofRoot(rootId)) {
      for (const attachment of session.attachments.values()) {
        if (attachment.scope.drive.id !== rootId) continue;
        push.pump(session, attachment);
        oldest = Math.min(oldest, attachment.sentSeq);
      }
    }
    push.settle(
      rootId,
      Number.isFinite(oldest) ? oldest : this.env.store.driveFeed.latestSeqInRoot(rootId),
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
