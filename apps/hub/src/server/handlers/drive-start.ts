import { assertPhotosFolderPrepared } from '../../photos/folder-migration';
import { finishCommitFromDisk } from '../../drive/commit-recovery';
import { textTrigger } from '../../drive/content/text-job';
import { recoverIntents } from '../../drive/intents';
import { sweepOrphansAtStart } from '../../drive/orphans';
import { readDriveSettings } from '../../drive/settings';
import { ensureDrives } from '../../drive/spaces';
import type { StoredDrive } from '../../store/repositories/drive-roots';
import { sweepOrphanVersionsAtStart } from '../../drive/versions';
import type { RawRoute } from '../http-server';
import { driveExtraRoutes, driveRoutes } from './drive';
import { driveRawRoutes } from './drive-raw-routes';
import { UploadSweeper } from './drive-upload-sweep';
import { createDrive, type DriveDeps, type DriveRuntime } from './drive-wiring';

export interface RunningDrive {
  readonly routes: ReturnType<typeof driveRoutes> & ReturnType<typeof driveExtraRoutes>;
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
  for (const root of roots) {
    const swept = await sweepOrphansAtStart(runtime.env, root);
    if (swept > 0) deps.log.info('drive.start_orphans_swept', { rootId: root.id, removed: swept });
  }
  for (const root of roots.filter((one) => one.versions)) {
    const removed = await sweepOrphanVersionsAtStart(runtime.env, root);
    if (removed > 0) deps.log.info('drive.start_versions_swept', { rootId: root.id, removed });
  }
}

const DAY_MS = 24 * 60 * 60 * 1000;

async function sweepRequestPartials(deps: DriveDeps, runtime: DriveRuntime): Promise<void> {
  const olderThanMs = readDriveSettings(deps.store).uploadExpiryDays * DAY_MS;
  for (const root of await onlineDrives(deps, runtime)) {
    const removed = await runtime.extras.intake.sweepStale(root, olderThanMs);
    if (removed > 0) deps.log.info('drive_file_request.swept', { rootId: root.id, removed });
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

function startExtras(deps: DriveDeps, runtime: DriveRuntime): () => void {
  const { extras, queue } = runtime;
  const stops = [
    extras.expiry.start(),
    extras.editNotices.start(),
    extras.offline.start(),
    textTrigger(deps.store.feed, (rootId): void => {
      queue.enqueue({ kind: 'text', rootId });
    }),
  ];
  for (const root of deps.store.driveRoots.list()) queue.enqueue({ kind: 'text', rootId: root.id });
  return (): void => {
    for (const stop of stops) stop();
  };
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
  await sweepRequestPartials(deps, runtime);
  await follower.reconcileAll();
  const unfollow = follower.follow();
  const stopExtras = startExtras(deps, runtime);
  return {
    routes: {
      ...driveRoutes(deps.store, runtime.services),
      ...driveExtraRoutes(deps.store, runtime.extras),
    },
    rawRoutes: driveRawRoutes(deps, runtime, sweeper),
    runtime,
    stop: async (): Promise<void> => {
      unfollow();
      stopExtras();
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
