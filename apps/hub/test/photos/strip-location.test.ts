import { execFile } from 'node:child_process';
import { copyFile, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { load } from 'exifreader';
import sharp from 'sharp';
import { z } from 'zod';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { hubLayout, type HubLayout } from '../../src/data-layout';
import { ffmpegPath } from '../../src/media/ffmpeg-path';
import { stripIsoBmffStill } from '../../src/photos/pipeline/strip-heif';
import {
  outsideCopy,
  outsidePath,
  sniffKind,
  type OutsideCopy,
} from '../../src/photos/pipeline/strip-location';
import { LayoutRejected } from '../../src/photos/pipeline/strip-tiff';
import { captureLogs, testLogger } from '../support/logs';

const run = promisify(execFile);
const Described = z.object({ description: z.unknown() });
const FIXTURES = resolve(import.meta.dirname, '../fixtures/photos');
const ITEM = 'item-1';

function idOf(name: string): string {
  return `item-${name.replace(/[^0-9A-Za-z]/gu, '')}`;
}
const GPS_POINTER = 0x8825;
const XMP_LOCATION = /(?:GPS[A-Za-z]*|City|Country|Location)(?:="|>)[^"<]+/u;

let directory: string;
let layout: HubLayout;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'photos-strip-'));
  layout = hubLayout(directory, {});
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

function fixture(name: string): Promise<Buffer> {
  return readFile(join(FIXTURES, name));
}

async function strip(name: string, extension: string, rev = 1): Promise<OutsideCopy> {
  const source = join(directory, name);
  await copyFile(join(FIXTURES, name), source);
  return outsideCopy({
    source,
    extension,
    itemId: idOf(name),
    rev,
    layout,
    log: testLogger('strip'),
  });
}

function exifOf(data: Buffer): Record<string, string> {
  const tags = load(data, { expanded: true });
  return Object.fromEntries(
    Object.entries(tags.exif ?? {}).map(([name, tag]) => [
      name,
      String(Described.parse(tag).description),
    ]),
  );
}

function withoutGps(tags: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(tags).filter(([name]) => !name.startsWith('GPS') && name !== 'ApplicationNotes'),
  );
}

function xmpOf(data: Buffer): string {
  return load(data, { expanded: true }).xmp?._raw ?? '';
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

async function packetHash(path: string): Promise<string> {
  const { stdout } = await run(ffmpegPath(), [
    '-v',
    'error',
    '-i',
    path,
    '-map',
    '0:v',
    '-map',
    '0:a?',
    '-c',
    'copy',
    '-f',
    'md5',
    '-',
  ]);
  return stdout;
}

async function containerTags(path: string): Promise<string> {
  const { stdout } = await run(ffmpegPath(), ['-v', 'error', '-i', path, '-f', 'ffmetadata', '-']);
  return stdout;
}

describe('stills patched in place', () => {
  const stills = [
    ['exif-full.jpg', 'jpg'],
    ['motion-photo.jpg', 'jpg'],
    ['exif-full.heic', 'heic'],
    ['live-photo.heic', 'heic'],
    ['synthetic.dng', 'dng'],
    ['synthetic.arw', 'arw'],
  ] as const;

  it.each(stills)(
    'leaves %s with no GPS or XMP location and every other tag unchanged',
    async (name, extension) => {
      const original = await fixture(name);
      expect(exifOf(original)['GPSLatitude']).toBeDefined();
      const copy = await strip(name, extension);
      const data = await readFile(copy.path);
      expect(copy.method).toBe('patched');
      expect(copy.path).toBe(outsidePath(layout, idOf(name), 1, extension));
      expect(data.length).toBe(original.length);
      expect(load(data, { expanded: true }).gps).toBeUndefined();
      expect(withoutGps(exifOf(data))).toEqual(withoutGps(exifOf(original)));
      if (name !== 'motion-photo.jpg') expect(xmpOf(original)).toMatch(XMP_LOCATION);
      expect(xmpOf(data)).not.toMatch(XMP_LOCATION);
    },
  );

  it('never touches the original file', async () => {
    const original = await fixture('exif-full.jpg');
    const copy = await strip('exif-full.jpg', 'jpg');
    expect(copy.path).not.toBe(join(directory, 'exif-full.jpg'));
    expect(await readFile(join(directory, 'exif-full.jpg'))).toEqual(original);
  });

  it('keeps every decoded pixel of the JPEG and the HEIC', async () => {
    const jpeg = await strip('exif-full.jpg', 'jpg');
    const heic = await strip('exif-full.heic', 'heic');
    expect(await sharp(jpeg.path).raw().toBuffer()).toEqual(
      await sharp(join(FIXTURES, 'exif-full.jpg')).raw().toBuffer(),
    );
    expect(await decodedHash(heic.path)).toBe(await decodedHash(join(FIXTURES, 'exif-full.heic')));
  });

  it('keeps the motion clip trailer byte for byte', async () => {
    const copy = await strip('motion-photo.jpg', 'jpg');
    const data = await readFile(copy.path);
    const clip = await fixture('motion-clip.mp4');
    expect(data.subarray(data.length - clip.length)).toEqual(clip);
  });

  it('keeps the Live Photo content identifier readable in the HEIC', async () => {
    const original = await fixture('live-photo.heic');
    const copy = await strip('live-photo.heic', 'heic');
    const data = await readFile(copy.path);
    expect(Object.keys(exifOf(data))).toContain('MakerNote');
    expect(data.length).toBe(original.length);
  });
});

describe('videos remuxed', () => {
  it.each([
    ['clip-gps.mp4', 'mp4', 'location'],
    ['clip-loci.mp4', 'mp4', 'location'],
    ['live-photo.mov', 'mov', 'ISO6709'],
  ])('drops the location atoms of %s and keeps the packets', async (name, extension, marker) => {
    const original = join(FIXTURES, name);
    expect(await containerTags(original)).toContain(marker);
    const copy = await strip(name, extension);
    expect(copy.method).toBe('remuxed');
    expect(copy.extension).toBe(extension);
    expect(await containerTags(copy.path)).not.toContain(marker);
    expect(await containerTags(copy.path)).not.toMatch(/ISO6709|location/u);
    expect(await packetHash(copy.path)).toBe(await packetHash(original));
    expect((await stat(copy.path)).size).toBeGreaterThan(0);
  });

  it('streams from the first byte', async () => {
    const copy = await strip('live-photo.mov', 'mov');
    const data = await readFile(copy.path);
    const moov = data.indexOf('moov');
    const mdat = data.indexOf('mdat');
    expect(moov).toBeGreaterThan(0);
    expect(moov).toBeLessThan(mdat);
  });
});

function corruptGpsPointer(jpeg: Buffer): Buffer {
  const data = Buffer.from(jpeg);
  const base = data.indexOf('Exif\0\0') + 6;
  const little = data.toString('latin1', base, base + 2) === 'II';
  const read16 = (at: number): number => (little ? data.readUInt16LE(at) : data.readUInt16BE(at));
  const ifd = base + (little ? data.readUInt32LE(base + 4) : data.readUInt32BE(base + 4));
  for (let index = 0; index < read16(ifd); index++) {
    const entry = ifd + 2 + index * 12;
    if (read16(entry) !== GPS_POINTER) continue;
    if (little) data.writeUInt32LE(0x7fffff00, entry + 8);
    else data.writeUInt32BE(0x7fffff00, entry + 8);
    return data;
  }
  throw new Error('the fixture has no GPS pointer');
}

describe('files the patchers reject', () => {
  it('serves a re-encoded copy keeping orientation and logs the reason', async () => {
    const logs = captureLogs();
    const source = join(directory, 'broken.jpg');
    await writeFile(source, corruptGpsPointer(await fixture('exif-full.jpg')));
    const copy = await outsideCopy({
      source,
      extension: 'jpg',
      itemId: ITEM,
      rev: 2,
      layout,
      log: testLogger('strip'),
    });
    expect(copy.method).toBe('reencoded');
    expect(copy.path).toBe(outsidePath(layout, ITEM, 2, 'jpg'));
    const data = await readFile(copy.path);
    expect(load(data, { expanded: true }).gps).toBeUndefined();
    expect(Object.keys(exifOf(data)).filter((name) => name.startsWith('GPS'))).toEqual([]);
    const size = await sharp(data).metadata();
    expect([size.width, size.height]).toEqual([64, 96]);
    expect(logs.events()).toContain('photos.location_reencoded');
    const warning = logs.records.find((record) => record.event === 'photos.location_reencoded');
    expect(JSON.stringify(warning)).toContain('outside the file');
  });

  it('re-encodes a format that has no lossless edit', async () => {
    const copy = await strip('screenshot.png', 'png');
    expect(copy.method).toBe('reencoded');
    expect(copy.extension).toBe('png');
    expect((await sharp(copy.path).metadata()).format).toBe('png');
  });

  it('rejects an ISO base media file without a meta box', () => {
    const head = Buffer.alloc(24);
    head.writeUInt32BE(24, 0);
    head.write('ftypheic', 4, 'latin1');
    expect(() => stripIsoBmffStill(head)).toThrow(LayoutRejected);
  });
});

describe('cache and names', () => {
  it('returns the existing copy for the same item and revision', async () => {
    const first = await strip('exif-full.jpg', 'jpg');
    const second = await strip('exif-full.jpg', 'jpg');
    expect(second.path).toBe(first.path);
    expect(second.method).toBe('existing');
    expect(second.extension).toBe('jpg');
  });

  it('keys the copy by revision', async () => {
    const first = await strip('exif-full.jpg', 'jpg', 1);
    const second = await strip('exif-full.jpg', 'jpg', 2);
    expect(second.path).not.toBe(first.path);
    expect(second.path).toMatch(/-2-outside\.jpg$/u);
  });

  it('routes by magic bytes', async () => {
    const kinds = await Promise.all(
      [
        'exif-full.jpg',
        'synthetic.dng',
        'exif-full.heic',
        'live-photo.mov',
        'clip-gps.mp4',
        'screenshot.png',
      ].map(async (name) => sniffKind((await fixture(name)).subarray(0, 12))),
    );
    expect(kinds).toEqual(['jpeg', 'tiff', 'heif', 'mov', 'mp4', 'other']);
  });
});
