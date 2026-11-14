import { execFile } from 'node:child_process';
import { mkdtemp, readdir, rm, stat } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { hubLayout, type HubLayout } from '../../src/data-layout';
import { ffmpegPath } from '../../src/media/ffmpeg-path';
import {
  PlayableHandler,
  exceedsFullHd,
  locatePlayable,
  planPlayable,
  playableArguments,
  playableCopyPath,
  playableSource,
  progressOf,
  type PlayablePlan,
  type PlayableVariant,
} from '../../src/photos/pipeline/playable';
import { probeVideo } from '../../src/photos/pipeline/probe';
import { serveBytes } from '../../src/server/file-serve';
import { StoreContext } from '../../src/store/context';
import { ChangeFeed } from '../../src/store/feed';
import { migrate } from '../../src/store/migrate';
import { MIGRATIONS } from '../../src/store/migrations';
import { DriveItemsRepository } from '../../src/store/repositories/drive-items';
import { DriveMediaRepository } from '../../src/store/repositories/drive-media';
import {
  DriveMediaJobsRepository,
  type DriveMediaJob,
  type DriveMediaJobRequest,
} from '../../src/store/repositories/drive-media-jobs';
import { Sql } from '../../src/store/sql';
import { testLogger } from '../support/logs';
import { insertDriveRow } from './photo-rows';

const run = promisify(execFile);
const NOW = '2026-11-07T00:00:00.000Z';
const ROOT = '0f000000-0000-4000-8000-000000000001';
const NO_ABORT = new AbortController().signal;

let database: DatabaseSync;
let context: StoreContext;
let items: DriveItemsRepository;
let media: DriveMediaRepository;
let jobs: DriveMediaJobsRepository;
let directory: string;
let layout: HubLayout;
let requests: DriveMediaJobRequest[];

function itemId(n: number): string {
  return `0f000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
}

function insert(table: string, fields: Record<string, string | number | null>): void {
  const columns = Object.keys(fields);
  database
    .prepare(
      `insert into ${table} (${columns.join(', ')}) values (${columns.map(() => '?').join(', ')})`,
    )
    .run(...Object.values(fields));
}

function seed(n: number, name: string, mime = 'video/mp4'): string {
  const id = itemId(n);
  insert('drive_items', {
    id,
    root_id: ROOT,
    rel_path: name,
    name,
    kind: 'video',
    mime,
    bytes: 10,
    integrity: 'unknown',
    modified_at: NOW,
    added_at: NOW,
    rev: 1,
    etag: `etag-${String(n)}`,
    outside: 0,
    thumb_state: 'none',
  });
  insert('drive_media', {
    item_id: id,
    time_source: 'metadata',
    preview_state: 'none',
    poster_state: 'none',
    playable_state: 'none',
  });
  return id;
}

function enqueue(id: string, kind: DriveMediaJobRequest['kind'] = 'playable'): DriveMediaJob {
  return jobs.enqueue({ kind, itemId: id, rev: 1 });
}

function handler(variant: PlayableVariant = 'primary'): PlayableHandler {
  return new PlayableHandler(
    {
      store: { write: (work) => context.write(work), driveItems: items, driveMedia: media },
      jobs,
      request: (request): DriveMediaJob => {
        requests.push(request);
        return enqueue(request.itemId);
      },
      locate: (item) => Promise.resolve(join(directory, item.name)),
      layout,
      log: testLogger(),
    },
    variant,
  );
}

async function ffmpeg(...args: string[]): Promise<void> {
  await run(ffmpegPath(), ['-y', '-v', 'error', ...args]);
}

interface ClipOptions {
  readonly size?: string;
  readonly video: readonly string[];
  readonly audio?: readonly string[];
  readonly output?: readonly string[];
}

async function clip(name: string, options: ClipOptions): Promise<void> {
  const audio = options.audio === undefined ? [] : ['-f', 'lavfi', '-i', 'sine=duration=1'];
  await ffmpeg(
    '-f',
    'lavfi',
    '-i',
    `testsrc=duration=1:size=${options.size ?? '64x48'}:rate=5`,
    ...audio,
    ...options.video,
    ...(options.audio ?? []),
    ...(options.output ?? []),
    join(directory, name),
  );
}

const H264 = ['-c:v', 'libx264', '-pix_fmt', 'yuv420p'];
const AAC = ['-c:a', 'aac'];
const HEVC = ['-c:v', 'libx265', '-pix_fmt', 'yuv420p', '-tag:v', 'hvc1'];
const HLG = [
  '-c:v',
  'libx264',
  '-pix_fmt',
  'yuv420p10le',
  '-color_trc',
  'arib-std-b67',
  '-color_primaries',
  'bt2020',
  '-colorspace',
  'bt2020nc',
];

beforeEach(async () => {
  database = new DatabaseSync(':memory:', { enableForeignKeyConstraints: true });
  const log = testLogger();
  context = new StoreContext(new Sql(database), new ChangeFeed(log), () => new Date(NOW));
  migrate(context.sql, MIGRATIONS, NOW, log);
  items = new DriveItemsRepository(context);
  media = new DriveMediaRepository(context);
  jobs = new DriveMediaJobsRepository(context);
  requests = [];
  insertDriveRow(database, { id: ROOT, scope: 'home', ownerId: null });
  directory = await mkdtemp(join(tmpdir(), 'playable-'));
  layout = hubLayout(directory, {});
});

afterEach(async () => {
  database.close();
  await rm(directory, { recursive: true, force: true });
});

const GOOD: Parameters<typeof planPlayable>[0] = {
  container: 'MPEG-4',
  videoCodec: 'AVC',
  bitDepth: 8,
  transfer: null,
  audioCodec: 'AAC',
  streamable: true,
};

describe('the playable rule', () => {
  it.each<[string, Partial<Parameters<typeof planPlayable>[0]>, string, PlayablePlan]>([
    ['a streamable H.264 and AAC MP4 plays as it is', {}, 'video/mp4', { mode: 'original' }],
    [
      'a streamable H.264 MP4 without audio plays as it is',
      { audioCodec: null },
      'video/mp4',
      { mode: 'original' },
    ],
    [
      'an MP4 that is not streamable is remuxed',
      { streamable: false },
      'video/mp4',
      { mode: 'remux' },
    ],
    ['every MOV is remuxed to MP4 even when it passes', {}, 'video/quicktime', { mode: 'remux' }],
    [
      'other audio is converted to AAC with the video copied',
      { audioCodec: 'AC-3' },
      'video/mp4',
      { mode: 'audio' },
    ],
    [
      'HEVC is transcoded',
      { videoCodec: 'HEVC' },
      'video/mp4',
      { mode: 'transcode', toneMap: false },
    ],
    [
      '10-bit H.264 is transcoded',
      { bitDepth: 10 },
      'video/mp4',
      { mode: 'transcode', toneMap: false },
    ],
    [
      'an unknown bit depth is transcoded',
      { bitDepth: null },
      'video/mp4',
      { mode: 'transcode', toneMap: false },
    ],
    [
      'HLG is transcoded and tone mapped',
      { transfer: 'HLG' },
      'video/mp4',
      { mode: 'transcode', toneMap: true },
    ],
    [
      'PQ is transcoded and tone mapped',
      { transfer: 'PQ' },
      'video/mp4',
      { mode: 'transcode', toneMap: true },
    ],
    [
      'a Matroska file is transcoded',
      { container: 'Matroska' },
      'video/x-matroska',
      { mode: 'transcode', toneMap: false },
    ],
  ])('%s', (_name, override, mime, expected) => {
    expect(planPlayable({ ...GOOD, ...override }, mime)).toEqual(expected);
  });

  it('counts a source above 1080p by its short edge in display orientation', () => {
    expect(exceedsFullHd({ width: 3840, height: 2160, rotation: 0 })).toBe(true);
    expect(exceedsFullHd({ width: 1920, height: 1080, rotation: 0 })).toBe(false);
    expect(exceedsFullHd({ width: 1080, height: 1920, rotation: 90 })).toBe(false);
    expect(exceedsFullHd({ width: 2160, height: 3840, rotation: 270 })).toBe(true);
    expect(exceedsFullHd({ width: null, height: null, rotation: 0 })).toBe(false);
  });
});

describe('ffmpeg arguments', () => {
  const probe = { width: 3840, height: 2160, rotation: 0 };

  it('scales before the tone map of an HDR source for the 1080p copy', () => {
    const args = playableArguments(
      { source: 'in', plan: { mode: 'transcode', toneMap: true }, probe, copy: 'fullHd' },
      'out',
    );
    const filters = args[args.indexOf('-vf') + 1] ?? '';

    expect(filters.startsWith('zscale=w=1920:h=1080:f=bicubic,zscale=t=linear')).toBe(true);
    expect(filters).toContain('tonemap=tonemap=mobius:desat=0');
    expect(args.join(' ')).toContain('-colorspace bt709 -color_primaries bt709 -color_trc bt709');
    expect(args.join(' ')).toContain('-c:v libx264 -preset veryfast -crf 23');
    expect(args).toContain('+faststart');
  });

  it('keeps the source size for the full copy and never tone maps an SDR source', () => {
    const full = playableArguments(
      { source: 'in', plan: { mode: 'transcode', toneMap: false }, probe, copy: 'full' },
      'out',
    );
    const small = playableArguments(
      { source: 'in', plan: { mode: 'transcode', toneMap: false }, probe, copy: 'fullHd' },
      'out',
    );

    expect(full).not.toContain('-vf');
    expect(small[small.indexOf('-vf') + 1]).toBe('scale=1920:1080');
  });

  it('scales a portrait source by its width and copies streams for a remux', () => {
    const portrait = playableArguments(
      {
        source: 'in',
        plan: { mode: 'transcode', toneMap: false },
        probe: { width: 2160, height: 3840, rotation: 0 },
        copy: 'fullHd',
      },
      'out',
    );
    const remux = playableArguments(
      { source: 'in', plan: { mode: 'remux' }, probe, copy: 'full' },
      'out',
    );

    expect(portrait[portrait.indexOf('-vf') + 1]).toBe('scale=1080:1920');
    expect(remux.slice(remux.indexOf('-c'), remux.indexOf('-c') + 2)).toEqual(['-c', 'copy']);
  });

  it('reads the progress of ffmpeg and never goes past one', () => {
    expect(progressOf('out_time_us=500000', 2)).toBe(0.25);
    expect(progressOf('out_time_us=9000000', 2)).toBe(1);
    expect(progressOf('out_time_us=N/A', 2)).toBeUndefined();
    expect(progressOf('progress=continue', 2)).toBeUndefined();
    expect(progressOf('out_time_us=100', 0)).toBeUndefined();
  });
});

describe('playable copies', () => {
  it('serves an H.264 AAC faststart MP4 as it is and writes no copy', async () => {
    await clip('ok.mp4', { video: H264, audio: AAC, output: ['-movflags', '+faststart'] });
    const id = seed(1, 'ok.mp4');

    await handler().run(enqueue(id), NO_ABORT);

    expect(media.byId(id)).toMatchObject({ playable_state: 'ready', playable_reason: null });
    await expect(stat(playableCopyPath(layout, id, 1, 'full'))).rejects.toThrow();
    const located = await locatePlayable(layout, { id, rev: 1 }, media.byId(id), () =>
      Promise.resolve(join(directory, 'ok.mp4')),
    );
    expect(located?.path).toBe(join(directory, 'ok.mp4'));
  });

  it('remuxes an MP4 whose index is at the end into a streamable copy', async () => {
    await clip('tail.mp4', { video: H264, audio: AAC });
    expect((await probeVideo(join(directory, 'tail.mp4'))).streamable).toBe(false);
    const id = seed(2, 'tail.mp4');

    await handler().run(enqueue(id), NO_ABORT);

    const copy = await probeVideo(playableCopyPath(layout, id, 1, 'full'));
    expect(copy).toMatchObject({ videoCodec: 'AVC', audioCodec: 'AAC', streamable: true });
    expect(media.byId(id).playable_state).toBe('ready');
  });

  it('remuxes a MOV that passes the rule to MP4 and keeps the original', async () => {
    await clip('movie.mov', {
      video: H264,
      audio: AAC,
      output: ['-movflags', '+faststart'],
    });
    const id = seed(3, 'movie.mov', 'video/quicktime');

    await handler().run(enqueue(id), NO_ABORT);

    const copy = await probeVideo(playableCopyPath(layout, id, 1, 'full'));
    expect(copy).toMatchObject({ container: 'MPEG-4', videoCodec: 'AVC', streamable: true });
    expect((await stat(join(directory, 'movie.mov'))).size).toBeGreaterThan(0);
    const located = await locatePlayable(layout, { id, rev: 1 }, media.byId(id), () =>
      Promise.resolve(join(directory, 'movie.mov')),
    );
    expect(located?.path).toBe(playableCopyPath(layout, id, 1, 'full'));
  });

  it('converts other audio to AAC and copies the video', async () => {
    await clip('ac3.mp4', {
      video: H264,
      audio: ['-c:a', 'ac3'],
      output: ['-movflags', '+faststart'],
    });
    const id = seed(4, 'ac3.mp4');

    await handler().run(enqueue(id), NO_ABORT);

    const copy = await probeVideo(playableCopyPath(layout, id, 1, 'full'));
    expect(copy).toMatchObject({ videoCodec: 'AVC', audioCodec: 'AAC', width: 64, height: 48 });
  });

  it('transcodes HEVC to 8-bit H.264', async () => {
    await clip('hevc.mp4', {
      video: HEVC,
      audio: AAC,
    });
    const id = seed(5, 'hevc.mp4');

    await handler().run(enqueue(id), NO_ABORT);

    const copy = await probeVideo(playableCopyPath(layout, id, 1, 'full'));
    expect(copy).toMatchObject({ videoCodec: 'AVC', bitDepth: 8, streamable: true });
  });

  it('tone maps an HLG clip into an 8-bit bt709 copy', async () => {
    await clip('hdr.mp4', { video: HLG });
    const id = seed(6, 'hdr.mp4');

    await handler().run(enqueue(id), NO_ABORT);

    const copy = await probeVideo(playableCopyPath(layout, id, 1, 'full'));
    expect(copy).toMatchObject({ videoCodec: 'AVC', bitDepth: 8, transfer: null });
    expect(media.byId(id).playable_state).toBe('ready');
  });

  it('records progress on the job row while ffmpeg runs', async () => {
    await clip('tail2.mp4', { video: H264 });
    const id = seed(7, 'tail2.mp4');
    const job = enqueue(id);
    const seen: number[] = [];
    const original = jobs.report.bind(jobs);
    jobs.report = (jobId, progress): void => {
      seen.push(progress);
      original(jobId, progress);
    };

    await handler().run(jobs.claim(['playable']) ?? job, NO_ABORT);

    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((value) => value >= 0 && value <= 1)).toBe(true);
    expect(seen).toEqual([...seen].sort((a, b) => a - b));
  });

  it('makes the 1080p copy first and queues the source size as a separate job', async () => {
    await clip('big.mp4', { video: HEVC, size: '2000x1200' });
    const id = seed(8, 'big.mp4');

    await handler().run(enqueue(id), NO_ABORT);

    const small = await probeVideo(playableCopyPath(layout, id, 1, 'fullHd'));
    expect(small).toMatchObject({ width: 1800, height: 1080 });
    await expect(stat(playableCopyPath(layout, id, 1, 'full'))).rejects.toThrow();
    expect(requests).toEqual([{ kind: 'playable_source', itemId: id, rev: 1 }]);
    expect(media.byId(id).playable_state).toBe('ready');

    await handler('source').run(enqueue(id), NO_ABORT);

    const full = await probeVideo(playableCopyPath(layout, id, 1, 'full'));
    expect(full).toMatchObject({ width: 2000, height: 1200 });
    const located = await locatePlayable(layout, { id, rev: 1 }, media.byId(id), () =>
      Promise.resolve(join(directory, 'big.mp4')),
    );
    expect(located?.path).toBe(playableCopyPath(layout, id, 1, 'full'));
  });

  it('makes one copy at its own size for a source at or below 1080p', async () => {
    await clip('small.mp4', {
      video: HEVC,
    });
    const id = seed(9, 'small.mp4');

    await handler().run(enqueue(id), NO_ABORT);
    await handler('source').run(enqueue(id), NO_ABORT);

    expect(requests).toEqual([]);
    const names = (await readdir(layout.cache.derived(id))).filter((name) => name.startsWith(id));
    expect(names).toEqual([`${id}-1-playable.mp4`]);
  });

  it('leaves no partial file when ffmpeg fails and records the failure', async () => {
    await clip('broken.mp4', { video: H264 });
    const id = seed(10, 'broken.mp4');
    const job = enqueue(id);
    const failing = new AbortController();
    failing.abort();

    await expect(handler().run(job, failing.signal)).rejects.toThrow();
    handler().fail(job, new Error('ffmpeg stopped'));

    expect(media.byId(id)).toMatchObject({
      playable_state: 'failed',
      playable_reason: 'ffmpeg stopped',
    });
    const names = await readdir(layout.cache.derived(id)).catch(() => []);
    expect(names.filter((name) => name.endsWith('.partial'))).toEqual([]);
  });

  it('marks a file without a video track unsupported and ignores a stale revision', async () => {
    await ffmpeg('-f', 'lavfi', '-i', 'sine=duration=1', ...AAC, join(directory, 'audio.mp4'));
    const audio = seed(11, 'audio.mp4');
    await clip('old.mp4', { video: H264 });
    const stale = seed(12, 'old.mp4');
    const job = enqueue(stale);
    database.prepare('update drive_items set rev = 2 where id = ?').run(stale);

    await handler().run(enqueue(audio), NO_ABORT);
    await handler().run(job, NO_ABORT);

    expect(media.byId(audio)).toMatchObject({
      playable_state: 'unsupported',
      playable_reason: 'the file has no video track',
    });
    expect(media.byId(stale).playable_state).toBe('none');
  });

  it('prunes the copies of older revisions once the new one is ready', async () => {
    await clip('rev.mp4', { video: H264 });
    const id = seed(13, 'rev.mp4');
    await handler().run(enqueue(id), NO_ABORT);
    const old = playableCopyPath(layout, id, 1, 'full');
    database.prepare('update drive_items set rev = 2 where id = ?').run(id);

    await handler().run(jobs.enqueue({ kind: 'playable', itemId: id, rev: 2 }), NO_ABORT);

    await expect(stat(old)).rejects.toThrow();
    expect((await stat(playableCopyPath(layout, id, 2, 'full'))).size).toBeGreaterThan(0);
  });
});

describe('serving a playable copy', () => {
  let server: Server;

  afterEach(() => {
    server.close();
  });

  async function serve(): Promise<{ base: string; size: number }> {
    await clip('serve.mp4', { video: H264, audio: AAC, output: ['-movflags', '+faststart'] });
    const path = join(directory, 'serve.mp4');
    const { size } = await stat(path);
    const source = playableSource({ path, size, etag: 'serve-1' });
    server = createServer((request, response) => {
      void serveBytes(source, request, response);
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (address === null || typeof address === 'string') throw new Error('no address');
    return { base: `http://127.0.0.1:${String(address.port)}`, size };
  }

  it('answers every range form with 206 and video/mp4 and the whole file with 200', async () => {
    const { base, size } = await serve();
    const get = (range?: string): Promise<Response> =>
      fetch(base, range === undefined ? {} : { headers: { range } });

    const whole = await get();
    const first = await get('bytes=0-9');
    const open = await get('bytes=100-');
    const suffix = await get('bytes=-5');

    expect([whole.status, first.status, open.status, suffix.status]).toEqual([200, 206, 206, 206]);
    expect(whole.headers.get('content-type')).toBe('video/mp4');
    expect(whole.headers.get('accept-ranges')).toBe('bytes');
    expect(first.headers.get('content-range')).toBe(`bytes 0-9/${String(size)}`);
    expect(open.headers.get('content-range')).toBe(`bytes 100-${String(size - 1)}/${String(size)}`);
    expect((await suffix.arrayBuffer()).byteLength).toBe(5);
    expect(suffix.headers.get('content-range')).toBe(
      `bytes ${String(size - 5)}-${String(size - 1)}/${String(size)}`,
    );
    expect((await get(`bytes=${String(size + 10)}-`)).status).toBe(416);
  });

  it('serves nothing until the playable state is ready', async () => {
    await clip('wait.mp4', { video: H264 });
    const id = seed(14, 'wait.mp4');

    expect(
      await locatePlayable(layout, { id, rev: 1 }, media.byId(id), () =>
        Promise.resolve(join(directory, 'wait.mp4')),
      ),
    ).toBeUndefined();
  });
});
