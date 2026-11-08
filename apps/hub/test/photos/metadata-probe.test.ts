import { execFile } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { afterAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ffmpegPath } from '../../src/media/ffmpeg-path';
import {
  ExifReaderModule,
  ExifToolModule,
  motionClip,
  readImage,
  readVideo,
  type MediaInfo,
  type VideoFacts,
} from '../fixtures/photos/readers';
import {
  stripIsoBmffStill,
  stripJpeg,
  stripTiff,
  type StripResult,
} from '../fixtures/photos/strip-prototype';

const run = promisify(execFile);
const FIXTURES = resolve(import.meta.dirname, '../fixtures/photos');
const PROBE = resolve(import.meta.dirname, '../../../../tmp/photos-S2/probe/package.json');
const HAS_PROBE = existsSync(PROBE);
const LIVE_ID = '3F2A9C1E-5B7D-4E6A-9C3B-0A1B2C3D4E5F';

const IMAGES = [
  'exif-full.jpg',
  'exif-full.heic',
  'live-photo.heic',
  'synthetic.dng',
  'synthetic.arw',
  'motion-photo.jpg',
] as const;
const VIDEOS = ['clip-gps.mp4', 'clip-loci.mp4', 'live-photo.mov', 'motion-clip.mp4'] as const;

function fixture(name: string): Buffer {
  return readFileSync(join(FIXTURES, name));
}

const ExifDate = z.object({ rawValue: z.string() }).loose();

function exiftoolText(tags: Record<string, unknown>, name: string): string | null {
  const value = tags[name];
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  const date = ExifDate.safeParse(value);
  return date.success
    ? date.data.rawValue.replace(':', '-').replace(':', '-').replace(' ', 'T')
    : null;
}

describe('photo fixtures', () => {
  it('stay small and keep the structures the readers depend on', () => {
    const total = [...IMAGES, ...VIDEOS, 'screenshot.png'].reduce(
      (sum, name) => sum + statSync(join(FIXTURES, name)).size,
      0,
    );
    expect(total).toBeLessThan(200_000);
    expect(fixture('exif-full.heic').toString('latin1', 4, 12)).toBe('ftypheic');
    expect(fixture('live-photo.mov').toString('latin1', 4, 12)).toBe('ftypqt  ');
    expect(fixture('screenshot.png').subarray(0, 8)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );
  });

  it('ends the motion photo with the clip its XMP directory describes', () => {
    const photo = fixture('motion-photo.jpg');
    const clip = fixture('motion-clip.mp4');
    expect(photo.subarray(photo.length - clip.length)).toEqual(clip);
    expect(motionClip(photo.toString('latin1'), photo.length)).toEqual({
      offset: photo.length - clip.length,
      length: clip.length,
    });
  });
});

describe.skipIf(!HAS_PROBE)('metadata readers against exiftool', () => {
  const load = createRequire(PROBE);
  const reader = ExifReaderModule.parse(load('exifreader'));
  const exiftool = ExifToolModule.parse(load('exiftool-vendored')).exiftool;
  const mediainfoFactory = z
    .object({ default: z.custom<(options: object) => Promise<MediaInfo>>() })
    .parse(load('mediainfo.js')).default;

  async function videoFacts(name: string): Promise<VideoFacts> {
    const data = fixture(name);
    const mediaInfo = await mediainfoFactory({ format: 'object' });
    const result = await mediaInfo.analyzeData(data.length, (length, offset) =>
      data.subarray(offset, offset + length),
    );
    mediaInfo.close();
    return readVideo(result);
  }

  it.each(IMAGES)('exifreader reads every shown field of %s like exiftool', async (name) => {
    const facts = readImage(reader, fixture(name));
    const truth = await exiftool.read(join(FIXTURES, name));
    expect(facts.takenAt).toEqual({ iso: '2025-06-14T09:30:15.123+07:00', source: 'exif-offset' });
    expect(exiftoolText(truth, 'DateTimeOriginal')).toBe(facts.takenAt?.iso);
    expect(facts.make).toBe(exiftoolText(truth, 'Make'));
    expect(facts.model).toBe(exiftoolText(truth, 'Model'));
    expect(facts.exposure.fNumber).toBe(truth['FNumber']);
    expect(facts.exposure.iso).toBe(truth['ISO']);
    expect(facts.exposure.focalMm).toBe(35);
    expect(facts.exposure.time).toBe('1/250');
    expect(facts.gps?.lat).toBeCloseTo(Number(truth['GPSLatitude']), 4);
    expect(facts.gps?.lon).toBeCloseTo(Number(truth['GPSLongitude']), 4);
    expect(facts.gps?.alt).toBe(12);
    expect(facts.width).toBe(truth['ImageWidth']);
    expect(facts.height).toBe(truth['ImageHeight']);
  });

  it('reads orientation from EXIF and leaves it null when the file has none', () => {
    expect(readImage(reader, fixture('exif-full.jpg')).orientation).toBe(6);
    expect(readImage(reader, fixture('synthetic.arw')).orientation).toBe(1);
    expect(readImage(reader, fixture('exif-full.heic')).orientation).toBeNull();
  });

  it('reads the lens only where the file carries LensModel', () => {
    const lenses = IMAGES.map((name) => readImage(reader, fixture(name)).lens);
    expect(lenses).toEqual([
      'FE 24-70mm F2.8 GM II',
      'FE 24-70mm F2.8 GM II',
      'iPhone 15 Pro back triple camera 6.765mm f/1.78',
      'FE 24-70mm F2.8 GM II',
      'FE 24-70mm F2.8 GM II',
      'FE 24-70mm F2.8 GM II',
    ]);
  });

  it('decodes the Apple content identifier from the raw maker note and the motion clip offset', () => {
    expect(readImage(reader, fixture('live-photo.heic')).liveId).toBe(LIVE_ID);
    expect(readImage(reader, fixture('exif-full.heic')).liveId).toBeNull();
    const motion = readImage(reader, fixture('motion-photo.jpg'));
    expect(motion.motionClip).toEqual({
      offset: fixture('motion-photo.jpg').length - fixture('motion-clip.mp4').length,
      length: fixture('motion-clip.mp4').length,
    });
  });

  it('reads a PNG screenshot with no capture time and no camera', () => {
    const facts = readImage(reader, fixture('screenshot.png'));
    expect(facts.takenAt).toBeNull();
    expect(facts.make).toBeNull();
    expect(facts.gps).toBeNull();
    expect(facts.width).toBe(64);
    expect(facts.height).toBe(96);
  });

  it.each(VIDEOS)('mediainfo reads duration, codecs and place of %s', async (name) => {
    const facts = await videoFacts(name);
    const truth = await exiftool.read(join(FIXTURES, name));
    expect(facts.durationSeconds).toBeCloseTo(Number(truth['Duration']), 1);
    expect(facts.videoCodec).toBe('AVC');
    expect(facts.audioCodec === 'AAC' || name === 'motion-clip.mp4').toBe(true);
    expect(facts.width).toBe(96);
    expect(facts.height).toBe(64);
    expect(facts.rotation).toBe(0);
    expect(facts.frameRate).toBe(10);
    if (name !== 'motion-clip.mp4') {
      expect(facts.gps?.lat).toBeCloseTo(13.7563, 4);
      expect(facts.gps?.lon).toBeCloseTo(100.5018, 4);
    } else {
      expect(facts.gps).toBeNull();
    }
  });

  it('reads the QuickTime capture time with its offset, the live identifier and faststart', async () => {
    const live = await videoFacts('live-photo.mov');
    expect(live.takenAt).toEqual({
      iso: '2025-06-14T09:30:15+07:00',
      source: 'quicktime-offset',
    });
    expect(live.liveId).toBe(LIVE_ID);
    expect(live.make).toBe('Apple');
    expect(live.model).toBe('iPhone 15 Pro');
    expect(live.faststart).toBe(false);
    const plain = await videoFacts('clip-gps.mp4');
    expect(plain.takenAt).toEqual({ iso: '2025-06-14T02:30:15Z', source: 'quicktime-utc' });
    expect(plain.faststart).toBe(true);
  });
});

describe.skipIf(!HAS_PROBE)('lossless location removal', () => {
  const load = createRequire(PROBE);
  const exiftool = ExifToolModule.parse(load('exiftool-vendored')).exiftool;
  const reader = ExifReaderModule.parse(load('exifreader'));
  const directories: string[] = [];

  afterAll(async () => {
    await exiftool.end();
    await Promise.all(directories.map((directory) => rm(directory, { recursive: true })));
  });

  async function copyOf(name: string): Promise<{ directory: string; path: string; data: Buffer }> {
    const directory = await mkdtemp(join(tmpdir(), 'photos-strip-'));
    directories.push(directory);
    const data = fixture(name);
    const path = join(directory, name);
    await writeFile(path, data);
    return { directory, path, data };
  }

  async function decodedHash(path: string): Promise<string> {
    const { stdout } = await run(ffmpegPath(), [
      '-v',
      'error',
      '-i',
      path,
      '-frames:v',
      '1',
      '-f',
      'md5',
      '-',
    ]);
    return stdout;
  }

  const stripped: readonly [string, (data: Buffer) => StripResult][] = [
    ['exif-full.jpg', stripJpeg],
    ['motion-photo.jpg', stripJpeg],
    ['exif-full.heic', stripIsoBmffStill],
    ['live-photo.heic', stripIsoBmffStill],
    ['synthetic.dng', stripTiff],
    ['synthetic.arw', stripTiff],
  ];

  it.each(stripped)(
    'byte patches %s in place with no GPS or XMP location left',
    async (name, strip) => {
      const { path, data } = await copyOf(name);
      const result = strip(data);
      await writeFile(path, data);
      const after = await exiftool.read(path);
      const before = await exiftool.read(join(FIXTURES, name));
      expect(result.exif).toBe(true);
      expect(data.length).toBe(fixture(name).length);
      expect(Object.keys(after).filter((key) => /^GPS|^City$|^Country$/.test(key))).toEqual([]);
      for (const key of ['Make', 'Model', 'LensModel', 'ISO', 'FNumber', 'DateTimeOriginal']) {
        expect(String(after[key])).toBe(String(before[key]));
      }
      expect(readImage(reader, data).gps).toBeNull();
      expect(readImage(reader, data).takenAt).toEqual(readImage(reader, fixture(name)).takenAt);
    },
  );

  it.each(['exif-full.jpg', 'exif-full.heic'])('keeps every decoded pixel of %s', async (name) => {
    const { path, data } = await copyOf(name);
    (name.endsWith('.jpg') ? stripJpeg : stripIsoBmffStill)(data);
    await writeFile(path, data);
    expect(await decodedHash(path)).toBe(await decodedHash(join(FIXTURES, name)));
  });

  it('keeps the motion clip trailer byte for byte and the Live identifier', async () => {
    const { data } = await copyOf('motion-photo.jpg');
    stripJpeg(data);
    const clip = fixture('motion-clip.mp4');
    expect(data.subarray(data.length - clip.length)).toEqual(clip);
    const live = await copyOf('live-photo.heic');
    stripIsoBmffStill(live.data);
    expect(readImage(reader, live.data).liveId).toBe(LIVE_ID);
  });

  it.each([
    ['clip-gps.mp4', ['-metadata', 'location=', '-metadata', 'location-eng=']],
    ['clip-loci.mp4', ['-metadata', 'location=', '-metadata', 'location-eng=']],
    [
      'live-photo.mov',
      ['-movflags', '+use_metadata_tags', '-metadata', 'com.apple.quicktime.location.ISO6709='],
    ],
  ])('remuxes %s with -c copy and the same packets', async (name, flags) => {
    const { directory, path } = await copyOf(name);
    const output = join(directory, `out-${name}`);
    await run(ffmpegPath(), [
      '-v',
      'error',
      '-i',
      path,
      '-map',
      '0',
      '-c',
      'copy',
      '-map_metadata',
      '0',
      ...flags,
      output,
    ]);
    const before = await run(ffmpegPath(), [
      '-v',
      'error',
      '-i',
      path,
      '-map',
      '0:v',
      '-map',
      '0:a',
      '-c',
      'copy',
      '-f',
      'md5',
      '-',
    ]);
    const afterRemux = await run(ffmpegPath(), [
      '-v',
      'error',
      '-i',
      output,
      '-map',
      '0:v',
      '-map',
      '0:a',
      '-c',
      'copy',
      '-f',
      'md5',
      '-',
    ]);
    expect(afterRemux.stdout).toBe(before.stdout);
    const tags = await exiftool.read(output);
    expect(Object.keys(tags).filter((key) => /GPS|Location|xyz/i.test(key))).toEqual([]);
    expect((await readFile(output)).length).toBeGreaterThan(0);
  });
});
