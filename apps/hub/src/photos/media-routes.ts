import {
  PHOTOS_ENDPOINTS,
  type MediaInfo,
  type MediaJob,
  type MediaProcessing,
  type MediaState,
  type MediaTimeSource,
} from '@smarteverything/domain';
import { z } from 'zod';
import type { DriveActor, DriveReadService } from '../drive/service-read';
import { profileIdOf, roleOfCaller, type Caller } from '../server/auth';
import { refusing } from '../server/handlers/drive-errors';
import { bound, type Bound } from '../server/router';
import type { StoreContext } from '../store/context';
import {
  DriveMediaJobsRepository,
  type DriveMediaJob,
  type DriveMediaJobKind,
} from '../store/repositories/drive-media-jobs';
import { DriveMediaRepository, type DriveMediaRow } from '../store/repositories/drive-media';
import { inList } from '../store/sql';
import type { Store } from '../store/store';
import { placeNumber } from './places-routes';

const E = PHOTOS_ENDPOINTS;

const TIME_SOURCES: Readonly<Record<DriveMediaRow['time_source'], MediaTimeSource | null>> = {
  metadata: 'exif',
  container: 'exif',
  filename: 'file',
  modified: 'file',
  manual: null,
};

const JOB_KINDS: Readonly<Record<DriveMediaJobKind, MediaJob['kind']>> = {
  preview: 'preview',
  poster: 'poster',
  playable: 'playable',
  playable_source: 'playable',
  motion: 'motion',
  place: 'place',
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

function emptyInfo(itemId: string, jobs: readonly DriveMediaJob[]): MediaInfo {
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
    preview: pending('preview'),
    poster: pending('poster'),
    playable: pending('playable'),
  };
}

function infoOf(row: DriveMediaRow, jobs: readonly DriveMediaJob[]): MediaInfo {
  return {
    itemId: row.item_id,
    timeSource: TIME_SOURCES[row.time_source],
    tzOffsetMin: row.tz_offset_min,
    motionClipId: row.motion_clip_id,
    liveId: row.live_id,
    burstId: row.burst_id,
    stackId: row.stack_id,
    placeId: row.place_id === null ? null : placeNumber(row.place_id),
    preview: stateOf(row, 'preview', jobs),
    poster: stateOf(row, 'poster', jobs),
    playable: stateOf(row, 'playable', jobs),
  };
}

function jobOf(job: DriveMediaJob): MediaJob {
  return {
    id: job.id,
    kind: JOB_KINDS[job.kind],
    itemId: job.item_id,
    rev: job.rev,
    state: job.state,
    attempts: job.attempts,
    error: job.error,
    modelVersion: job.model_version,
    queuedAt: job.queued_at,
  };
}

export class PhotoMedia {
  private readonly media: DriveMediaRepository;
  private readonly jobs: DriveMediaJobsRepository;

  constructor(
    private readonly context: StoreContext,
    private readonly read: DriveReadService,
    private readonly store: Pick<Store, 'driveItems'>,
  ) {
    this.media = new DriveMediaRepository(context);
    this.jobs = new DriveMediaJobsRepository(context);
  }

  info(actor: DriveActor, itemId: string): MediaInfo {
    this.read.readItem(actor, itemId);
    const jobs = this.jobs.forItem(itemId);
    const row = this.media.find(itemId);
    return row === undefined ? emptyInfo(itemId, jobs) : infoOf(row, jobs);
  }

  processing(actor: DriveActor): MediaProcessing {
    const rootIds = this.read.listRoots(actor).map((root) => root.id);
    const roots = inList('i.root_id', 'roots', rootIds);
    const counts = this.context.sql.all(
      STATE_COUNT,
      `select j.state, count(*) as total from drive_media_jobs j
         join drive_items i on i.id = j.item_id
       where j.state in ('queued', 'running') and ${roots.text}
       group by j.state`,
      roots.parameters,
    );
    const visible = new Set(rootIds);
    const failed = this.jobs
      .failures()
      .filter((job) => {
        const item = this.store.driveItems.find(job.item_id);
        return item !== undefined && visible.has(item.rootId);
      })
      .map(jobOf);
    const total = (state: 'queued' | 'running'): number =>
      counts.find((count) => count.state === state)?.total ?? 0;
    return { queued: total('queued'), running: total('running'), failed };
  }
}

export interface PhotoMediaRoutes {
  readonly readMediaInfo: Bound<typeof E.readMediaInfo>;
  readonly readMediaProcessing: Bound<typeof E.readMediaProcessing>;
}

function actorOf(store: Store, caller: Caller): DriveActor {
  return { profileId: profileIdOf(store, caller), owner: roleOfCaller(caller) === 'owner' };
}

export function photoMediaRoutes(store: Store, media: PhotoMedia): PhotoMediaRoutes {
  return {
    readMediaInfo: bound(E.readMediaInfo, ({ params, caller }) =>
      refusing(() => media.info(actorOf(store, caller), params.itemId)),
    ),
    readMediaProcessing: bound(E.readMediaProcessing, ({ caller }) =>
      media.processing(actorOf(store, caller)),
    ),
  };
}
