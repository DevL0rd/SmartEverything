import { PhotoPipeline } from '../../photos/pipeline/runtime';
import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import type { DriveDataSpace } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { HubLayout } from '../../data-layout';
import { DriveAlbumsService, type SmartMemberRow, type SmartQueryRunner } from '../../drive/albums';
import { DriveBackups } from '../../drive/backups';
import type { ConflictEnv, DriveConflictStore } from '../../drive/conflicts';
import { readDataSpace, type DataSpaceProbe } from '../../drive/data-space';
import { TextCursors, type TextEnvironment } from '../../drive/content/text-job';
import { DriveGrants } from '../../drive/grants';
import { DriveHealthReader } from '../../drive/health';
import { ContentHasher, HashWorker } from '../../drive/hasher';
import { BUNDLED_HASH_WORKER, BUNDLED_SCANNER_WORKER, type DriveJob } from '../../drive/jobs';
import { BUNDLED_METADATA_WORKER } from '../../drive/metadata-client';
import { nodeCaller } from '../../drive/node-caller';
import type { DrivePlacements } from '../../drive/placements';
import { DriveScrubber, type ScrubCorruption } from '../../drive/scrub';
import { DriveReadService } from '../../drive/service-read';
import { DriveWriteService } from '../../drive/service-write';
import { DriveShares, shareOriginOf, type ShareOrigin } from '../../drive/shares';
import { PurgeTimer } from '../../drive/trash-purge';
import { TusUploads, type TusEnv } from '../../drive/uploads-tus';
import { WriteBatch } from '../../drive/write-batch';
import { fileEnv } from '../../drive/versions';
import { DriveWatchers, systemWatch } from '../../drive/watcher';
import { WorkQueue, defaultConcurrency } from '../../drive/work-queue';
import type { ComputerNodeAccess } from '../../computers/node-access';
import type { PushCommandChannel } from '../../extensions/push/commands';
import { found, type StoreContext } from '../../store/context';
import type { Store } from '../../store/store';
import type { MediaLinks } from '../media-links';
import { availabilityOf } from './drive-availability';
import { driveJobHandlers, mountedRoot } from './drive-jobs';
import { DriveActivity } from '../../drive/activity';
import { DriveRootLanes } from '../../drive/root-lanes';
import { extrasOf, iconsOf, placementsOf, textOf, type DriveExtras } from './drive-extras';
import { actorOf, type DriveListings, type DriveServices } from './drive-services';
import { photoBackupService } from './photos-hub';
import { tusAuthentication } from './drive-tus-auth';

export interface DriveParts {
  readonly context: StoreContext;
  readonly database: DatabaseSync;
  readonly conflicts: DriveConflictStore;
  readonly listings: DriveListings;
  readonly removeLocationOutside: (sharedBy: string) => boolean;
  readonly notifyCorruption: (corruption: ScrubCorruption) => void;
}

export interface DriveDeps {
  readonly store: Store;
  readonly parts: DriveParts;
  readonly layout: HubLayout;
  readonly localUrl: () => string;
  readonly links: MediaLinks;
  readonly nodes: ComputerNodeAccess;
  readonly pushCommands: Pick<PushCommandChannel, 'send'>;
  readonly probe: DataSpaceProbe;
  readonly now: () => Date;
  readonly log: Logger;
  readonly watchSettleMs: number;
  readonly scannerScript?: string;
  readonly hasherScript?: string;
  readonly metadataScript?: string;
  readonly contentScript?: string;
}

export interface DriveRuntime {
  readonly activity: DriveActivity;
  readonly lanes: DriveRootLanes;
  readonly media: PhotoPipeline;
  readonly services: DriveServices;
  readonly env: ConflictEnv;
  readonly queue: WorkQueue<DriveJob>;
  readonly watchers: DriveWatchers;
  readonly purge: PurgeTimer;
  readonly uploads: TusUploads;
  readonly scrubber: DriveScrubber;
  readonly availability: ReturnType<typeof availabilityOf>;
  readonly placements: DrivePlacements;
  readonly extras: DriveExtras;
}

interface Core {
  readonly env: ConflictEnv;
  readonly queue: WorkQueue<DriveJob>;
  readonly watchers: DriveWatchers;
  readonly scrubber: DriveScrubber;
  readonly backups: DriveBackups;
  readonly lanes: DriveRootLanes;
}

const MEMBER_ROW = z.object({ id: z.string(), at: z.number() });

const TOTAL_ROW = z.object({ total: z.number() });

function smartRunnerOf(context: StoreContext): SmartQueryRunner {
  return {
    rows: (statement): readonly SmartMemberRow[] =>
      context.sql.all(MEMBER_ROW, statement.text, statement.parameters),
    count: (statement): number =>
      found(
        context.sql.get(TOTAL_ROW, statement.text, statement.parameters),
        'smart album count',
        statement.text,
      ).total,
  };
}

function scrubberOf(deps: DriveDeps, availability: DriveRuntime['availability']): DriveScrubber {
  const { store, parts, log } = deps;
  return new DriveScrubber({
    store: {
      feed: store.feed,
      write: store.write,
      now: store.now,
      driveRoots: store.driveRoots,
      driveScrub: store.driveScrub,
      driveItems: {
        find: (id) => store.driveItems.find(id, null),
        identityOf: (id) => store.driveItems.identityOf(id),
        setIntegrity: (id, integrity): void => {
          parts.context.sql.run(
            'record the file integrity',
            'update drive_items set integrity = $integrity where id = $id',
            { id, integrity },
          );
        },
      },
    },
    availability,
    openHasher: () => new HashWorker(deps.hasherScript ?? BUNDLED_HASH_WORKER),
    notifyOwner: parts.notifyCorruption,
    log: log.forArea('hub.drive-scrub'),
  });
}

function conflictEnvOf(deps: DriveDeps, rearm: () => void): ConflictEnv {
  return {
    ...fileEnv(deps.store, deps.log.forArea('hub.drive'), deps.now),
    store: deps.store,
    purge: { rearm },
    conflicts: deps.parts.conflicts,
  };
}

function queueOf(
  deps: DriveDeps,
  availability: DriveRuntime['availability'],
  media: PhotoPipeline,
  jobs: {
    readonly text: TextEnvironment;
    readonly lanes: DriveRootLanes;
    readonly activity: DriveActivity;
  },
): WorkQueue<DriveJob> {
  const textCursors = new TextCursors();
  const handlers = driveJobHandlers({
    store: deps.store,
    context: deps.parts.context,
    availability,
    log: deps.log.forArea('hub.drive-jobs'),
    scannerScript: deps.scannerScript ?? BUNDLED_SCANNER_WORKER,
    hasherScript: deps.hasherScript ?? BUNDLED_HASH_WORKER,
    metadataScript: deps.metadataScript ?? BUNDLED_METADATA_WORKER,
    text: jobs.text,
    textCursors,
    lanes: jobs.lanes,
  });
  const queue: WorkQueue<DriveJob> = new WorkQueue<DriveJob>({
    concurrency: defaultConcurrency(),
    keyOf: handlers.keyOf,
    merge: handlers.merge,
    run: async (job, signal): Promise<void> => {
      if (job.kind === 'hash' || job.kind === 'metadata') await jobs.activity.quiet();
      await handlers.run(job, signal);
      if (job.kind === 'metadata' && !signal.aborted) {
        media.refresh();
        textCursors.forget(job.rootId);
        queue.enqueue({ kind: 'text', rootId: job.rootId });
      }
      if ((job.kind === 'scan' || job.kind === 'reflect') && !signal.aborted)
        followUps(queue, job.rootId);
    },
    failed: (job, cause): void => {
      deps.log.error('drive.job_failed', cause, { kind: job.kind, rootId: job.rootId });
    },
  });
  return queue;
}

function followUps(queue: WorkQueue<DriveJob>, rootId: string): void {
  queue.enqueue({ kind: 'hash', rootId });
  queue.enqueue({ kind: 'metadata', rootId });
}

function watchersOf(
  deps: DriveDeps,
  queue: WorkQueue<DriveJob>,
  activity: DriveActivity,
): DriveWatchers {
  const { store } = deps;
  return new DriveWatchers({
    roots: store.driveRoots,
    index: { items: store.driveItems, inodes: store.driveInodes },
    activity,
    mounted: (rootId) => mountedRoot(store, rootId),
    onPlacementChange: (listener) =>
      store.feed.subscribe((change) => {
        if (change.table !== 'drive_placements') return;
        for (const row of [change.record, change.oldRecord]) {
          if (row !== null) listener(row.rootId);
        }
      }),
    enqueueScan: (rootId): void => {
      queue.enqueue({ kind: 'scan', rootId });
    },
    enqueueReflect: (rootId, paths): void => {
      queue.enqueue({ kind: 'reflect', rootId, paths });
    },
    enqueueFollowUps: (rootId): void => {
      followUps(queue, rootId);
    },
    watch: systemWatch,
    settleMs: deps.watchSettleMs,
    log: deps.log.forArea('hub.drive'),
  });
}

function albumsOf(deps: DriveDeps): DriveAlbumsService {
  const { store } = deps;
  return new DriveAlbumsService({
    albums: store.driveAlbums,
    items: store.driveItems,
    roots: store.driveRoots,
    grants: store.driveGrants,
    runner: smartRunnerOf(deps.parts.context),
    newId: randomUUID,
    now: (): string => deps.now().toISOString(),
    get timeZone(): string {
      return store.settings.read().time_zone;
    },
  });
}

function sharesOf(deps: DriveDeps): DriveShares {
  return new DriveShares({
    store: deps.store,
    origin: (): ShareOrigin => shareOriginOf(deps.store, deps.localUrl()),
    now: deps.now,
  });
}

function writeOf(
  deps: DriveDeps,
  core: Core,
  readers: Pick<DriveServices, 'read' | 'albums' | 'shares'>,
): DriveWriteService {
  const { store, probe } = deps;
  return new DriveWriteService({
    env: core.env,
    store,
    read: readers.read,
    albums: readers.albums,
    shares: readers.shares,
    scrub: core.scrubber,
    backups: core.backups,
    guard: { status: (profileId) => store.driveQuotas.status(profileId), space: probe.space },
    scan: (rootId): void => {
      core.queue.enqueue({ kind: 'scan', rootId });
    },
    lanes: core.lanes,
  });
}

function dataSpaceOf(deps: DriveDeps): () => Promise<DriveDataSpace> {
  return () => readDataSpace(deps.probe, deps.layout.root);
}

function healthOf(deps: DriveDeps, core: Core): DriveHealthReader {
  const { store } = deps;
  return new DriveHealthReader(deps.parts.context, {
    roots: () => store.driveRoots.list(),
    watcher: (rootId) => core.watchers.status(rootId),
    scrub: () => core.scrubber.state(),
    backup: () => core.backups.status(),
    space: dataSpaceOf(deps),
  });
}

function servicesOf(deps: DriveDeps, core: Core): DriveServices {
  const { store } = deps;
  const readers = {
    read: new DriveReadService(store),
    albums: albumsOf(deps),
    shares: sharesOf(deps),
  };
  return {
    ...readers,
    write: writeOf(deps, core, readers),
    scrub: core.scrubber,
    backups: core.backups,
    health: healthOf(deps, core),
    files: {
      store,
      links: deps.links,
      nodes: {
        authenticate: (token) => deps.nodes.authenticate(token),
        actorOf: (node) => actorOf(store, nodeCaller(store, node)),
      },
      now: deps.now,
    },
    grants: new DriveGrants({ store }),
    probe: deps.probe,
    dataSpace: dataSpaceOf(deps),
    listings: deps.parts.listings,
  };
}

function uploadsOf(deps: DriveDeps, env: ConflictEnv, activity: DriveActivity): TusUploads {
  const backup = photoBackupService({ store: deps.store, env });
  const tus: TusEnv = {
    ...env,
    store: deps.store,
    space: deps.probe.space,
    completed: (item): void => {
      backup.settleItem(item);
    },
    activity,
    authenticate: tusAuthentication(deps.store, deps.nodes),
    hasher: new ContentHasher(deps.hasherScript ?? BUNDLED_HASH_WORKER),
    settle: new WriteBatch(deps.store, deps.log.forArea('hub.drive')).write,
  };
  return new TusUploads(tus);
}

function backupsOf(deps: DriveDeps): DriveBackups {
  return new DriveBackups({
    database: deps.parts.database,
    store: deps.store,
    log: deps.log.forArea('hub.drive'),
  });
}

export function createDrive(deps: DriveDeps): DriveRuntime {
  const availability = availabilityOf();
  const purge: PurgeTimer = new PurgeTimer(
    conflictEnvOf(deps, (): void => {
      purge.rearm();
    }),
  );
  const env = conflictEnvOf(deps, purge.rearm);
  const media = new PhotoPipeline(deps);
  const icons = iconsOf(deps);
  const lanes = new DriveRootLanes();
  const activity = new DriveActivity();
  const queue = queueOf(deps, availability, media, {
    text: textOf(deps, availability, icons, activity),
    lanes,
    activity,
  });
  const core: Core = {
    env,
    queue,
    watchers: watchersOf(deps, queue, activity),
    scrubber: scrubberOf(deps, availability),
    backups: backupsOf(deps),
    lanes,
  };
  const services = servicesOf(deps, core);
  const placements = placementsOf(deps);
  return {
    activity,
    lanes,
    env,
    media,
    queue,
    watchers: core.watchers,
    scrubber: core.scrubber,
    services,
    purge,
    uploads: uploadsOf(deps, env, activity),
    availability,
    placements,
    extras: extrasOf(deps, {
      env,
      read: services.read,
      shares: services.shares,
      placements,
      icons,
    }),
  };
}
