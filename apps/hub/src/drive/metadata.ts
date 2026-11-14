import type { FileHandle } from 'node:fs/promises';
import type { DriveItem } from '@smarteverything/domain';
import type { StoredDrive } from '../store/repositories/drive-roots';
import { messageOf, type Logger } from '@smarteverything/logging';
import { fsCode } from '../fs-code';
import type { Store } from '../store/store';
import type { DriveMediaRepository } from '../store/repositories/drive-media';
import { modifiedIso } from './hasher';
import type { DriveJobHandlers } from './jobs';
import {
  NOTHING,
  readStill,
  readTimed,
  routeOf,
  TimedProbe,
  type MediaFacts,
  type Moment,
} from './metadata-read';
import { DrivePathError, openResolved, resolveInRoot } from './paths';
import { readDriveSettings } from './settings';
import type { RootAvailability } from './root-marker';

type MediaItem = Extract<DriveItem, { readonly kind: 'image' | 'video' | 'audio' }>;

const WINDOW_ROWS = 1000;

export interface MetadataEnvironment {
  readonly store: Pick<Store, 'driveRoots' | 'driveItems' | 'settingsKv' | 'write'>;
  readonly media: Pick<DriveMediaRepository, 'find' | 'save' | 'update'>;
  readonly availability: (root: StoredDrive) => Promise<RootAvailability>;
  readonly log: Logger;
}

interface Candidate {
  readonly id: string;
  readonly relPath: string;
  readonly dev: string;
  readonly ino: string;
}

export function collectUnread(
  items: Pick<MetadataEnvironment['store']['driveItems'], 'children'>,
  rootId: string,
): readonly Candidate[] {
  const candidates: Candidate[] = [];
  const pending: (string | null)[] = [null];
  for (let parent = pending.pop(); parent !== undefined; parent = pending.pop()) {
    let after: string | null = null;
    do {
      const window = items.children({
        rootId,
        parentId: parent,
        after,
        limit: WINDOW_ROWS,
        viewer: null,
      });
      for (const { item, identity } of window.entries) {
        if (item.kind === 'folder') pending.push(item.id);
        else if (identity !== null && isMedia(item) && item.takenAt === null) {
          candidates.push({
            id: item.id,
            relPath: item.relPath,
            dev: identity.dev,
            ino: identity.ino,
          });
        }
      }
      after = window.next;
    } while (after !== null);
  }
  return candidates;
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

const HEAD_BYTES = 12;

function mediaRowFor(
  itemId: string,
  moment: Pick<Moment, 'offsetMin' | 'source'>,
): Parameters<MetadataEnvironment['media']['save']>[0] {
  return {
    item_id: itemId,
    time_source: moment.source,
    tz_offset_min: moment.offsetMin,
    thumbhash: null,
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
  private readonly probe = new TimedProbe();
  private recorded = 0;

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
    } finally {
      this.probe.close();
    }
  }

  private async one(candidate: Candidate): Promise<void> {
    let reading: Reading | null;
    try {
      reading = await this.read(candidate);
    } catch (cause) {
      this.env.log.warn('drive.metadata_skipped', {
        rootId: this.root.id,
        relPath: candidate.relPath,
        reason:
          cause instanceof DrivePathError ? cause.failure : (fsCode(cause) ?? messageOf(cause)),
      });
      return;
    }
    if (reading !== null && this.record(candidate, reading)) this.recorded += 1;
  }

  private async read(candidate: Candidate): Promise<Reading | null> {
    const handle = await openResolved(
      await resolveInRoot(this.root.path, candidate.relPath),
      'read',
    );
    try {
      const before = await handle.stat({ bigint: true });
      if (
        !before.isFile() ||
        before.dev.toString() !== candidate.dev ||
        before.ino.toString() !== candidate.ino
      ) {
        return this.changed(candidate, 'identity');
      }
      const bytes = Number(before.size);
      const facts = await this.extract(handle, bytes, candidate);
      const after = await handle.stat({ bigint: true });
      if (after.size !== before.size || after.mtimeNs !== before.mtimeNs) {
        return this.changed(candidate, 'modified');
      }
      return { facts, bytes, modifiedMs: Number(before.mtimeMs) };
    } finally {
      await handle.close();
    }
  }

  private changed(candidate: Candidate, reason: string): null {
    this.env.log.info('drive.metadata_changed', {
      rootId: this.root.id,
      relPath: candidate.relPath,
      reason,
    });
    return null;
  }

  private async extract(
    handle: FileHandle,
    bytes: number,
    candidate: Candidate,
  ): Promise<MediaFacts> {
    const head = Buffer.alloc(HEAD_BYTES);
    const { bytesRead } = await handle.read(head, 0, HEAD_BYTES, 0);
    try {
      return routeOf(head.subarray(0, bytesRead)) === 'still'
        ? readStill(await handle.readFile())
        : readTimed(await this.probe.analyze(handle, bytes));
    } catch (cause) {
      if (fsCode(cause) !== undefined) throw cause;
      this.env.log.warn('drive.metadata_unreadable', {
        rootId: this.root.id,
        relPath: candidate.relPath,
        reason: messageOf(cause),
      });
      return NOTHING;
    }
  }

  private record(candidate: Candidate, reading: Reading): boolean {
    return this.env.store.write(() => {
      const current = this.env.store.driveItems.find(candidate.id, null);
      if (
        current === undefined ||
        !isMedia(current) ||
        current.takenAt !== null ||
        current.bytes !== reading.bytes ||
        current.modifiedAt !== modifiedIso(reading.modifiedMs)
      ) {
        return false;
      }
      const identity = this.env.store.driveItems.identityOf(current.id);
      if (identity === null) return false;
      const written = this.env.store.driveItems.write({
        item: itemWith(current, reading.facts),
        identity,
      }).item;
      if (written.kind !== 'audio') this.keepTime(written.id, reading.facts.takenAt);
      return true;
    });
  }

  private keepTime(itemId: string, moment: Moment | null): void {
    const time = moment ?? { offsetMin: null, source: 'modified' as const };
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
  const candidates = collectUnread(env.store.driveItems, rootId);
  const run = new MetadataRun(env, root);
  const startedAt = performance.now();
  await run.run(candidates, signal);
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
