import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { open } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DriveItem } from '@smarteverything/domain';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { scanHandler, type ScanEnvironment } from '../../src/drive/jobs';
import { collectUnread, metadataHandler, type MetadataEnvironment } from '../../src/drive/metadata';
import { momentOf, readStill, readTimed, routeOf, TimedProbe } from '../../src/drive/metadata-read';
import { updateDriveSettings } from '../../src/drive/settings';
import { DriveMediaRepository } from '../../src/store/repositories/drive-media';
import { captureLogs, testLogger, type CapturedLogs } from '../support/logs';
import { bundleWorker, driveRoot, NOW, openDriveFixture, type DriveFixture } from './drive-fixture';

const ROOT = '0d000000-0000-4000-8000-000000000002';

const fixture = (name: string): string =>
  fileURLToPath(new URL(`../fixtures/drive-media/${name}`, import.meta.url));

const bytesOf = (name: string): Buffer => readFileSync(fixture(name));

async function timedFacts(name: string): Promise<ReturnType<typeof readTimed>> {
  const probe = new TimedProbe();
  const handle = await open(fixture(name));
  try {
    return readTimed(await probe.analyze(handle, (await handle.stat()).size));
  } finally {
    await handle.close();
    probe.close();
  }
}

describe('reading stills', () => {
  it('reads time with offset, camera, exposure, place, size and orientation from a JPEG', () => {
    expect(readStill(bytesOf('exif-full.jpg'))).toEqual({
      takenAt: { iso: '2025-06-14T09:30:15.123+07:00', offsetMin: 420, source: 'metadata' },
      width: 96,
      height: 64,
      orientation: 6,
      camera: { make: 'SONY', model: 'ILCE-7M4', lens: 'FE 24-70mm F2.8 GM II' },
      exposure: { iso: 400, aperture: 2.8, shutter: 0.004, focal: 35 },
      place: { lat: 13.7563, lon: 100.5018 },
      durationMs: null,
    });
  });

  it('reads the same facts from a HEIC without an orientation tag', () => {
    const facts = readStill(bytesOf('exif-full.heic'));
    expect(facts.takenAt?.iso).toBe('2025-06-14T09:30:15.123+07:00');
    expect([facts.width, facts.height, facts.orientation]).toEqual([96, 64, null]);
    expect(facts.camera?.model).toBe('ILCE-7M4');
    expect(facts.place).toEqual({ lat: 13.7563, lon: 100.5018 });
  });

  it('reads a RAW container through its TIFF structure', () => {
    const facts = readStill(bytesOf('synthetic.arw'));
    expect(facts.camera?.make).toBe('SONY');
    expect(facts.width).toBe(96);
    expect(facts.orientation).toBe(1);
  });

  it('reads only the size of a PNG screenshot and a JPEG without EXIF', () => {
    const screenshot = readStill(bytesOf('screenshot.png'));
    expect([screenshot.width, screenshot.height]).toEqual([64, 96]);
    expect(screenshot.takenAt).toBeNull();
    expect(screenshot.camera).toBeNull();
    expect(screenshot.exposure).toBeNull();
    expect(screenshot.place).toBeNull();
    const plain = readStill(bytesOf('plain.jpg'));
    expect([plain.width, plain.height, plain.takenAt]).toEqual([48, 32, null]);
  });

  it('rejects bytes that are no image', () => {
    expect(() => readStill(Buffer.from('not an image at all'))).toThrow();
  });
});

describe('reading timed media', () => {
  it('reads the UTC creation time, duration, size and location of an MP4', async () => {
    const facts = await timedFacts('clip-gps.mp4');
    expect(facts.takenAt).toEqual({
      iso: '2025-06-14T02:30:15Z',
      offsetMin: 0,
      source: 'container',
    });
    expect(facts.durationMs).toBe(1000);
    expect([facts.width, facts.height]).toEqual([expect.any(Number), expect.any(Number)]);
    expect(facts.place).toEqual({ lat: 13.7563, lon: 100.5018 });
  });

  it('prefers the recorded date with its offset in a MOV', async () => {
    const facts = await timedFacts('live-photo.mov');
    expect(facts.takenAt).toEqual({
      iso: '2025-06-14T09:30:15+07:00',
      offsetMin: 420,
      source: 'container',
    });
    expect(facts.place).not.toBeNull();
  });

  it('reads the duration of an audio file and no size', async () => {
    const facts = await timedFacts('tone.mp3');
    expect(facts.durationMs).toBeGreaterThan(1900);
    expect(facts.durationMs).toBeLessThan(2200);
    expect([facts.width, facts.height]).toEqual([null, null]);
  });

  it('analyses several files in a row with one instance', async () => {
    const probe = new TimedProbe();
    try {
      for (const name of ['clip-gps.mp4', 'tone.mp3', 'live-photo.mov']) {
        const handle = await open(fixture(name));
        const size = (await handle.stat()).size;
        expect(readTimed(await probe.analyze(handle, size)).durationMs).toBeGreaterThan(0);
        await handle.close();
      }
    } finally {
      probe.close();
    }
  });
});

describe('moments', () => {
  it.each([
    ['2025-06-14 09:30:15+07:00', '2025-06-14T09:30:15+07:00', 420],
    ['2025-06-14 02:30:15 UTC', '2025-06-14T02:30:15Z', 0],
    ['2025-06-14 09:30:15', '2025-06-14T09:30:15Z', null],
    ['2025-06-14T09:30:15.5-03:30', '2025-06-14T09:30:15.5-03:30', -210],
  ])('reads %s', (raw, iso, offsetMin) => {
    expect(momentOf(raw, 'metadata')).toEqual({ iso, offsetMin, source: 'metadata' });
  });

  it.each([
    ['2019'],
    ['0000-00-00 00:00:00'],
    ['1904-01-01 00:00:00 UTC'],
    ['2025-13-40 25:61:61'],
    [null],
  ])('treats %s as no time', (raw) => {
    expect(momentOf(raw, 'container')).toBeNull();
  });
});

describe('routing by the first bytes', () => {
  it.each([
    ['exif-full.jpg', 'still'],
    ['exif-full.heic', 'still'],
    ['screenshot.png', 'still'],
    ['synthetic.arw', 'still'],
    ['clip-gps.mp4', 'timed'],
    ['live-photo.mov', 'timed'],
    ['tone.mp3', 'timed'],
  ] as const)('sends %s to the %s reader', (name, route) => {
    expect(routeOf(bytesOf(name).subarray(0, 12))).toBe(route);
  });

  it('ignores the file name', () => {
    expect(routeOf(Buffer.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]))).toBe(
      'still',
    );
  });
});

let bundleFolder = '';
let scannerScript = '';
let tree = '';
let drive: DriveFixture;
let media: DriveMediaRepository;
let logs: CapturedLogs;

beforeAll(async () => {
  bundleFolder = mkdtempSync(join(tmpdir(), 'metadata-bundle-'));
  scannerScript = join(bundleFolder, 'scanner-worker.mjs');
  await bundleWorker('scanner-worker.ts', scannerScript);
});

afterAll(() => {
  rmSync(bundleFolder, { recursive: true, force: true });
});

beforeEach(() => {
  logs = captureLogs();
  tree = mkdtempSync(join(tmpdir(), 'metadata-tree-'));
  drive = openDriveFixture();
  media = new DriveMediaRepository(drive.context);
  drive.addDrive(driveRoot(ROOT), tree);
});

afterEach(() => {
  drive.database.close();
  rmSync(tree, { recursive: true, force: true });
});

function place(name: string, as: string = name): void {
  mkdirSync(join(tree, as, '..'), { recursive: true });
  copyFileSync(fixture(name), join(tree, as));
}

async function scan(): Promise<void> {
  const env: ScanEnvironment = {
    store: {
      driveRoots: drive.roots,
      driveItems: drive.items,
      feed: drive.feed,
      write: (work) => drive.context.write(work),
      now: () => new Date(NOW),
    },
    availability: () => Promise.resolve('online'),
    workerScript: scannerScript,
    log: testLogger(),
  };
  await scanHandler(env)({ kind: 'scan', rootId: ROOT }, new AbortController().signal);
}

function environment(): MetadataEnvironment {
  return {
    store: {
      driveRoots: drive.roots,
      driveItems: drive.items,
      settingsKv: drive.settings,
      write: (work) => drive.context.write(work),
    },
    media,
    availability: () => Promise.resolve('online'),
    log: testLogger(),
  };
}

async function read(signal: AbortSignal = new AbortController().signal): Promise<void> {
  await metadataHandler(environment())({ kind: 'metadata', rootId: ROOT }, signal);
}

function indexed(path: string): DriveItem {
  const item = drive.items.byPath(ROOT, path, null);
  if (item === undefined) throw new Error(`${path} is not indexed`);
  return item;
}

describe('the metadata job', () => {
  it('records time, size, camera, place and duration on the items it reads', async () => {
    place('exif-full.jpg', 'photos/a.jpg');
    place('clip-gps.mp4', 'photos/b.mp4');
    place('tone.mp3', 'music/c.mp3');
    writeFileSync(join(tree, 'notes.txt'), 'plain');
    await scan();
    await read();
    const image = indexed('photos/a.jpg');
    const video = indexed('photos/b.mp4');
    const audio = indexed('music/c.mp3');
    if (image.kind !== 'image' || video.kind !== 'video' || audio.kind !== 'audio') {
      throw new Error('unexpected kinds');
    }
    expect(image.takenAt).toBe('2025-06-14T09:30:15.123+07:00');
    expect(image.camera?.model).toBe('ILCE-7M4');
    expect(image.place).toEqual({ lat: 13.7563, lon: 100.5018 });
    expect(image.rev).toBe(2);
    expect(video.takenAt).toBe('2025-06-14T02:30:15Z');
    expect(video.durationMs).toBe(1000);
    expect(audio.durationMs).toBeGreaterThan(1900);
    expect(audio.takenAt).not.toBeNull();
    expect(indexed('notes.txt').rev).toBe(1);
  });

  it('keeps the time source and offset in the media record of images and videos only', async () => {
    place('exif-full.jpg');
    place('live-photo.mov');
    place('plain.jpg');
    place('tone.mp3');
    await scan();
    await read();
    expect(media.byId(indexed('exif-full.jpg').id)).toMatchObject({
      time_source: 'metadata',
      tz_offset_min: 420,
      preview_state: 'none',
    });
    expect(media.byId(indexed('live-photo.mov').id)).toMatchObject({
      time_source: 'container',
      tz_offset_min: 420,
    });
    expect(media.byId(indexed('plain.jpg').id)).toMatchObject({
      time_source: 'modified',
      tz_offset_min: null,
    });
    expect(media.find(indexed('tone.mp3').id)).toBeUndefined();
  });

  it('falls back to the modified time and says so when the file has no time', async () => {
    place('plain.jpg');
    await scan();
    const before = indexed('plain.jpg');
    await read();
    const after = indexed('plain.jpg');
    expect(after.kind === 'image' ? after.takenAt : null).toBe(before.modifiedAt);
    expect(after.kind === 'image' ? [after.width, after.height] : null).toEqual([48, 32]);
  });

  it('records a file with nothing readable under the modified time and reads it only once', async () => {
    writeFileSync(join(tree, 'broken.jpg'), Buffer.from([0xff, 0xd8, 0xff, 0x00, 0x01]));
    writeFileSync(join(tree, 'broken.mp4'), 'x'.repeat(40));
    await scan();
    await read();
    const broken = indexed('broken.jpg');
    expect(broken.kind === 'image' ? broken.takenAt : null).toBe(broken.modifiedAt);
    expect(media.byId(broken.id).time_source).toBe('modified');
    expect(media.byId(indexed('broken.mp4').id).time_source).toBe('modified');
    expect(collectUnread(drive.items, ROOT)).toEqual([]);
    const rev = broken.rev;
    await read();
    expect(indexed('broken.jpg').rev).toBe(rev);
  });

  it('reads nothing twice', async () => {
    place('exif-full.jpg');
    await scan();
    await read();
    const rev = indexed('exif-full.jpg').rev;
    expect(collectUnread(drive.items, ROOT)).toEqual([]);
    await read();
    expect(indexed('exif-full.jpg').rev).toBe(rev);
  });

  it('reads a replaced file again after the scan resets it', async () => {
    place('plain.jpg', 'pic.jpg');
    await scan();
    await read();
    expect(media.byId(indexed('pic.jpg').id).time_source).toBe('modified');
    place('exif-full.jpg', 'pic.jpg');
    await scan();
    expect(collectUnread(drive.items, ROOT)).toHaveLength(1);
    await read();
    const replaced = indexed('pic.jpg');
    expect(replaced.kind === 'image' ? replaced.camera?.model : null).toBe('ILCE-7M4');
    expect(media.byId(replaced.id)).toMatchObject({ time_source: 'metadata', tz_offset_min: 420 });
  });

  it('skips a file that vanished before it was read and keeps it for the next run', async () => {
    place('exif-full.jpg');
    await scan();
    rmSync(join(tree, 'exif-full.jpg'));
    await read();
    expect(logs.events()).toContain('drive.metadata_skipped');
    expect(collectUnread(drive.items, ROOT)).toHaveLength(1);
  });

  it('reads nothing while indexing is paused', async () => {
    place('exif-full.jpg');
    await scan();
    updateDriveSettings(
      { settingsKv: drive.settings, write: (work) => drive.context.write(work) },
      { indexingPaused: true },
    );
    await read();
    expect(logs.events()).toContain('drive.metadata_paused');
    expect(collectUnread(drive.items, ROOT)).toHaveLength(1);
  });

  it('stops when told to and reads the rest later', async () => {
    place('exif-full.jpg');
    place('clip-gps.mp4');
    await scan();
    const controller = new AbortController();
    controller.abort();
    await read(controller.signal);
    expect(collectUnread(drive.items, ROOT)).toHaveLength(2);
    await read();
    expect(collectUnread(drive.items, ROOT)).toEqual([]);
  });

  it('reads nothing from a drive that is missing', async () => {
    place('exif-full.jpg');
    await scan();
    await metadataHandler({ ...environment(), availability: () => Promise.resolve('missing') })(
      { kind: 'metadata', rootId: ROOT },
      new AbortController().signal,
    );
    expect(collectUnread(drive.items, ROOT)).toHaveLength(1);
  });
});
