import { copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { scanHandler } from '../../src/drive/jobs';
import { metadataHandler } from '../../src/drive/metadata';
import { zonePicker } from '../../src/drive/metadata-zone';
import { DriveRootLanes } from '../../src/drive/root-lanes';
import { DriveFeedRepository } from '../../src/store/repositories/drive-feed';
import { DriveInodesRepository } from '../../src/store/repositories/drive-inodes';
import { DriveMediaRepository } from '../../src/store/repositories/drive-media';
import { DriveMissingRepository } from '../../src/store/repositories/drive-missing';
import { PhotoDescriptionsRepository } from '../../src/store/repositories/photo-descriptions';
import { PhotoDeviceZonesRepository } from '../../src/store/repositories/photo-device-zones';
import { PhotoMetaOverridesRepository } from '../../src/store/repositories/photo-meta-overrides';
import { captureLogs, testLogger, type CapturedLogs } from '../support/logs';
import {
  bundleMetadataWorker,
  bundleWorker,
  driveRoot,
  NOW,
  openDriveFixture,
  type BundledWorker,
  type DriveFixture,
} from './drive-fixture';

const ROOT = '0d000000-0000-4000-8000-000000000004';
const HUB_ZONE = 'America/New_York';

let bundleFolder = '';
let scannerScript = '';
let metadataWorker: BundledWorker;
let tree = '';
let drive: DriveFixture;
let logs: CapturedLogs;

beforeAll(async () => {
  bundleFolder = mkdtempSync(join(tmpdir(), 'zone-bundle-'));
  scannerScript = join(bundleFolder, 'scanner-worker.mjs');
  await bundleWorker('scanner-worker.ts', scannerScript);
  metadataWorker = await bundleMetadataWorker();
});

afterAll(() => {
  rmSync(bundleFolder, { recursive: true, force: true });
  metadataWorker.dispose();
});

beforeEach(() => {
  logs = captureLogs();
  tree = mkdtempSync(join(tmpdir(), 'zone-tree-'));
  drive = openDriveFixture();
  drive.addDrive(driveRoot(ROOT), tree);
});

afterEach(() => {
  drive.database.close();
  rmSync(tree, { recursive: true, force: true });
});

function place(name: string, as: string): void {
  copyFileSync(
    fileURLToPath(new URL(`../fixtures/drive-media/${name}`, import.meta.url)),
    join(tree, as),
  );
}

async function scanAndRead(): Promise<void> {
  const signal = new AbortController().signal;
  await scanHandler({
    store: {
      driveRoots: drive.roots,
      driveItems: drive.items,
      driveInodes: new DriveInodesRepository(drive.context),
      driveMissing: new DriveMissingRepository(drive.context),
      feed: drive.feed,
      write: (work) => drive.context.write(work),
      now: () => new Date(NOW),
    },
    availability: () => Promise.resolve('online'),
    mounted: (): boolean => false,
    workerScript: scannerScript,
    lanes: new DriveRootLanes(),
    log: testLogger(),
  })({ kind: 'scan', rootId: ROOT }, signal);
  await metadataHandler({
    store: {
      driveRoots: drive.roots,
      driveItems: drive.items,
      settingsKv: drive.settings,
      photoMetaOverrides: new PhotoMetaOverridesRepository(drive.context),
      photoDescriptions: new PhotoDescriptionsRepository(drive.context),
      write: (work) => drive.context.write(work),
      feed: drive.feed,
      driveFeed: new DriveFeedRepository(drive.context),
    },
    media: new DriveMediaRepository(drive.context),
    availability: () => Promise.resolve('online'),
    zones: zonePicker(new PhotoDeviceZonesRepository(drive.context), () => HUB_ZONE),
    workerScript: metadataWorker.script,
    log: testLogger(),
  })({ kind: 'metadata', rootId: ROOT }, signal);
}

function takenAt(path: string): string | null {
  const item = drive.items.byPath(ROOT, path, null);
  if (item?.kind !== 'image') throw new Error(`${path} is no indexed image`);
  return item.takenAt;
}

function zoneLogs(): readonly unknown[] {
  return logs.records
    .filter((record) => record.event === 'drive.metadata_zone')
    .map(({ payload }) => payload);
}

describe('the zone of a photo time without one', () => {
  it('takes the zone of the GPS location before anything else', async () => {
    place('zoneless-gps.jpg', 'a.jpg');
    await scanAndRead();
    expect(takenAt('a.jpg')).toBe('2025-06-14T09:30:15.123+07:00');
    expect(zoneLogs()).toEqual([
      { rootId: ROOT, relPath: 'a.jpg', zone: 'Asia/Bangkok', source: 'gps' },
    ]);
  });

  it('takes the zone the same camera was in, even when its photo is read later in the run', async () => {
    place('zoneless.jpg', 'a.jpg');
    place('exif-full.jpg', 'b.jpg');
    await scanAndRead();
    expect(takenAt('a.jpg')).toBe('2025-06-14T09:30:15.123+07:00');
    expect(zoneLogs()).toEqual([
      { rootId: ROOT, relPath: 'a.jpg', zone: 'Asia/Bangkok', source: 'device' },
    ]);
  });

  it('falls to the Hub zone and says so when neither GPS nor the device tells', async () => {
    place('zoneless.jpg', 'a.jpg');
    await scanAndRead();
    expect(takenAt('a.jpg')).toBe('2025-06-14T09:30:15.123-04:00');
    expect(zoneLogs()).toEqual([{ rootId: ROOT, relPath: 'a.jpg', zone: HUB_ZONE, source: 'hub' }]);
  });
});
