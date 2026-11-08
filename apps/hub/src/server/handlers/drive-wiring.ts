import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import type { Logger } from '@smarteverything/logging';
import type { HubLayout } from '../../data-layout';
import { DriveAlbumsService, type SmartMemberRow, type SmartQueryRunner } from '../../drive/albums';
import { DriveBackups } from '../../drive/backups';
import { hashRequested, type HashResponse } from '../../drive/blocks';
import type { ConflictEnv, DriveConflictStore } from '../../drive/conflicts';
import { DriveHealthReader } from '../../drive/health';
import { BUNDLED_HASH_WORKER, BUNDLED_SCANNER_WORKER, type DriveJob } from '../../drive/jobs';
import { nodeCaller } from '../../drive/node-caller';
import { DriveScrubber, type FileHasher, type ScrubCorruption } from '../../drive/scrub';
import { DriveReadService } from '../../drive/service-read';
import { DriveWriteService } from '../../drive/service-write';
import { DriveShares, shareOriginOf, type ShareOrigin } from '../../drive/shares';
import { PurgeTimer } from '../../drive/trash-purge';
import { TusUploads, type TusEnv } from '../../drive/uploads-tus';
import { fileEnv } from '../../drive/versions';
import type { VolumeProbe } from '../../drive/volumes';
import { DriveWatchers, systemWatch } from '../../drive/watcher';
import { WorkQueue, defaultConcurrency } from '../../drive/work-queue';
import type { ComputerNodeAccess } from '../../computers/node-access';
import { found, type StoreContext } from '../../store/context';
import type { Store } from '../../store/store';
import type { MediaLinks } from '../media-links';
import { availabilityOf } from './drive-availability';
import { driveJobHandlers } from './drive-jobs';
import { actorOf, type DriveListings, type DriveServices } from './drive-services';
import { photoBackupService } from './photos-hub';
import { tusAuthentication } from './drive-tus-auth';

export interface DriveParts {
  readonly context: StoreContext;
  readonly database: DatabaseSync;
  readonly conflicts: DriveConflictStore;
  readonly listings: DriveListings;
  readonly removeLocationOutside: (sharedBy: string) => boolean;
  readonly notifyOwner: (corruption: ScrubCorruption) => void;
}

export interface DriveDeps {
  readonly store: Store;
  readonly parts: DriveParts;
  readonly layout: HubLayout;
  readonly installDirectory: string;
  readonly localUrl: () => string;
  readonly links: MediaLinks;
  readonly nodes: ComputerNodeAccess;
  readonly probe: VolumeProbe;
  readonly now: () => Date;
  readonly log: Logger;
  readonly watchSettleMs: number;
  readonly scannerScript?: string;
  readonly hasherScript?: string;
}

export interface DriveRuntime {
  readonly services: DriveServices;
  readonly env: ConflictEnv;
  readonly queue: WorkQueue<DriveJob>;
  readonly watchers: DriveWatchers;
  readonly purge: PurgeTimer;
  readonly uploads: TusUploads;
  readonly scrubber: DriveScrubber;
  readonly availability: ReturnType<typeof availabilityOf>;
}

interface Core {
  readonly env: ConflictEnv;
  readonly queue: WorkQueue<DriveJob>;
  readonly watchers: DriveWatchers;
  readonly scrubber: DriveScrubber;
  readonly backups: DriveBackups;
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

function inProcessHasher(): () => FileHasher {
  let next = 0;
  return (): FileHasher => ({
    request: (fields): Promise<HashResponse> => {
      next += 1;
      return hashRequested({ ...fields, id: next });
    },
    close: (): Promise<void> => Promise.resolve(),
  });
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
        find: (id) => store.driveItems.find(id),
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
    openHasher: inProcessHasher(),
    notifyOwner: parts.notifyOwner,
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

function queueOf(deps: DriveDeps, availability: DriveRuntime['availability']): WorkQueue<DriveJob> {
  const handlers = driveJobHandlers({
    store: deps.store,
    context: deps.parts.context,
    availability,
    log: deps.log.forArea('hub.drive-jobs'),
    scannerScript: deps.scannerScript ?? BUNDLED_SCANNER_WORKER,
    hasherScript: deps.hasherScript ?? BUNDLED_HASH_WORKER,
  });
  const queue: WorkQueue<DriveJob> = new WorkQueue<DriveJob>({
    concurrency: defaultConcurrency(),
    keyOf: handlers.keyOf,
    run: async (job, signal): Promise<void> => {
      await handlers.run(job, signal);
      if (job.kind === 'scan' && !signal.aborted) {
        queue.enqueue({ kind: 'hash', rootId: job.rootId });
        queue.enqueue({ kind: 'metadata', rootId: job.rootId });
      }
    },
    failed: (job, cause): void => {
      deps.log.error('drive.job_failed', cause, { kind: job.kind, rootId: job.rootId });
    },
  });
  return queue;
}

function watchersOf(deps: DriveDeps, queue: WorkQueue<DriveJob>): DriveWatchers {
  return new DriveWatchers({
    roots: deps.store.driveRoots,
    enqueueScan: (rootId): void => {
      queue.enqueue({ kind: 'scan', rootId });
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
    probe,
    layout: deps.layout,
    installDirectory: deps.installDirectory,
    newId: randomUUID,
    scan: (rootId): void => {
      core.queue.enqueue({ kind: 'scan', rootId });
    },
  });
}

function healthOf(deps: DriveDeps, core: Core): DriveHealthReader {
  const { store } = deps;
  return new DriveHealthReader(deps.parts.context, {
    roots: () => store.driveRoots.list(),
    watcher: (rootId) => core.watchers.status(rootId),
    scrub: () => core.scrubber.state(),
    backup: () => core.backups.status(),
    space: deps.probe.space,
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
    probe: deps.probe,
    listings: deps.parts.listings,
  };
}

function uploadsOf(deps: DriveDeps, env: ConflictEnv): TusUploads {
  const backup = photoBackupService({ store: deps.store, env });
  const tus: TusEnv = {
    ...env,
    store: deps.store,
    space: deps.probe.space,
    completed: (item): void => {
      backup.settleItem(item);
    },
    authenticate: tusAuthentication(deps.store, deps.nodes),
  };
  return new TusUploads(tus);
}

export function createDrive(deps: DriveDeps): DriveRuntime {
  const availability = availabilityOf({
    layout: deps.layout,
    probe: deps.probe,
  });
  const purge: PurgeTimer = new PurgeTimer(
    conflictEnvOf(deps, (): void => {
      purge.rearm();
    }),
  );
  const env = conflictEnvOf(deps, purge.rearm);
  const queue = queueOf(deps, availability);
  const core: Core = {
    env,
    queue,
    watchers: watchersOf(deps, queue),
    scrubber: scrubberOf(deps, availability),
    backups: new DriveBackups({
      database: deps.parts.database,
      store: deps.store,
      log: deps.log.forArea('hub.drive'),
    }),
  };
  return {
    env,
    queue,
    watchers: core.watchers,
    scrubber: core.scrubber,
    services: servicesOf(deps, core),
    purge,
    uploads: uploadsOf(deps, env),
    availability,
  };
}
