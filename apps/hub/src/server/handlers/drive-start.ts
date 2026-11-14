import { assertPhotosFolderPrepared } from '../../photos/folder-migration';
import { finishCommitFromDisk } from '../../drive/changes';
import { recoverIntents } from '../../drive/intents';
import { ensureDrives } from '../../drive/spaces';
import type { StoredDrive } from '../../store/repositories/drive-roots';
import { sweepOrphanVersionsAtStart } from '../../drive/versions';
import type { RawRoute } from '../http-server';
import { driveRoutes } from './drive';
import { driveRawRoutes } from './drive-raw-routes';
import { UploadSweeper } from './drive-upload-sweep';
import { createDrive, type DriveDeps, type DriveRuntime } from './drive-wiring';

export interface RunningDrive {
  readonly routes: ReturnType<typeof driveRoutes>;
  readonly rawRoutes: readonly RawRoute[];
  readonly runtime: DriveRuntime;
  readonly stop: () => Promise<void>;
}

async function onlineDrives(deps: DriveDeps, runtime: DriveRuntime): Promise<StoredDrive[]> {
  const online: StoredDrive[] = [];
  for (const root of deps.store.driveRoots.list()) {
    if ((await runtime.availability(root)) === 'online') {
      online.push(root);
    }
  }
  return online;
}

async function recoverFiles(deps: DriveDeps, runtime: DriveRuntime): Promise<void> {
  const roots = await onlineDrives(deps, runtime);
  const report = await recoverIntents(
    { ...runtime.env, finishCommit: finishCommitFromDisk(runtime.env) },
    roots,
  );
  deps.log.info('drive.start_recovered', { ...report });
  for (const root of roots.filter((one) => one.versions)) {
    const removed = await sweepOrphanVersionsAtStart(runtime.env, root);
    if (removed > 0) deps.log.info('drive.start_versions_swept', { rootId: root.id, removed });
  }
}

class RootFollower {
  private readonly watched = new Set<string>();
  private tail: Promise<void> = Promise.resolve();

  constructor(
    private readonly deps: DriveDeps,
    private readonly runtime: DriveRuntime,
  ) {}

  async watch(root: StoredDrive): Promise<void> {
    if (this.watched.has(root.id)) return;
    this.watched.add(root.id);
    if ((await this.runtime.availability(root)) === 'online') this.runtime.watchers.start(root);
    else this.runtime.queue.enqueue({ kind: 'scan', rootId: root.id });
  }

  async reconcileAll(): Promise<void> {
    for (const root of this.deps.store.driveRoots.list()) await this.watch(root);
  }

  follow(): () => void {
    const { store } = this.deps;
    return store.feed.subscribe((change) => {
      if (change.table === 'profiles' && change.operation !== 'DELETE') {
        this.later('drive.spaces_failed', () => this.ensureSpaces());
      } else if (change.table === 'drive_roots') {
        if (change.operation === 'DELETE' && change.oldRecord !== null) {
          this.watched.delete(change.oldRecord.id);
          this.runtime.watchers.stop(change.oldRecord.id);
        }
      }
    });
  }

  async ensureSpaces(): Promise<void> {
    const { store, layout } = this.deps;
    for (const root of await ensureDrives(store, layout, store.profiles.list())) {
      await this.watch(root);
    }
  }

  private later(event: string, work: () => Promise<void>): void {
    this.tail = this.tail.then(work).catch((cause: unknown) => {
      this.deps.log.error(event, cause);
    });
  }

  settled(): Promise<void> {
    return this.tail;
  }
}

export async function startDrive(deps: DriveDeps): Promise<RunningDrive> {
  assertPhotosFolderPrepared(deps.store.context.sql);
  const runtime = createDrive(deps);
  const follower = new RootFollower(deps, runtime);
  await ensureDrives(deps.store, deps.layout, deps.store.profiles.list());
  await recoverFiles(deps, runtime);
  runtime.media.start();
  runtime.purge.start();
  await runtime.uploads.sweepExpired();
  const sweeper = new UploadSweeper(runtime.uploads, deps.now, deps.log);
  sweeper.rearm();
  await follower.reconcileAll();
  const unfollow = follower.follow();
  return {
    routes: driveRoutes(deps.store, runtime.services),
    rawRoutes: driveRawRoutes(deps, runtime, sweeper),
    runtime,
    stop: async (): Promise<void> => {
      unfollow();
      await follower.settled();
      sweeper.stop();
      runtime.purge.stop();
      runtime.watchers.close();
      runtime.scrubber.stop();
      await runtime.queue.stop();
      await runtime.media.stop();
      await runtime.scrubber.settled();
      await runtime.purge.settled();
    },
  };
}
