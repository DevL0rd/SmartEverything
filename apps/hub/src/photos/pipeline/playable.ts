import { spawn } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { mkdir, rename, rm, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline';
import type { DriveItem } from '@smarteverything/domain';
import { messageOf, type Logger } from '@smarteverything/logging';
import { fsCode } from '../../fs-code';
import { ffmpegPath } from '../../media/ffmpeg-path';
import type { ByteSource } from '../../server/file-serve';
import type { DriveItemsRepository } from '../../store/repositories/drive-items';
import type { DriveMediaRepository, DriveMediaRow } from '../../store/repositories/drive-media';
import type {
  DriveMediaJob,
  DriveMediaJobRequest,
  DriveMediaJobsRepository,
} from '../../store/repositories/drive-media-jobs';
import type { Store } from '../../store/store';
import { derivedDirectory, pruneDerived, type DerivedLayout } from './derived-paths';
import type { JobHandler } from './jobs';
import { probeVideo, type VideoProbe } from './probe';

export const PLAYABLE_MIME = 'video/mp4';

export const TONE_MAP =
  'zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=tonemap=mobius:desat=0,zscale=t=bt709:m=bt709:r=tv,format=yuv420p';

const FULL_HD = 1080;

const MP4_FAMILY_CONTAINER = 'MPEG-4';

const QUICKTIME_MIME = 'video/quicktime';

const SDR_BIT_DEPTH = 8;

const QUARTER_TURNS = [90, 270];

const MICROSECONDS = 1_000_000;

const OUT_TIME = /^out_time_us=(\d+)$/u;

const COPY_NAMES = { full: 'playable', fullHd: 'playable-1080' } as const;

const BT709_TAGS = ['-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709'];

const X264 = ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p'];

export type PlayablePlan =
  | { readonly mode: 'original' }
  | { readonly mode: 'remux' }
  | { readonly mode: 'audio' }
  | { readonly mode: 'transcode'; readonly toneMap: boolean };

export type PlayableCopy = keyof typeof COPY_NAMES;

export type PlayableVariant = 'primary' | 'source';

export interface PlayableInput {
  readonly source: string;
  readonly plan: PlayablePlan;
  readonly probe: Pick<VideoProbe, 'width' | 'height' | 'rotation'>;
  readonly copy: PlayableCopy;
}

export type PlayableVideo = Extract<DriveItem, { readonly kind: 'video' }>;

export function planPlayable(
  probe: Pick<
    VideoProbe,
    'container' | 'videoCodec' | 'bitDepth' | 'transfer' | 'audioCodec' | 'streamable'
  >,
  mime: string,
): PlayablePlan {
  const copyable =
    probe.container === MP4_FAMILY_CONTAINER &&
    probe.videoCodec === 'AVC' &&
    probe.bitDepth === SDR_BIT_DEPTH &&
    probe.transfer === null;
  if (!copyable) return { mode: 'transcode', toneMap: probe.transfer !== null };
  if (probe.audioCodec !== null && probe.audioCodec !== 'AAC') return { mode: 'audio' };
  return mime === QUICKTIME_MIME || !probe.streamable ? { mode: 'remux' } : { mode: 'original' };
}

interface Edges {
  readonly width: number;
  readonly height: number;
}

function displayEdges(probe: Pick<VideoProbe, 'width' | 'height' | 'rotation'>): Edges | null {
  if (probe.width === null || probe.height === null) return null;
  return QUARTER_TURNS.includes(probe.rotation)
    ? { width: probe.height, height: probe.width }
    : { width: probe.width, height: probe.height };
}

export function exceedsFullHd(probe: Pick<VideoProbe, 'width' | 'height' | 'rotation'>): boolean {
  const edges = displayEdges(probe);
  return edges !== null && Math.min(edges.width, edges.height) > FULL_HD;
}

function evenEdge(value: number): number {
  return Math.max(2, Math.round(value / 2) * 2);
}

function fullHdSize(edges: Edges): Edges {
  const scale = FULL_HD / Math.min(edges.width, edges.height);
  return edges.width >= edges.height
    ? { width: evenEdge(edges.width * scale), height: FULL_HD }
    : { width: FULL_HD, height: evenEdge(edges.height * scale) };
}

function videoFilters(
  probe: Pick<VideoProbe, 'width' | 'height' | 'rotation'>,
  toneMap: boolean,
  copy: PlayableCopy,
): string {
  const edges = displayEdges(probe);
  const smaller = copy === 'fullHd' && edges !== null;
  const size = smaller ? fullHdSize(edges) : null;
  const scale =
    size === null
      ? []
      : [
          toneMap
            ? `zscale=w=${String(size.width)}:h=${String(size.height)}:f=bicubic`
            : `scale=${String(size.width)}:${String(size.height)}`,
        ];
  return [...scale, ...(toneMap ? [TONE_MAP] : [])].join(',');
}

function codecArguments(
  plan: PlayablePlan,
  probe: Pick<VideoProbe, 'width' | 'height' | 'rotation'>,
  copy: PlayableCopy,
): readonly string[] {
  if (plan.mode === 'remux') return ['-c', 'copy'];
  if (plan.mode === 'audio') return ['-c:v', 'copy', '-c:a', 'aac'];
  if (plan.mode === 'original') throw new Error('an original that plays as it is has no copy');
  const filters = videoFilters(probe, plan.toneMap, copy);
  return [
    ...(filters === '' ? [] : ['-vf', filters]),
    ...X264,
    ...(plan.toneMap ? BT709_TAGS : []),
    '-c:a',
    'aac',
  ];
}

export function playableArguments(input: PlayableInput, target: string): readonly string[] {
  return [
    '-y',
    '-v',
    'error',
    '-nostats',
    '-progress',
    'pipe:1',
    '-i',
    input.source,
    '-map',
    '0:v:0',
    '-map',
    '0:a:0?',
    ...codecArguments(input.plan, input.probe, input.copy),
    '-movflags',
    '+faststart',
    '-f',
    'mp4',
    target,
  ];
}

export function progressOf(line: string, durationSeconds: number): number | undefined {
  const match = OUT_TIME.exec(line);
  if (match === null || durationSeconds <= 0) return undefined;
  return Math.min(1, Number(match[1]) / MICROSECONDS / durationSeconds);
}

export function playableCopyPath(
  layout: DerivedLayout,
  itemId: string,
  rev: number,
  copy: PlayableCopy,
): string {
  return join(derivedDirectory(layout, itemId), `${itemId}-${String(rev)}-${COPY_NAMES[copy]}.mp4`);
}

function runFfmpeg(
  args: readonly string[],
  durationSeconds: number,
  onProgress: (progress: number) => void,
  signal: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath(), [...args], { signal, stdio: ['ignore', 'pipe', 'pipe'] });
    let errors = '';
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => {
      errors += chunk;
    });
    createInterface({ input: child.stdout }).on('line', (line) => {
      const progress = progressOf(line, durationSeconds);
      if (progress !== undefined) onProgress(progress);
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited with ${String(code)}: ${errors.trim()}`));
    });
  });
}

export interface PlayableConversion extends PlayableInput {
  readonly probe: VideoProbe;
  readonly target: string;
  readonly onProgress: (progress: number) => void;
}

export async function convertPlayable(
  conversion: PlayableConversion,
  signal: AbortSignal,
): Promise<void> {
  const staged = `${conversion.target}.${String(process.pid)}.partial`;
  await mkdir(dirname(conversion.target), { recursive: true });
  try {
    await runFfmpeg(
      playableArguments(conversion, staged),
      conversion.probe.durationSeconds,
      conversion.onProgress,
      signal,
    );
    if ((await stat(staged)).size === 0) throw new Error('ffmpeg wrote an empty playable copy');
    await rename(staged, conversion.target);
  } catch (cause) {
    await rm(staged, { force: true });
    throw cause;
  }
}

export interface PlayableEnvironment {
  readonly store: Pick<Store, 'write'> & {
    readonly driveItems: Pick<DriveItemsRepository, 'find'>;
    readonly driveMedia: Pick<DriveMediaRepository, 'find' | 'update'>;
  };
  readonly jobs: Pick<DriveMediaJobsRepository, 'report'>;
  readonly request: (request: DriveMediaJobRequest) => DriveMediaJob;
  readonly locate: (item: DriveItem) => Promise<string>;
  readonly layout: DerivedLayout;
  readonly log: Logger;
}

type ConversionSource = Pick<PlayableConversion, 'source' | 'plan' | 'probe'>;

type PlayableOutcome =
  | { readonly state: 'ready' }
  | { readonly state: 'failed' | 'unsupported'; readonly reason: string };

export const PLAYABLE_KINDS = { primary: 'playable', source: 'playable_source' } as const;

export class PlayableHandler implements JobHandler {
  readonly resource = 'cpu';

  constructor(
    private readonly env: PlayableEnvironment,
    private readonly variant: PlayableVariant,
  ) {}

  async run(job: DriveMediaJob, signal: AbortSignal): Promise<void> {
    const item = this.current(job);
    if (item === undefined) return;
    const source = await this.env.locate(item);
    const probe = await probeVideo(source);
    if (probe.videoCodec === null) {
      this.record(job, { state: 'unsupported', reason: 'the file has no video track' });
      return;
    }
    const plan = planPlayable(probe, item.mime);
    if (this.variant === 'source') await this.runSource(job, { source, plan, probe }, signal);
    else await this.runPrimary(job, { source, plan, probe }, signal);
  }

  fail(job: DriveMediaJob, cause: unknown): void {
    if (this.variant === 'primary') this.record(job, { state: 'failed', reason: messageOf(cause) });
  }

  private async runPrimary(
    job: DriveMediaJob,
    input: ConversionSource,
    signal: AbortSignal,
  ): Promise<void> {
    if (input.plan.mode !== 'original') {
      const smaller = input.plan.mode === 'transcode' && exceedsFullHd(input.probe);
      await this.convert(job, input, smaller ? 'fullHd' : 'full', signal);
      if (smaller) {
        this.env.request({ kind: PLAYABLE_KINDS.source, itemId: job.item_id, rev: job.rev });
      }
    }
    if (this.record(job, { state: 'ready' })) {
      await pruneDerived(this.env.layout, job.item_id, job.rev);
    }
  }

  private async runSource(
    job: DriveMediaJob,
    input: ConversionSource,
    signal: AbortSignal,
  ): Promise<void> {
    if (input.plan.mode !== 'transcode' || !exceedsFullHd(input.probe)) return;
    await this.convert(job, input, 'full', signal);
  }

  private async convert(
    job: DriveMediaJob,
    input: ConversionSource,
    copy: PlayableCopy,
    signal: AbortSignal,
  ): Promise<void> {
    await convertPlayable(
      {
        ...input,
        copy,
        target: playableCopyPath(this.env.layout, job.item_id, job.rev, copy),
        onProgress: (progress) => {
          this.env.jobs.report(job.id, progress);
        },
      },
      signal,
    );
  }

  private current(job: DriveMediaJob): PlayableVideo | undefined {
    const item = this.env.store.driveItems.find(job.item_id);
    if (
      item?.kind !== 'video' ||
      item.rev !== job.rev ||
      this.env.store.driveMedia.find(item.id) === undefined
    ) {
      this.env.log.debug('photos.playable_skipped', { itemId: job.item_id, rev: job.rev });
      return undefined;
    }
    return item;
  }

  private record(job: DriveMediaJob, outcome: PlayableOutcome): boolean {
    return this.env.store.write(() => {
      if (this.current(job) === undefined) return false;
      this.env.store.driveMedia.update(
        job.item_id,
        outcome.state === 'ready'
          ? { playable_state: 'ready', playable_reason: null }
          : { playable_state: outcome.state, playable_reason: outcome.reason },
      );
      return true;
    });
  }
}

export interface PlayableLocation {
  readonly path: string;
  readonly size: number;
  readonly etag: string;
}

async function sizeOf(path: string): Promise<number | undefined> {
  try {
    return (await stat(path)).size;
  } catch (cause) {
    if (fsCode(cause) === 'ENOENT') return undefined;
    throw cause;
  }
}

export async function locatePlayable(
  layout: DerivedLayout,
  item: Pick<PlayableVideo, 'id' | 'rev'>,
  media: Pick<DriveMediaRow, 'playable_state'>,
  original: () => Promise<string>,
): Promise<PlayableLocation | undefined> {
  if (media.playable_state !== 'ready') return undefined;
  for (const copy of ['full', 'fullHd'] as const) {
    const path = playableCopyPath(layout, item.id, item.rev, copy);
    const size = await sizeOf(path);
    if (size !== undefined) return { path, size, etag: `${item.id}-${String(item.rev)}-${copy}` };
  }
  const path = await original();
  const size = await sizeOf(path);
  return size === undefined
    ? undefined
    : { path, size, etag: `${item.id}-${String(item.rev)}-original` };
}

export function playableSource(location: PlayableLocation): ByteSource {
  return {
    size: location.size,
    etag: location.etag,
    headers: { 'content-type': PLAYABLE_MIME },
    stream: (range) => createReadStream(location.path, range),
  };
}
