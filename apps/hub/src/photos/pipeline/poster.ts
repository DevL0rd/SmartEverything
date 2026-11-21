import { execFile } from 'node:child_process';
import { mkdir, rm, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import type { DriveItem, DriveThumb } from '@smarteverything/domain';
import { messageOf, type Logger } from '@smarteverything/logging';
import { fsCode } from '../../fs-code';
import { ffmpegPath, vaapiDevice } from '../../media/ffmpeg-path';
import type { DriveMediaPatch } from '../../store/repositories/drive-media';
import type { DriveMediaJob } from '../../store/repositories/drive-media-jobs';
import { DERIVED_LONG_EDGE, derivedDirectory, pruneDerived, writeDerived } from './derived-paths';
import type { JobHandler } from './jobs';
import { probeVideo, type VideoProbe } from './probe';
import { renderDerived, targetOf, type DerivedOutcome, type PreviewEnvironment } from './preview';

const run = promisify(execFile);

const POSTER_SECONDS = 1;

const FRAME_QUALITY = '2';

const TONE_MAP =
  'zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=tonemap=mobius:desat=0,zscale=t=bt709:m=bt709:r=tv,format=yuv420p';

export type PosterEnvironment = Omit<PreviewEnvironment, 'decoders'>;

export function posterSeconds(durationSeconds: number): number {
  return Math.min(POSTER_SECONDS, durationSeconds / 2);
}

export function posterArguments(
  source: string,
  probe: Pick<VideoProbe, 'durationSeconds' | 'transfer'>,
  target: string,
): readonly string[] {
  return [
    '-y',
    '-v',
    'error',
    '-ss',
    posterSeconds(probe.durationSeconds).toFixed(3),
    '-i',
    source,
    '-frames:v',
    '1',
    ...(probe.transfer === null ? [] : ['-vf', TONE_MAP]),
    '-q:v',
    FRAME_QUALITY,
    '-f',
    'image2',
    target,
  ];
}

export function posterVaapiArguments(
  source: string,
  probe: Pick<VideoProbe, 'durationSeconds'>,
  target: string,
  device: string,
): readonly string[] {
  return [
    '-y',
    '-v',
    'error',
    ...['-init_hw_device', `vaapi=va:${device}`, '-hwaccel', 'vaapi', '-hwaccel_device', 'va'],
    ...['-hwaccel_output_format', 'vaapi'],
    '-ss',
    posterSeconds(probe.durationSeconds).toFixed(3),
    '-i',
    source,
    '-frames:v',
    '1',
    '-vf',
    `scale_vaapi=w=${String(DERIVED_LONG_EDGE.preview)}:h=${String(DERIVED_LONG_EDGE.preview)}:force_original_aspect_ratio=decrease:format=nv12,hwdownload,format=nv12`,
    '-q:v',
    FRAME_QUALITY,
    '-f',
    'image2',
    target,
  ];
}

async function frameBytes(target: string): Promise<number> {
  try {
    return (await stat(target)).size;
  } catch (cause) {
    if (fsCode(cause) === 'ENOENT') return 0;
    throw cause;
  }
}

export async function extractPoster(
  source: string,
  probe: Pick<VideoProbe, 'durationSeconds' | 'transfer'>,
  target: string,
  { signal, log }: { readonly signal: AbortSignal; readonly log: Logger },
): Promise<void> {
  const device = vaapiDevice();
  const gpu = device !== null && probe.transfer === null;
  if (gpu) {
    try {
      await run(ffmpegPath(), [...posterVaapiArguments(source, probe, target, device)], {
        signal,
      });
    } catch (cause) {
      if (signal.aborted) throw cause;
      log.info('photos.poster_decoded_on_cpu', { reason: messageOf(cause) });
    }
  }
  if (!gpu || (await frameBytes(target)) === 0) {
    await run(ffmpegPath(), [...posterArguments(source, probe, target)], { signal });
  }
  if ((await frameBytes(target)) === 0) {
    throw new Error(
      `ffmpeg wrote no frame at ${posterSeconds(probe.durationSeconds).toFixed(3)} s of a ${probe.durationSeconds.toFixed(3)} s clip`,
    );
  }
}

function mediaPatchOf(outcome: DerivedOutcome): DriveMediaPatch {
  return outcome.state === 'ready'
    ? {
        preview_state: 'ready',
        preview_reason: null,
        poster_state: 'ready',
        poster_reason: null,
      }
    : {
        preview_state: outcome.state,
        preview_reason: outcome.reason,
        poster_state: outcome.state,
        poster_reason: outcome.reason,
      };
}

function thumbOf(outcome: DerivedOutcome): DriveThumb {
  return outcome.state === 'ready'
    ? { state: 'ready' }
    : { state: outcome.state, reason: outcome.reason };
}

export class PosterHandler implements JobHandler {
  readonly resource = 'image';

  constructor(private readonly env: PosterEnvironment) {}

  async run(job: DriveMediaJob, signal: AbortSignal): Promise<void> {
    const item = await this.current(job);
    if (item === undefined) return;
    const path = await this.env.locate(item);
    const probe = await probeVideo(path);
    if (probe.videoCodec === null) {
      await this.record(job, { state: 'unsupported', reason: 'the file has no video track' });
      return;
    }
    const frame = join(
      derivedDirectory(this.env.layout, job.item_id),
      `${job.item_id}-${String(job.rev)}-frame.partial`,
    );
    await mkdir(dirname(frame), { recursive: true });
    try {
      await extractPoster(path, probe, frame, { signal, log: this.env.log });
      const rendered = await renderDerived({ kind: 'encoded', path: frame });
      const key = { itemId: job.item_id, rev: job.rev };
      await writeDerived(this.env.layout, { ...key, size: 'preview' }, rendered.preview);
      await writeDerived(this.env.layout, { ...key, size: 'thumb' }, rendered.thumb);
      if (await this.record(job, { state: 'ready' })) {
        await pruneDerived(this.env.layout, job.item_id, job.rev);
      }
    } finally {
      await rm(frame, { force: true });
    }
  }

  async fail(job: DriveMediaJob, cause: unknown): Promise<void> {
    await this.record(job, { state: 'failed', reason: messageOf(cause) });
  }

  private async current(
    job: DriveMediaJob,
  ): Promise<Extract<DriveItem, { readonly kind: 'video' }> | undefined> {
    const item = await this.env.derived.current(targetOf(job, 'video'));
    if (item?.kind !== 'video') {
      this.env.log.debug('photos.poster_skipped', { itemId: job.item_id, rev: job.rev });
      return undefined;
    }
    return item;
  }

  private async record(job: DriveMediaJob, outcome: DerivedOutcome): Promise<boolean> {
    const recorded = await this.env.derived.record({
      target: targetOf(job, 'video'),
      thumb: thumbOf(outcome),
      patch: mediaPatchOf(outcome),
    });
    if (!recorded)
      this.env.log.debug('photos.poster_skipped', { itemId: job.item_id, rev: job.rev });
    return recorded;
  }
}
