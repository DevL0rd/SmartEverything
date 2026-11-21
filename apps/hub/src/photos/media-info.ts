import type {
  MediaInfo,
  MediaJob,
  MediaProcessing,
  MediaState,
  MediaTimeSource,
  PhotoDescription,
} from '@smarteverything/domain';
import { z } from 'zod';
import type { DriveActor } from '../drive/access';
import { DriveReadRules } from '../drive/units/read';
import { storeUnit } from '../store/host/unit';
import {
  DriveMediaJobsRepository,
  PHOTO_AI_JOB_KINDS,
  type DriveMediaJob,
  type DriveMediaJobKind,
} from '../store/repositories/drive-media-jobs';
import { DriveMediaRepository, type DriveMediaRow } from '../store/repositories/drive-media';
import type { StoredPhotoDescription } from '../store/repositories/photo-descriptions';
import { inList } from '../store/sql';
import type { HostStore } from '../store/host/host-store';
import { placeNumber } from './places-schema';

const TIME_SOURCES: Readonly<Record<DriveMediaRow['time_source'], MediaTimeSource | null>> = {
  metadata: 'exif',
  container: 'exif',
  filename: 'file',
  modified: 'file',
  manual: null,
};

const JOB_KINDS: Readonly<Record<DriveMediaJobKind, MediaJob['kind'] | null>> = {
  preview: 'preview',
  poster: 'poster',
  playable: 'playable',
  playable_source: 'playable',
  motion: 'motion',
  place: 'place',
  faces: null,
  vision: null,
  embed: null,
  pet_embed: null,
};

type Derived = 'preview' | 'poster' | 'playable';

const STATE_COUNT = z.strictObject({
  state: z.enum(['queued', 'running']),
  total: z.int().nonnegative(),
});

class MediaReasonMissingError extends Error {
  override readonly name = 'MediaReasonMissingError';

  constructor(itemId: string, derived: Derived) {
    super(`The ${derived} of ${itemId} is marked failed or unsupported without a reason.`);
  }
}

function busy(jobs: readonly DriveMediaJob[], derived: Derived): boolean {
  return jobs.some(
    (job) => JOB_KINDS[job.kind] === derived && (job.state === 'queued' || job.state === 'running'),
  );
}

function stateOf(row: DriveMediaRow, derived: Derived, jobs: readonly DriveMediaJob[]): MediaState {
  const state = row[`${derived}_state`];
  const reason = row[`${derived}_reason`];
  if (state === 'failed' || state === 'unsupported') {
    if (reason === null) throw new MediaReasonMissingError(row.item_id, derived);
    return { state, reason };
  }
  if (busy(jobs, derived)) return { state: 'processing' };
  return { state };
}

function describedBy(stored: StoredPhotoDescription | undefined): PhotoDescription | null {
  if (stored === undefined) return null;
  return stored.text === null ? null : { text: stored.text, source: stored.source };
}

function emptyInfo(
  itemId: string,
  jobs: readonly DriveMediaJob[],
  description: PhotoDescription | null,
): MediaInfo {
  const pending = (derived: Derived): MediaState =>
    busy(jobs, derived) ? { state: 'processing' } : { state: 'none' };
  return {
    itemId,
    timeSource: null,
    tzOffsetMin: null,
    motionClipId: null,
    liveId: null,
    burstId: null,
    stackId: null,
    placeId: null,
    description,
    preview: pending('preview'),
    poster: pending('poster'),
    playable: pending('playable'),
  };
}

function infoOf(
  row: DriveMediaRow,
  jobs: readonly DriveMediaJob[],
  description: PhotoDescription | null,
): MediaInfo {
  return {
    itemId: row.item_id,
    timeSource: TIME_SOURCES[row.time_source],
    tzOffsetMin: row.tz_offset_min,
    motionClipId: row.motion_clip_id,
    liveId: row.live_id,
    burstId: row.burst_id,
    stackId: row.stack_id,
    placeId: row.place_id === null ? null : placeNumber(row.place_id),
    description,
    preview: stateOf(row, 'preview', jobs),
    poster: stateOf(row, 'poster', jobs),
    playable: stateOf(row, 'playable', jobs),
  };
}

function jobOf(job: DriveMediaJob): MediaJob[] {
  const kind = JOB_KINDS[job.kind];
  if (kind === null) return [];
  return [
    {
      id: job.id,
      kind,
      itemId: job.item_id,
      rev: job.rev,
      state: job.state,
      attempts: job.attempts,
      error: job.error,
      modelVersion: job.model_version,
      queuedAt: job.queued_at,
    },
  ];
}

function mediaInfoOf(store: HostStore, itemId: string): MediaInfo {
  const jobs = new DriveMediaJobsRepository(store.context).forItem(itemId);
  const row = new DriveMediaRepository(store.context).find(itemId);
  const description = describedBy(store.photoDescriptions.find(itemId));
  return row === undefined ? emptyInfo(itemId, jobs, description) : infoOf(row, jobs, description);
}

function mediaProcessingOf(store: HostStore, rootIds: readonly string[]): MediaProcessing {
  const roots = inList('i.root_id', 'roots', rootIds);
  const counts = store.context.sql.all(
    STATE_COUNT,
    `select j.state, count(*) as total from drive_media_jobs j
       join drive_items i on i.id = j.item_id
     where j.state in ('queued', 'running') and j.kind not in (select value from json_each($aiKinds))
       and ${roots.text}
     group by j.state`,
    { ...roots.parameters, aiKinds: JSON.stringify(PHOTO_AI_JOB_KINDS) },
  );
  const visible = new Set(rootIds);
  const failed = new DriveMediaJobsRepository(store.context)
    .failures()
    .filter((job) => {
      const item = store.driveItems.find(job.item_id, null);
      return item !== undefined && visible.has(item.rootId);
    })
    .flatMap(jobOf);
  const total = (state: 'queued' | 'running'): number =>
    counts.find((count) => count.state === state)?.total ?? 0;
  return { queued: total('queued'), running: total('running'), failed };
}

export const PHOTO_MEDIA_INFO_UNIT = storeUnit(
  (store, input: { readonly actor: DriveActor; readonly itemId: string }) => {
    new DriveReadRules(store).readItem(input.actor, input.itemId);
    return mediaInfoOf(store, input.itemId);
  },
);

export const PHOTO_MEDIA_PROCESSING_UNIT = storeUnit(
  (store, input: { readonly actor: DriveActor }) =>
    mediaProcessingOf(
      store,
      new DriveReadRules(store).listRoots(input.actor).map((root) => root.id),
    ),
);
