import { LEASE_MS } from '@smarteverything/domain/drive-mount';
import { background, type Logger } from '@smarteverything/logging';
import type { Store } from '../../store/store';
import type { PosixChangeEnv, PosixEnv } from '../posix/env';
import { DrivePosix } from '../posix/service';
import { MountCommits } from './commits';
import { MountDedupe } from './dedupe';
import { Dispatch } from './dispatch';
import { MountFinish } from './finish';
import { GroupFsync } from './fsync';
import { HandleTable, HeldInodes } from './handles';
import { LockService } from './lock-service';
import { fileOperations } from './ops-files';
import { namespaceOperations } from './ops-namespace';
import { PushPump } from './push';
import { MountRegistry } from './registry';
import type { MountServices } from './services';
import { Staging } from './staging';

export interface MountEnv {
  readonly store: Store;
  readonly change: PosixChangeEnv;
  readonly guard: PosixEnv['guard'];
  readonly space: PosixEnv['space'];
  readonly log: Logger;
  readonly leaseMs?: number;
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
  const staging = new Staging({ files: change.files, store });
  const fsync = new GroupFsync(journalOf(store));
  const dedupe = new MountDedupe(store.driveSyncOps);
  const locks = new LockService(leaseMs);
  const commits = new MountCommits({ posix, change, staging, handles });
  const finishing = { posix, change, staging, handles, guard: env.guard, fsync, dedupe };
  return {
    store,
    posix,
    handles,
    commits,
    finish: new MountFinish(finishing, commits),
    staging,
    locks,
    dedupe,
    fsync,
    push: new PushPump(store),
    registry: new MountRegistry({ leaseMs, posix, handles, locks }),
  };
}

export class DriveMount {
  readonly services: MountServices;
  readonly dispatch: Dispatch;
  private readonly unsubscribe: () => void;

  constructor(private readonly env: MountEnv) {
    this.services = servicesOf(env);
    this.dispatch = new Dispatch(
      { ...namespaceOperations(this.services), ...fileOperations(this.services) },
      env.log,
      env.store,
    );
    const missing = this.dispatch.complete();
    if (missing.length > 0) {
      throw new Error(`The drive mount has no handler for ${missing.join(', ')}.`);
    }
    this.unsubscribe = env.store.feed.subscribeNotices((notice) => {
      if (notice.type === 'drive_changed') this.changed(notice.rootIds);
    });
  }

  private changed(rootIds: readonly string[]): void {
    for (const rootId of rootIds) {
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
    this.services.registry.stop();
  }
}
