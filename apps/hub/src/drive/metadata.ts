import type { DriveItem } from '@smarteverything/domain';
import type { StoredDrive } from '../store/repositories/drive-roots';
import type { Logger } from '@smarteverything/logging';
import type { Store } from '../store/store';
import type { DriveMediaRepository } from '../store/repositories/drive-media';
import { modifiedIso } from './hasher';
import type { DriveJobHandlers } from './jobs';
import { MetadataWorker } from './metadata-client';
import type { MetadataOutcome } from './metadata-protocol';
import type { MediaFacts, Moment } from './metadata-read';
import { inZone, isZoneless, waitsForDevice, type ZonePicker } from './metadata-zone';
import { overrideFacts } from '../photos/organise/override';
import { readDriveSettings } from './settings';
import type { RootAvailability } from './root-marker';

type MediaItem = Extract<DriveItem, { readonly kind: 'image' | 'video' | 'audio' }>;

export interface MetadataEnvironment {
  readonly store: Pick<
    Store,
    | 'driveRoots'
    | 'driveItems'
    | 'settingsKv'
    | 'write'
    | 'photoMetaOverrides'
    | 'photoDescriptions'
    | 'feed'
    | 'driveFeed'
  >;
  readonly media: Pick<DriveMediaRepository, 'find' | 'save' | 'update'>;
  readonly availability: (root: StoredDrive) => Promise<RootAvailability>;
  readonly zones: ZonePicker;
  readonly workerScript: string;
  readonly log: Logger;
}

interface Candidate {
  readonly id: string;
  readonly relPath: string;
  readonly dev: string;
  readonly ino: string;
}

export function collectUnread(
  items: Pick<MetadataEnvironment['store']['driveItems'], 'lookups'>,
  rootId: string,
): readonly Candidate[] {
  return items.lookups
    .unreadMedia(rootId)
    .map(({ id, relPath, dev, ino }): Candidate => ({ id, relPath, dev, ino }));
}

export function collectPending(
  store: Pick<MetadataEnvironment['store'], 'driveItems' | 'photoDescriptions'>,
  rootId: string,
): readonly Candidate[] {
  const unread = collectUnread(store.driveItems, rootId);
  const known = new Set(unread.map((candidate) => candidate.id));
  const described = store.photoDescriptions
    .pending(rootId)
    .filter((candidate) => !known.has(candidate.id));
  return [...unread, ...described];
}

export function isMedia(item: DriveItem): item is MediaItem {
  return item.kind === 'image' || item.kind === 'video' || item.kind === 'audio';
}

export function itemWith(item: MediaItem, facts: MediaFacts): MediaItem {
  const takenAt = facts.takenAt?.iso ?? item.modifiedAt;
  switch (item.kind) {
    case 'image':
      return { ...item, takenAt, ...visualOf(facts) };
    case 'video':
      return { ...item, takenAt, ...visualOf(facts), durationMs: facts.durationMs };
    case 'audio':
      return { ...item, takenAt, durationMs: facts.durationMs };
  }
}

function visualOf(
  facts: MediaFacts,
): Pick<MediaFacts, 'width' | 'height' | 'orientation' | 'camera' | 'exposure' | 'place'> {
  return {
    width: facts.width,
    height: facts.height,
    orientation: facts.orientation,
    camera: facts.camera,
    exposure: facts.exposure,
    place: facts.place,
  };
}

interface Reading {
  readonly facts: MediaFacts;
  readonly bytes: number;
  readonly modifiedMs: number;
}

function mediaRowFor(
  itemId: string,
  moment: Pick<Moment, 'offsetMin'> & { readonly source: Moment['source'] | 'manual' },
): Parameters<MetadataEnvironment['media']['save']>[0] {
  return {
    item_id: itemId,
    time_source: moment.source,
    tz_offset_min: moment.offsetMin,
    preview_state: 'none',
    preview_reason: null,
    poster_state: 'none',
    poster_reason: null,
    playable_state: 'none',
    playable_reason: null,
    motion_clip_id: null,
    live_id: null,
    burst_id: null,
    stem_key: null,
    stack_id: null,
    place_id: null,
  };
}

class MetadataRun {
  private worker: MetadataWorker | null = null;
  private recorded = 0;
  private readonly waiting: { readonly candidate: Candidate; readonly reading: Reading }[] = [];

  constructor(
    private readonly env: MetadataEnvironment,
    private readonly root: StoredDrive,
  ) {}

  get done(): number {
    return this.recorded;
  }

  async run(candidates: readonly Candidate[], signal: AbortSignal): Promise<void> {
    try {
      for (const candidate of candidates) {
        if (signal.aborted) return;
        await this.one(candidate);
      }
      for (const { candidate, reading } of this.waiting) {
        if (signal.aborted) return;
        this.settle(candidate, reading);
      }
    } finally {
      await this.worker?.close();
    }
  }

  private started(): MetadataWorker {
    this.worker ??= new MetadataWorker(this.env.workerScript);
    return this.worker;
  }

  private async one(candidate: Candidate): Promise<void> {
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
    this.settle(candidate, reading);
  }

  private readingOf(candidate: Candidate, outcome: MetadataOutcome): Reading | null {
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

  private settle(candidate: Candidate, reading: Reading): void {
    if (this.record(candidate, reading)) this.recorded += 1;
  }

  private record(candidate: Candidate, reading: Reading): boolean {
    return this.env.store.write(() => {
      const current = this.env.store.driveItems.find(candidate.id, null);
      if (
        current === undefined ||
        !isMedia(current) ||
        current.bytes !== reading.bytes ||
        current.modifiedAt !== modifiedIso(reading.modifiedMs)
      ) {
        return false;
      }
      this.env.store.photoDescriptions.fromFile(current.id, reading.facts.description);
      if (current.takenAt !== null) return true;
      const identity = this.env.store.driveItems.identityOf(current.id);
      if (identity === null) return false;
      const override = this.env.store.photoMetaOverrides.find(candidate.id);
      const facts = overrideFacts(this.zoned(candidate, reading.facts), override);
      this.env.zones.keep(current.id, reading.facts);
      const written = this.env.store.driveItems.write({
        item: itemWith(current, facts),
        identity,
      }).item;
      if (written.kind !== 'audio') {
        this.keepTime(
          written.id,
          facts.takenAt,
          override !== undefined && override.takenAt !== null,
        );
      }
      return true;
    });
  }

  private zoned(candidate: Candidate, facts: MediaFacts): MediaFacts {
    if (!isZoneless(facts.takenAt)) return facts;
    const local = this.env.zones.pick(candidate.id, facts);
    const takenAt = inZone(facts.takenAt, local);
    this.env.log.info('drive.metadata_zone', {
      rootId: this.root.id,
      relPath: candidate.relPath,
      zone: local.zone,
      source: local.source,
    });
    return { ...facts, takenAt };
  }

  private keepTime(itemId: string, moment: Moment | null, edited: boolean): void {
    const base = moment ?? { offsetMin: null, source: 'modified' as const };
    const time = edited ? { ...base, source: 'manual' as const } : base;
    if (this.env.media.find(itemId) === undefined) {
      this.env.media.save(mediaRowFor(itemId, time));
      return;
    }
    this.env.media.update(itemId, { time_source: time.source, tz_offset_min: time.offsetMin });
  }
}

async function readRoot(
  env: MetadataEnvironment,
  rootId: string,
  signal: AbortSignal,
): Promise<void> {
  const root = env.store.driveRoots.find(rootId);
  if (root === undefined) {
    env.log.warn('drive.metadata_skipped_root', { rootId, reason: 'no such drive' });
    return;
  }
  if (readDriveSettings(env.store).indexingPaused) {
    env.log.info('drive.metadata_paused', { rootId });
    return;
  }
  if ((await env.availability(root)) !== 'online') return;
  const candidates = collectPending(env.store, rootId);
  const run = new MetadataRun(env, root);
  const startedAt = performance.now();
  await run.run(candidates, signal);
  if (run.done > 0) {
    env.store.feed.notice({
      type: 'drive_changed',
      rootIds: [rootId],
      folderIds: [],
      albumIds: [],
      months: [],
      cursor: env.store.driveFeed.latestSeq(),
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
