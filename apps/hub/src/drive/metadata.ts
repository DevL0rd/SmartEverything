import type { DriveSettings } from '@smarteverything/domain';
import type { StoredDrive } from '../store/repositories/drive-roots';
import type { Logger } from '@smarteverything/logging';
import type { Store } from '../store/store';
import type { DriveJobHandlers } from './jobs';
import { MetadataWorker } from './metadata-client';
import type { MetadataOutcome } from './metadata-protocol';
import { waitsForDevice } from './metadata-zone';
import type { RootAvailability } from './root-marker';
import type {
  MetadataCandidate,
  MetadataReading,
  MetadataRecorded,
  MetadataRecordInput,
} from './units/metadata';

export interface MetadataEnvironment {
  readonly root: (rootId: string) => Promise<StoredDrive | undefined>;
  readonly settings: () => Promise<DriveSettings>;
  readonly hubZone: () => Promise<string>;
  readonly pending: (rootId: string) => Promise<readonly MetadataCandidate[]>;
  readonly record: (input: MetadataRecordInput) => Promise<MetadataRecorded>;
  readonly latestSeq: () => Promise<number>;
  readonly feed: Pick<Store['feed'], 'notice'>;
  readonly availability: (root: StoredDrive) => Promise<RootAvailability>;
  readonly workerScript: string;
  readonly log: Logger;
}

export function hostMetadata(
  store: Pick<Store, 'host'>,
): Pick<MetadataEnvironment, 'root' | 'pending' | 'record' | 'latestSeq'> {
  const { host } = store;
  return {
    root: (rootId) => host.call('driveRoots', 'find', rootId),
    pending: (rootId) => host.read('driveMetadataPending', { rootId }),
    record: (input) => host.write('driveMetadataRecord', input),
    latestSeq: () => host.call('driveFeed', 'latestSeq'),
  };
}

class MetadataRun {
  private worker: MetadataWorker | null = null;
  private recorded = 0;
  private readonly waiting: {
    readonly candidate: MetadataCandidate;
    readonly reading: MetadataReading;
  }[] = [];

  constructor(
    private readonly env: MetadataEnvironment,
    private readonly root: StoredDrive,
    private readonly hubZone: string,
  ) {}

  get done(): number {
    return this.recorded;
  }

  async run(candidates: readonly MetadataCandidate[], signal: AbortSignal): Promise<void> {
    try {
      for (const candidate of candidates) {
        if (signal.aborted) return;
        await this.one(candidate);
      }
      for (const { candidate, reading } of this.waiting) {
        if (signal.aborted) return;
        await this.settle(candidate, reading);
      }
    } finally {
      await this.worker?.close();
    }
  }

  private started(): MetadataWorker {
    this.worker ??= new MetadataWorker(this.env.workerScript);
    return this.worker;
  }

  private async one(candidate: MetadataCandidate): Promise<void> {
    const outcome = await this.started().read({
      rootPath: this.root.path,
      relPath: candidate.relPath,
      dev: candidate.dev,
      ino: candidate.ino,
    });
    const reading = this.readingOf(candidate, outcome);
    if (reading === null) return;
    if (waitsForDevice(reading.facts)) {
      this.waiting.push({ candidate, reading });
      return;
    }
    await this.settle(candidate, reading);
  }

  private readingOf(
    candidate: MetadataCandidate,
    outcome: MetadataOutcome,
  ): MetadataReading | null {
    const where = { rootId: this.root.id, relPath: candidate.relPath };
    switch (outcome.kind) {
      case 'skipped':
        this.env.log.warn('drive.metadata_skipped', { ...where, reason: outcome.reason });
        return null;
      case 'changed':
        this.env.log.info('drive.metadata_changed', { ...where, reason: outcome.reason });
        return null;
      case 'read':
        if (outcome.unreadable !== null) {
          this.env.log.warn('drive.metadata_unreadable', { ...where, reason: outcome.unreadable });
        }
        return { facts: outcome.facts, bytes: outcome.bytes, modifiedMs: outcome.modifiedMs };
    }
  }

  private async settle(candidate: MetadataCandidate, reading: MetadataReading): Promise<void> {
    const outcome = await this.env.record({ candidate, reading, hubZone: this.hubZone });
    if (outcome.zone !== null) {
      this.env.log.info('drive.metadata_zone', {
        rootId: this.root.id,
        relPath: candidate.relPath,
        zone: outcome.zone.zone,
        source: outcome.zone.source,
      });
    }
    if (outcome.recorded) this.recorded += 1;
  }
}

async function readRoot(
  env: MetadataEnvironment,
  rootId: string,
  signal: AbortSignal,
): Promise<void> {
  const root = await env.root(rootId);
  if (root === undefined) {
    env.log.warn('drive.metadata_skipped_root', { rootId, reason: 'no such drive' });
    return;
  }
  if ((await env.settings()).indexingPaused) {
    env.log.info('drive.metadata_paused', { rootId });
    return;
  }
  if ((await env.availability(root)) !== 'online') return;
  const candidates = await env.pending(rootId);
  const run = new MetadataRun(env, root, await env.hubZone());
  const startedAt = performance.now();
  await run.run(candidates, signal);
  if (run.done > 0) {
    env.feed.notice({
      type: 'drive_changed',
      rootIds: [rootId],
      folderIds: [],
      albumIds: [],
      months: [],
      cursor: await env.latestSeq(),
    });
  }
  env.log.info('drive.metadata_done', {
    rootId,
    unread: candidates.length,
    recorded: run.done,
    cancelled: signal.aborted,
    durationMs: Math.round(performance.now() - startedAt),
  });
}

export function metadataHandler(env: MetadataEnvironment): DriveJobHandlers['metadata'] {
  return (job, signal) => readRoot(env, job.rootId, signal);
}
