import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { scanHandler, type ScanEnvironment } from '../../../src/drive/jobs';
import { DriveRootLanes } from '../../../src/drive/root-lanes';
import { DriveInodesRepository } from '../../../src/store/repositories/drive-inodes';
import { DriveFeedRepository } from '../../../src/store/repositories/drive-feed';
import { metadataHandler, type MetadataEnvironment } from '../../../src/drive/metadata';
import type { MediaFacts } from '../../../src/drive/metadata-read';
import { overrideFacts } from '../../../src/photos/organise/override';
import { DriveMediaRepository } from '../../../src/store/repositories/drive-media';
import { PhotoMetaOverridesRepository } from '../../../src/store/repositories/photo-meta-overrides';
import { testLogger } from '../../support/logs';
import {
  bundleWorker,
  driveRoot,
  NOW,
  openDriveFixture,
  type DriveFixture,
} from '../../drive/drive-fixture';

const ROOT = '0d000000-0000-4000-8000-000000000002';

const fixture = (name: string): string =>
  fileURLToPath(new URL(`../../fixtures/drive-media/${name}`, import.meta.url));

let bundleFolder = '';
let scannerScript = '';
let tree = '';
let drive: DriveFixture;
let media: DriveMediaRepository;
let overrides: PhotoMetaOverridesRepository;

beforeAll(async () => {
  bundleFolder = mkdtempSync(join(tmpdir(), 'override-bundle-'));
  scannerScript = join(bundleFolder, 'scanner-worker.mjs');
  await bundleWorker('scanner-worker.ts', scannerScript);
});

afterAll(() => {
  rmSync(bundleFolder, { recursive: true, force: true });
});

beforeEach(() => {
  tree = mkdtempSync(join(tmpdir(), 'override-tree-'));
  drive = openDriveFixture();
  media = new DriveMediaRepository(drive.context);
  overrides = new PhotoMetaOverridesRepository(drive.context);
  drive.addDrive(driveRoot(ROOT), tree);
  mkdirSync(join(tree, 'photos'), { recursive: true });
  copyFileSync(fixture('exif-full.jpg'), join(tree, 'photos', 'a.jpg'));
});

afterEach(() => {
  drive.database.close();
  rmSync(tree, { recursive: true, force: true });
});

async function scanAndRead(): Promise<void> {
  const scan: ScanEnvironment = {
    store: {
      driveRoots: drive.roots,
      driveItems: drive.items,
      driveInodes: new DriveInodesRepository(drive.context),
      feed: drive.feed,
      write: (work) => drive.context.write(work),
      now: () => new Date(NOW),
    },
    availability: () => Promise.resolve('online'),
    mounted: (): boolean => false,
    workerScript: scannerScript,
    lanes: new DriveRootLanes(),
    log: testLogger(),
  };
  await scanHandler(scan)({ kind: 'scan', rootId: ROOT }, new AbortController().signal);
  const read: MetadataEnvironment = {
    store: {
      driveRoots: drive.roots,
      driveItems: drive.items,
      settingsKv: drive.settings,
      photoMetaOverrides: overrides,
      write: (work) => drive.context.write(work),
      feed: drive.feed,
      driveFeed: new DriveFeedRepository(drive.context),
    },
    media,
    availability: () => Promise.resolve('online'),
    log: testLogger(),
  };
  await metadataHandler(read)({ kind: 'metadata', rootId: ROOT }, new AbortController().signal);
}

function indexedId(): string {
  const item = drive.items.byPath(ROOT, 'photos/a.jpg', null);
  if (item === undefined) throw new Error('The photo is not indexed');
  return item.id;
}

function forgetRead(): void {
  drive.context.sql.run(
    'drop the read metadata so the photo is read again',
    'update drive_items set taken_at = null where id = $id',
    { id: indexedId() },
  );
}

describe('metadata overrides on a read', () => {
  it('the file facts win nothing over an edited date and location', async () => {
    await scanAndRead();
    overrides.set({
      itemId: indexedId(),
      takenAt: '2030-01-02T03:04:05.000Z',
      tzOffsetMin: -300,
      latitude: 41.1,
      longitude: -8.6,
      placeLabel: null,
      locationCleared: false,
      setBy: null,
    });
    forgetRead();
    await scanAndRead();
    const item = drive.items.byId(indexedId(), null);
    expect(item).toMatchObject({
      takenAt: '2030-01-02T03:04:05.000Z',
      place: { lat: 41.1, lon: -8.6 },
    });
    expect(media.byId(indexedId())).toMatchObject({ time_source: 'manual', tz_offset_min: -300 });
  });

  it('keeps the file location when only the date is edited, and the file date for a location edit', async () => {
    await scanAndRead();
    overrides.set({
      itemId: indexedId(),
      takenAt: '2030-01-02T03:04:05.000Z',
      tzOffsetMin: 0,
      latitude: null,
      longitude: null,
      placeLabel: null,
      locationCleared: false,
      setBy: null,
    });
    forgetRead();
    await scanAndRead();
    expect(drive.items.byId(indexedId(), null)).toMatchObject({
      takenAt: '2030-01-02T03:04:05.000Z',
      place: { lat: 13.7563, lon: 100.5018 },
    });
    overrides.set({
      itemId: indexedId(),
      takenAt: null,
      tzOffsetMin: null,
      latitude: 1,
      longitude: 2,
      placeLabel: null,
      locationCleared: false,
      setBy: null,
    });
    forgetRead();
    await scanAndRead();
    expect(drive.items.byId(indexedId(), null)).toMatchObject({
      takenAt: '2025-06-14T09:30:15.123+07:00',
      place: { lat: 1, lon: 2 },
    });
    expect(media.byId(indexedId())).toMatchObject({ time_source: 'metadata', tz_offset_min: 420 });
  });
});

describe('overrideFacts', () => {
  const facts: MediaFacts = {
    takenAt: { iso: '2025-06-14T09:30:15.123+07:00', offsetMin: 420, source: 'metadata' },
    width: 1,
    height: 1,
    orientation: null,
    camera: null,
    exposure: null,
    place: { lat: 3, lon: 4 },
    durationMs: null,
  };

  it('returns the file facts untouched without an override', () => {
    expect(overrideFacts(facts, undefined)).toBe(facts);
  });

  it('drops the file location when the override records it as cleared', () => {
    expect(
      overrideFacts(facts, {
        itemId: 'x',
        takenAt: null,
        tzOffsetMin: null,
        latitude: null,
        longitude: null,
        placeLabel: null,
        locationCleared: true,
        setBy: null,
        setAt: NOW,
      }),
    ).toMatchObject({ place: null });
  });

  it('keeps the source of facts that carried none for a file without a time', () => {
    const bare: MediaFacts = { ...facts, takenAt: null, place: null };
    expect(
      overrideFacts(bare, {
        itemId: 'x',
        takenAt: '2030-01-01T00:00:00.000Z',
        tzOffsetMin: null,
        latitude: null,
        longitude: null,
        placeLabel: null,
        locationCleared: false,
        setBy: null,
        setAt: NOW,
      }),
    ).toMatchObject({
      takenAt: { iso: '2030-01-01T00:00:00.000Z', offsetMin: null, source: 'metadata' },
      place: null,
    });
  });
});
