import { createReadStream } from 'node:fs';
import { mkdir, rm, stat } from 'node:fs/promises';
import { posix, join } from 'node:path';
import { ApiError, type DriveItem, type EditJob, type VideoEdit } from '@smarteverything/domain';
import { background, messageOf } from '@smarteverything/logging';
import { commitContent } from '../../drive/changes';
import { locate } from '../../drive/intents';
import { checkDriveWrite } from '../../drive/quotas';
import { changeActorOf, type DriveCaller } from '../../drive/service-write-support';
import { stageBytes } from '../../drive/versions';
import { probeVideo, type VideoProbe } from '../pipeline/probe';
import type { EditDeps } from './deps';
import { EditJobs } from './jobs';
import { Lane } from './lane';
import { stemOf, videoTarget, type EditTarget, type VideoItem } from './target';
import {
  CONTAINERS,
  FALLBACK_CONTAINER,
  detectArguments,
  encodeArguments,
  lengthSeconds,
  toneMapped,
  type VideoPlan,
} from './video-args';
import { stackWithOriginal } from './stack';
import { FfmpegFailedError, runFfmpeg } from './video-run';

const STABILIZE_SHARE = 0.5;

const KNOWN_CONTAINERS = Object.values(CONTAINERS);

function containerOf(item: VideoItem): (typeof KNOWN_CONTAINERS)[number] | null {
  const extension = posix.extname(item.name).toLowerCase();
  return KNOWN_CONTAINERS.find((known) => known.extension === extension) ?? null;
}

function versionRefusal(target: EditTarget<VideoItem>): string | null {
  if (containerOf(target.item) === null) {
    return 'This video format is saved as an MP4 copy; the original stays as it is.';
  }
  return target.root.versions
    ? null
    : 'This drive keeps no earlier versions, so the edit is saved as a copy.';
}

function trimOf(edit: VideoEdit, probe: VideoProbe): VideoPlan['trim'] {
  if (edit.trim === null) return null;
  const durationMs = Math.round(probe.durationSeconds * 1000);
  if (edit.trim.startMs >= durationMs) {
    throw new ApiError('invalid_request', 'The trim starts after the video ends.');
  }
  const endMs = Math.min(edit.trim.endMs, durationMs);
  if (edit.trim.startMs === 0 && endMs === durationMs && !edit.stabilize) {
    throw new ApiError('invalid_request', 'The trim keeps the whole video.');
  }
  return { startMs: edit.trim.startMs, endMs };
}

function copyPath(deps: EditDeps, target: EditTarget<VideoItem>, extension: string): string {
  const { stem } = stemOf(target.item.name);
  const folder = posix.dirname(target.item.relPath);
  for (let attempt = 1; ; attempt += 1) {
    const tag = attempt === 1 ? ' (edited)' : ` (edited ${String(attempt)})`;
    const name = `${stem}${tag}${extension}`;
    const relPath = folder === '.' ? name : `${folder}/${name}`;
    if (deps.store.driveItems.byPath(target.root.id, relPath, null) === undefined) return relPath;
  }
}

export class VideoEditService {
  readonly jobs: EditJobs;
  private readonly lane = new Lane();

  constructor(private readonly deps: EditDeps) {
    this.jobs = new EditJobs(deps.env.now, (profileId, job) => {
      deps.store.context.notice({ type: 'photos_edit_job', profileId, job });
    });
  }

  start(caller: DriveCaller, itemId: string, edit: VideoEdit): { readonly jobId: string } {
    const target = videoTarget(this.deps, caller, itemId);
    const refusal = edit.mode === 'version' ? versionRefusal(target) : null;
    if (refusal !== null) throw new ApiError('invalid_request', refusal);
    const jobId = this.jobs.create(itemId, caller.profileId);
    background(
      this.lane.run(() => this.run(jobId, target, edit)),
      'photos.video_edit_run',
      { itemId },
    );
    return { jobId };
  }

  read(caller: DriveCaller, jobId: string): EditJob {
    return this.jobs.read(jobId, caller.profileId);
  }

  private async run(jobId: string, target: EditTarget<VideoItem>, edit: VideoEdit): Promise<void> {
    const scratch = join(this.deps.layout.tmp, 'photo-edits', jobId);
    this.jobs.running(jobId);
    try {
      const item = await this.render(jobId, target, edit, scratch);
      this.jobs.done(jobId, item.id);
      this.deps.env.log.info('photos.video_edit_done', { itemId: target.item.id, mode: edit.mode });
    } catch (cause) {
      const detail = cause instanceof FfmpegFailedError ? cause.stderr : messageOf(cause);
      const reason =
        cause instanceof FfmpegFailedError
          ? 'The video could not be processed. Its format may not allow this edit.'
          : detail === ''
            ? 'The video edit failed.'
            : detail;
      this.jobs.fail(jobId, reason);
      this.deps.env.log.warn('photos.video_edit_failed', {
        itemId: target.item.id,
        reason,
        detail,
      });
    } finally {
      await rm(scratch, { recursive: true, force: true });
    }
  }

  private async render(
    jobId: string,
    target: EditTarget<VideoItem>,
    edit: VideoEdit,
    scratch: string,
  ): Promise<DriveItem> {
    const source = await locate(target.root, target.item.relPath);
    const probe = await probeVideo(source);
    if (probe.videoCodec === null)
      throw new ApiError('invalid_request', 'The file has no video track.');
    const container = containerOf(target.item) ?? FALLBACK_CONTAINER;
    await mkdir(scratch, { recursive: true });
    const plan: VideoPlan = {
      source,
      target: join(scratch, `out${container.extension}`),
      transforms: join(scratch, 'motion.trf'),
      format: container.format,
      trim: trimOf(edit, probe),
      stabilize: edit.stabilize,
      toneMap: toneMapped(probe),
    };
    await this.encode(jobId, plan, lengthSeconds(plan, probe));
    return this.commit(target, edit, plan, container.extension);
  }

  private async encode(jobId: string, plan: VideoPlan, seconds: number): Promise<void> {
    const signal = new AbortController().signal;
    const first = plan.stabilize ? STABILIZE_SHARE : 0;
    if (plan.stabilize) {
      await runFfmpeg(
        detectArguments(plan),
        seconds,
        (done) => {
          this.jobs.progress(jobId, done * STABILIZE_SHARE);
        },
        signal,
      );
    }
    await runFfmpeg(
      encodeArguments(plan),
      seconds,
      (done) => {
        this.jobs.progress(jobId, first + done * (1 - first));
      },
      signal,
    );
  }

  private async commit(
    target: EditTarget<VideoItem>,
    edit: VideoEdit,
    plan: VideoPlan,
    extension: string,
  ): Promise<DriveItem> {
    const { deps } = this;
    const size = (await stat(plan.target)).size;
    if (size === 0) throw new Error('ffmpeg wrote an empty video.');
    await checkDriveWrite(deps.guard, {
      profileId: target.caller.profileId,
      addBytes: size,
      releasedBytes: 0,
      path: target.root.path,
    });
    const staged = await stageBytes(deps.env, target.root, createReadStream(plan.target));
    const relPath =
      edit.mode === 'version' ? target.item.relPath : copyPath(deps, target, extension);
    try {
      const written = await commitContent(deps.env, {
        root: target.root,
        staged,
        relPath,
        actor: changeActorOf(target.caller),
        ...(edit.mode === 'copy'
          ? {
              alongside: (item: DriveItem): void => {
                stackWithOriginal(deps, target.item, item);
              },
            }
          : {}),
      });
      return written.item;
    } catch (cause) {
      await deps.env.files.remove(await locate(target.root, staged.relPath));
      throw cause;
    }
  }
}
