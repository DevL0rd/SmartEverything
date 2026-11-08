import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { copyFile, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { hubLayout, type HubLayout } from '../../src/data-layout';
import { ffmpegPath } from '../../src/media/ffmpeg-path';
import { derivedPath } from '../../src/photos/pipeline/derived-paths';
import {
  MotionHandler,
  clipLocation,
  extractMotionClip,
  findMotionClip,
  motionClipPath,
  stillLiveId,
} from '../../src/photos/pipeline/motion';
import { PosterHandler, posterArguments, posterSeconds } from '../../src/photos/pipeline/poster';
import { clockwiseRotation, probeVideo } from '../../src/photos/pipeline/probe';
import {
  RAW_DECODER,
  findRawPreview,
  renderRawPreview,
  withFileReader,
} from '../../src/photos/pipeline/raw';
import { recordStemKey, stemKeyOf } from '../../src/photos/pipeline/stem-key';
import { StoreContext } from '../../src/store/context';
import { ChangeFeed } from '../../src/store/feed';
import { migrate } from '../../src/store/migrate';
import { MIGRATIONS } from '../../src/store/migrations';
import { DriveItemsRepository } from '../../src/store/repositories/drive-items';
import { DriveMediaRepository } from '../../src/store/repositories/drive-media';
import { DriveMediaJobsRepository } from '../../src/store/repositories/drive-media-jobs';
import { Sql } from '../../src/store/sql';
import { testLogger } from '../support/logs';

const run = promisify(execFile);
const FIXTURES = resolve(import.meta.dirname, '../fixtures/photos');
const NOW = '2026-11-07T00:00:00.000Z';
const ROOT = '0f000000-0000-4000-8000-000000000001';
const LIVE_ID = '3F2A9C1E-5B7D-4E6A-9C3B-0A1B2C3D4E5F';

interface Spec {
  readonly tag: number;
  readonly type: number;
  readonly count: number;
  readonly value: number;
}

interface Offsets {
  readonly blob: readonly number[];
  readonly ifd: readonly number[];
}

interface IfdPlan {
  readonly fields: (at: Offsets) => Spec[];
  readonly next?: (at: Offsets) => number;
}

function ifdBytes(label: 'II' | 'MM', fields: readonly Spec[], next: number): Buffer {
  const little = label === 'II';
  const out = Buffer.alloc(2 + fields.length * 12 + 4);
  const u16 = (value: number, at: number): void => {
    if (little) out.writeUInt16LE(value, at);
    else out.writeUInt16BE(value, at);
  };
  const u32 = (value: number, at: number): void => {
    if (little) out.writeUInt32LE(value, at);
    else out.writeUInt32BE(value, at);
  };
  u16(fields.length, 0);
  fields.forEach((field, index) => {
    const at = 2 + index * 12;
    u16(field.tag, at);
    u16(field.type, at + 2);
    u32(field.count, at + 4);
    if (field.type === 3) u16(field.value, at + 8);
    else u32(field.value, at + 8);
  });
  u32(next, out.length - 4);
  return out;
}

function tiff(
  label: 'II' | 'MM',
  magic: number,
  blobs: readonly Buffer[],
  plans: readonly IfdPlan[],
): Buffer {
  const blobAt = blobs.map((_, index) =>
    blobs.slice(0, index).reduce((sum, blob) => sum + blob.length, 8),
  );
  const ifdStart = blobs.reduce((sum, blob) => sum + blob.length, 8);
  const sizes = plans.map((plan) => 2 + plan.fields({ blob: blobAt, ifd: [] }).length * 12 + 4);
  const ifdAt = sizes.map((_, index) =>
    sizes.slice(0, index).reduce((sum, size) => sum + size, ifdStart),
  );
  const at = { blob: blobAt, ifd: ifdAt };
  const header = Buffer.alloc(8);
  header.write(label, 0, 'latin1');
  if (label === 'II') {
    header.writeUInt16LE(magic, 2);
    header.writeUInt32LE(ifdAt[0] ?? 0, 4);
  } else {
    header.writeUInt16BE(magic, 2);
    header.writeUInt32BE(ifdAt[0] ?? 0, 4);
  }
  return Buffer.concat([
    header,
    ...blobs,
    ...plans.map((plan) => ifdBytes(label, plan.fields(at), plan.next?.(at) ?? 0)),
  ]);
}

function jpegAt(at: Offsets, image: Buffer, blob: number): Spec[] {
  return [
    { tag: 0x0201, type: 4, count: 1, value: at.blob[blob] ?? 0 },
    { tag: 0x0202, type: 4, count: 1, value: image.length },
  ];
}

function stripAt(at: Offsets, image: Buffer, blob: number, compression: number): Spec[] {
  return [
    { tag: 0x0103, type: 3, count: 1, value: compression },
    { tag: 0x0111, type: 4, count: 1, value: at.blob[blob] ?? 0 },
    { tag: 0x0117, type: 4, count: 1, value: image.length },
  ];
}

let database: DatabaseSync;
let context: StoreContext;
let items: DriveItemsRepository;
let media: DriveMediaRepository;
let jobs: DriveMediaJobsRepository;
let directory: string;
let layout: HubLayout;

function itemId(n: number): string {
  return `0f000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
}

function thumbOf(item: ReturnType<DriveItemsRepository['find']>): unknown {
  return item === undefined || item.kind === 'folder' ? undefined : item.thumb;
}

function insert(table: string, fields: Record<string, string | number | null>): void {
  const columns = Object.keys(fields);
  database
    .prepare(
      `insert into ${table} (${columns.join(', ')}) values (${columns.map(() => '?').join(', ')})`,
    )
    .run(...Object.values(fields));
}

function seed(n: number, kind: 'image' | 'video', name: string, mime: string): string {
  const id = itemId(n);
  insert('drive_items', {
    id,
    root_id: ROOT,
    rel_path: name,
    name,
    kind,
    mime,
    bytes: 10,
    integrity: 'unknown',
    modified_at: NOW,
    added_at: NOW,
    starred: 0,
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

function writeThumb(id: string, thumb: { state: string; reason?: string }): void {
  database
    .prepare('update drive_items set thumb_state = ?, thumb_reason = ? where id = ?')
    .run(thumb.state, thumb.reason ?? null, id);
}

function fixture(name: string): Buffer {
  return readFileSync(join(FIXTURES, name));
}

async function ffmpeg(...args: string[]): Promise<void> {
  await run(ffmpegPath(), ['-y', '-v', 'error', ...args]);
}

async function clip(name: string, ...args: string[]): Promise<string> {
  const path = join(directory, name);
  await ffmpeg('-f', 'lavfi', '-i', 'testsrc=duration=1:size=64x48:rate=10', ...args, path);
  return path;
}

async function jpeg(width: number, height: number, orientation?: number): Promise<Buffer> {
  const base = sharp({
    create: { width, height, channels: 3, background: { r: 30, g: 120, b: 220 } },
  });
  return (orientation === undefined ? base : base.withMetadata({ orientation })).jpeg().toBuffer();
}

beforeEach(async () => {
  database = new DatabaseSync(':memory:', { enableForeignKeyConstraints: true });
  const log = testLogger();
  context = new StoreContext(new Sql(database), new ChangeFeed(log), () => new Date(NOW));
  migrate(context.sql, MIGRATIONS, NOW, log);
  items = new DriveItemsRepository(context);
  media = new DriveMediaRepository(context);
  jobs = new DriveMediaJobsRepository(context);
  insert('drive_roots', {
    id: ROOT,
    kind: 'folder',
    label: 'Root',
    scope: 'home',
    owner_profile_id: null,
    path: '/srv/root',
    read_only: 0,
    versions: 1,
    synced: 0,
    index_id: 'index-1',
    state: 'ready',
    items: 0,
    folders: 0,
    bytes: 0,
    hashed_share: 0,
    verified_share: 0,
    corrupt: 0,
    in_photos: 1,
    skip_patterns: '[]',
    include_hidden: 0,
    created_at: NOW,
    updated_at: NOW,
  });
  directory = await mkdtemp(join(tmpdir(), 'raw-poster-'));
  layout = hubLayout(directory, {});
});

afterEach(async () => {
  database.close();
  await rm(directory, { recursive: true, force: true });
});

describe('stem keys', () => {
  it('give a RAW and its JPEG the same key and keep folders and roots apart', () => {
    const key = (relPath: string, rootId = ROOT): string => stemKeyOf({ rootId, relPath });

    expect(key('DCIM/100/IMG_0001.ARW')).toBe(key('DCIM/100/img_0001.JPG'));
    expect(key('DCIM/100/IMG_0001.ARW')).not.toBe(key('DCIM/101/IMG_0001.ARW'));
    expect(key('IMG_0001.ARW')).not.toBe(key('IMG_0001.ARW', itemId(9)));
    expect(key('IMG_0001.ARW')).not.toBe(key('IMG_0002.ARW'));
    expect(key('trip/.jpg')).toBe(key('trip/.JPG'));
  });

  it('is recorded on the media row and never forms a stack', () => {
    const id = seed(1, 'image', 'IMG_0001.ARW', 'image/x-sony-arw');
    recordStemKey(media, { id, rootId: ROOT, relPath: 'IMG_0001.ARW' });

    expect(media.byId(id)).toMatchObject({ stem_key: `${ROOT}:img_0001`, stack_id: null });
  });
});

describe('video probe', () => {
  it('reads codecs, streamability, place and the Live identifier', async () => {
    const faststart = await probeVideo(join(FIXTURES, 'clip-gps.mp4'));
    const live = await probeVideo(join(FIXTURES, 'live-photo.mov'));

    expect(faststart).toMatchObject({
      videoCodec: 'AVC',
      audioCodec: 'AAC',
      streamable: true,
      rotation: 0,
      transfer: null,
    });
    expect(faststart.location?.lat).toBeCloseTo(13.7563, 3);
    expect(live).toMatchObject({ streamable: false, liveId: LIVE_ID, make: 'Apple' });
  });

  it('reports one rotation convention: clockwise degrees to display', async () => {
    const base = await clip('base.mp4', '-c:v', 'libx264', '-pix_fmt', 'yuv420p');
    const turned = join(directory, 'turned.mov');
    await ffmpeg('-display_rotation', '90', '-i', base, '-c', 'copy', turned);

    expect((await probeVideo(turned)).rotation).toBe(270);
    expect([clockwiseRotation(-90), clockwiseRotation(450.2), clockwiseRotation(null)]).toEqual([
      270, 90, 0,
    ]);
  });

  it('names the HLG transfer of an HDR clip', async () => {
    const hdr = await clip(
      'hdr.mp4',
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
    );

    expect(await probeVideo(hdr)).toMatchObject({ transfer: 'HLG', bitDepth: 10 });
  });
});

describe('RAW previews', () => {
  const sof3 = Buffer.from('ffd8ffc3000b0800100010010111005555ffd9', 'hex');
  const orientation6: Spec = { tag: 0x0112, type: 3, count: 1, value: 6 };

  async function previewOf(file: Buffer): Promise<ReturnType<typeof findRawPreview>> {
    const path = join(directory, 'file.raw');
    await writeFile(path, file);
    return withFileReader(path, findRawPreview);
  }

  it('takes the largest embedded JPEG from the SubIFD, the strips and the thumbnail IFD', async () => {
    const [big, thumb] = [await jpeg(400, 200), await jpeg(64, 48)];
    const file = tiff(
      'II',
      42,
      [big, thumb],
      [
        {
          fields: (at): Spec[] => [
            orientation6,
            { tag: 0x014a, type: 4, count: 1, value: at.ifd[1] ?? 0 },
          ],
          next: (at): number => at.ifd[2] ?? 0,
        },
        { fields: (at): Spec[] => stripAt(at, big, 0, 7) },
        { fields: (at): Spec[] => jpegAt(at, thumb, 1) },
      ],
    );

    expect(await previewOf(file)).toMatchObject({
      kind: 'found',
      preview: { width: 400, height: 200, length: big.length, orientation: 6 },
    });
  });

  it('reads big-endian files and Panasonic JpgFromRaw', async () => {
    const image = await jpeg(120, 80);
    const motorola = tiff('MM', 42, [image], [{ fields: (at): Spec[] => jpegAt(at, image, 0) }]);
    const panasonic = tiff(
      'II',
      0x55,
      [image],
      [
        {
          fields: (at): Spec[] => [
            { tag: 0x002e, type: 7, count: image.length, value: at.blob[0] ?? 0 },
          ],
        },
      ],
    );

    expect(await previewOf(motorola)).toMatchObject({ kind: 'found', preview: { width: 120 } });
    expect(await previewOf(panasonic)).toMatchObject({ kind: 'found', preview: { height: 80 } });
  });

  it('finds the Sony maker note preview', async () => {
    const image = await jpeg(300, 200);
    const note = Buffer.concat([
      Buffer.from('SONY DSC \0\0\0', 'latin1'),
      ifdBytes('II', [{ tag: 0x2001, type: 7, count: image.length, value: 8 }], 0),
    ]);
    const file = tiff(
      'II',
      42,
      [image, note],
      [
        { fields: (at): Spec[] => [{ tag: 0x8769, type: 4, count: 1, value: at.ifd[1] ?? 0 }] },
        {
          fields: (at): Spec[] => [
            { tag: 0x927c, type: 7, count: note.length, value: at.blob[1] ?? 0 },
          ],
        },
      ],
    );

    expect(await previewOf(file)).toMatchObject({ kind: 'found', preview: { width: 300 } });
  });

  it('reads the JPEG a Fujifilm RAF points at', async () => {
    const image = await jpeg(90, 60);
    const header = Buffer.alloc(100);
    header.write('FUJIFILMCCD-RAW 0201', 0, 'latin1');
    header.writeUInt32BE(100, 84);
    header.writeUInt32BE(image.length, 88);

    expect(await previewOf(Buffer.concat([header, image]))).toMatchObject({
      kind: 'found',
      preview: { offset: 100, width: 90 },
    });
  });

  it('reports no preview for lossless raw JPEG data, plain TIFF and unknown containers', async () => {
    const lossless = tiff('II', 42, [sof3], [{ fields: (at): Spec[] => stripAt(at, sof3, 0, 7) }]);

    expect(await previewOf(lossless)).toMatchObject({ kind: 'none' });
    expect(await previewOf(fixture('synthetic.dng'))).toMatchObject({ kind: 'none' });
    expect(await previewOf(Buffer.from('not a raw file at all, just text'))).toMatchObject({
      kind: 'none',
      reason: 'this RAW container is not one the preview reader knows',
    });
  });

  it('marks a RAW without a preview unsupported with its reason', async () => {
    const path = join(directory, 'synthetic.arw');
    await copyFile(join(FIXTURES, 'synthetic.arw'), path);
    const file = { path, mime: 'image/x-sony-arw', name: 'synthetic.arw' };

    expect(RAW_DECODER.accepts(file)).toBe(true);
    expect(RAW_DECODER.accepts({ ...file, name: 'photo.jpg' })).toBe(false);
    expect(await RAW_DECODER.decode(file, new AbortController().signal)).toEqual({
      kind: 'unsupported',
      reason: 'this RAW file has no embedded preview',
    });
  });

  it('decodes the embedded preview of a RAW upright and fitted to 2048', async () => {
    const image = await jpeg(3000, 1000);
    const path = join(directory, 'wide.dng');
    await writeFile(
      path,
      tiff(
        'II',
        42,
        [image],
        [{ fields: (at): Spec[] => [orientation6, ...jpegAt(at, image, 0)] }],
      ),
    );

    const decoded = await RAW_DECODER.decode(
      { path, mime: 'image/tiff', name: 'wide.dng' },
      new AbortController().signal,
    );

    expect(decoded).toMatchObject({
      kind: 'decoded',
      source: { kind: 'pixels', width: 683, height: 2048 },
    });
  });

  it.each([1, 2, 3, 4, 5, 6, 7, 8])(
    'applies EXIF orientation %i as sharp does',
    async (orientation) => {
      const pixels = Buffer.from([
        255, 0, 0, 0, 255, 0, 0, 0, 255, 255, 255, 0, 9, 9, 9, 200, 100, 50,
      ]);
      const plain = await sharp(pixels, { raw: { width: 3, height: 2, channels: 3 } })
        .tiff({ compression: 'none' })
        .toBuffer();
      const tagged = await sharp(plain)
        .withMetadata({ orientation })
        .tiff({ compression: 'none' })
        .toBuffer();
      const expected = await sharp(tagged)
        .autoOrient()
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

      const mine = await renderRawPreview(plain, orientation);

      expect([mine.width, mine.height]).toEqual([expected.info.width, expected.info.height]);
      expect(Buffer.from(mine.data)).toEqual(expected.data);
    },
  );

  it('does not rotate twice when the embedded JPEG carries its own orientation', async () => {
    const rendered = await renderRawPreview(await jpeg(600, 400, 6), 6);

    expect([rendered.width, rendered.height]).toEqual([400, 600]);
  });
});

describe('video posters', () => {
  const NO_ABORT = new AbortController().signal;

  function posterHandler(): PosterHandler {
    return new PosterHandler({
      store: { write: (work) => context.write(work), driveItems: items, driveMedia: media },
      writeThumb,
      locate: (item) => Promise.resolve(join(directory, item.name)),
      layout,
      log: testLogger(),
    });
  }

  it('seeks to one second or half of a shorter clip, before the input', () => {
    expect([posterSeconds(60), posterSeconds(0.4), posterSeconds(2)]).toEqual([1, 0.2, 1]);
    const args = posterArguments('in.mp4', { durationSeconds: 0.4, transfer: null }, 'out');
    expect(args.indexOf('-ss')).toBeLessThan(args.indexOf('-i'));
    expect(args[args.indexOf('-ss') + 1]).toBe('0.200');
    expect(args).not.toContain('-vf');
    expect(posterArguments('in.mp4', { durationSeconds: 3, transfer: 'PQ' }, 'out')).toContain(
      '-vf',
    );
  });

  function posterJob(
    n: number,
    name: string,
  ): { id: string; job: ReturnType<DriveMediaJobsRepository['enqueue']> } {
    const id = seed(n, 'video', name, 'video/mp4');
    return { id, job: jobs.enqueue({ kind: 'poster', itemId: id, rev: 1 }) };
  }

  it.each([
    ['short.mp4', 0.4],
    ['regular.mp4', 1],
  ])('writes the derived files, placeholder and states of %s', async (name, seconds) => {
    await ffmpeg(
      '-f',
      'lavfi',
      '-i',
      `testsrc=duration=${String(seconds)}:size=96x64:rate=10`,
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      join(directory, name),
    );
    const { id, job } = posterJob(1, name);

    await posterHandler().run(job, NO_ABORT);

    expect(media.byId(id)).toMatchObject({ preview_state: 'ready', poster_state: 'ready' });
    expect(media.byId(id).thumbhash).not.toBeNull();
    expect(thumbOf(items.find(id))).toEqual({ state: 'ready' });
    const preview = await readFile(derivedPath(layout, { itemId: id, rev: 1, size: 'preview' }));
    expect(await sharp(preview).metadata()).toMatchObject({
      format: 'webp',
      width: 96,
      height: 64,
    });
    await expect(stat(join(layout.cache.derived(id), `${id}-1-frame.partial`))).rejects.toThrow();
  });

  it('tone maps an HDR clip into a poster', async () => {
    await ffmpeg(
      '-f',
      'lavfi',
      '-i',
      'testsrc=duration=1:size=96x64:rate=10',
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
      join(directory, 'hdr.mp4'),
    );
    const { id, job } = posterJob(2, 'hdr.mp4');

    await posterHandler().run(job, NO_ABORT);

    expect(media.byId(id).poster_state).toBe('ready');
  });

  it('marks a file without a video track unsupported and a missing file failed', async () => {
    await ffmpeg(
      '-f',
      'lavfi',
      '-i',
      'sine=duration=1',
      '-c:a',
      'aac',
      join(directory, 'audio.mp4'),
    );
    const audio = posterJob(3, 'audio.mp4');
    const missing = posterJob(4, 'gone.mp4');
    const handler = posterHandler();

    await handler.run(audio.job, NO_ABORT);
    await expect(handler.run(missing.job, NO_ABORT)).rejects.toThrow();
    handler.fail(missing.job, new Error('the file is gone'));

    expect(media.byId(audio.id)).toMatchObject({
      poster_state: 'unsupported',
      poster_reason: 'the file has no video track',
    });
    expect(media.byId(missing.id)).toMatchObject({
      poster_state: 'failed',
      preview_reason: 'the file is gone',
    });
    expect(thumbOf(items.find(missing.id))).toEqual({ state: 'failed', reason: 'the file is gone' });
  });

  it('skips a job for a changed revision', async () => {
    const { id, job } = posterJob(5, 'old.mp4');
    database.prepare('update drive_items set rev = 2 where id = ?').run(id);

    await posterHandler().run(job, NO_ABORT);

    expect(media.byId(id).poster_state).toBe('none');
  });
});

describe('motion and Live clips', () => {
  const photo = (): Buffer => fixture('motion-photo.jpg');

  it('reads the clip from the XMP directory and the MicroVideo offset', () => {
    const container =
      '<Container:Item Item:Semantic="MotionPhoto" Item:Mime="video/mp4" Item:Length="500" Item:Padding="20"/>';

    expect(clipLocation(container, 10_000)).toEqual({ offset: 9480, length: 500 });
    expect(clipLocation('<x GCamera:MicroVideoOffset="700"/>', 10_000)).toEqual({
      offset: 9300,
      length: 700,
    });
    expect(clipLocation('<x/>', 10_000)).toBeUndefined();
  });

  it('finds, validates and extracts the clip of a motion photo', async () => {
    const path = join(directory, 'motion.jpg');
    await writeFile(path, photo());
    const clip = await withFileReader(path, findMotionClip);
    const target = join(directory, 'out', 'clip.mp4');

    expect(clip).toEqual({
      offset: photo().length - fixture('motion-clip.mp4').length,
      length: fixture('motion-clip.mp4').length,
    });
    await extractMotionClip(path, clip ?? { offset: 0, length: 0 }, target);
    expect(await readFile(target)).toEqual(fixture('motion-clip.mp4'));
  });

  it('ignores plain photos and a file whose trailer is not an MP4', async () => {
    const trailing = join(directory, 'trailing.jpg');
    await writeFile(trailing, Buffer.concat([photo(), Buffer.from('padding')]));
    const plain = join(directory, 'plain.jpg');
    await copyFile(join(FIXTURES, 'exif-full.jpg'), plain);

    expect(await withFileReader(trailing, findMotionClip)).toBeUndefined();
    expect(await withFileReader(plain, findMotionClip)).toBeUndefined();
    expect(await withFileReader(join(FIXTURES, 'screenshot.png'), findMotionClip)).toBeUndefined();
  });

  function motionHandler(): MotionHandler {
    return new MotionHandler({
      store: { write: (work) => context.write(work), driveItems: items, driveMedia: media },
      locate: (item) => Promise.resolve(join(directory, item.name)),
      layout,
      log: testLogger(),
    });
  }

  it('stores an Android clip as a derived file linked to its own item', async () => {
    await writeFile(join(directory, 'motion.jpg'), photo());
    const id = seed(1, 'image', 'motion.jpg', 'image/jpeg');

    await motionHandler().run(jobs.enqueue({ kind: 'motion', itemId: id, rev: 1 }));

    expect(media.byId(id).motion_clip_id).toBe(id);
    expect(await readFile(motionClipPath(layout, id, 1))).toEqual(fixture('motion-clip.mp4'));
  });

  it('pairs an iOS Live still and its movie by content identifier in either order', async () => {
    await copyFile(join(FIXTURES, 'live-photo.heic'), join(directory, 'IMG_1.HEIC'));
    await copyFile(join(FIXTURES, 'live-photo.mov'), join(directory, 'IMG_1.MOV'));
    const still = seed(1, 'image', 'IMG_1.HEIC', 'image/heic');
    const movie = seed(2, 'video', 'IMG_1.MOV', 'video/quicktime');
    const handler = motionHandler();

    expect(await stillLiveId(join(directory, 'IMG_1.HEIC'))).toBe(LIVE_ID);
    await handler.run(jobs.enqueue({ kind: 'motion', itemId: still, rev: 1 }));
    expect(media.byId(still)).toMatchObject({ live_id: LIVE_ID, motion_clip_id: null });
    await handler.run(jobs.enqueue({ kind: 'motion', itemId: movie, rev: 1 }));

    expect(media.byId(still).motion_clip_id).toBe(movie);
    expect(media.byId(movie)).toMatchObject({ live_id: LIVE_ID, motion_clip_id: null });
  });
});
