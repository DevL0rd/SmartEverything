import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DriveItem } from '@smarteverything/domain';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { scanHandler, type ScanEnvironment } from '../../src/drive/jobs';
import { metadataHandler } from '../../src/drive/metadata';
import { readStill } from '../../src/drive/metadata-read';
import { DriveRootLanes } from '../../src/drive/root-lanes';
import { PhotoDescriptionsRepository } from '../../src/store/repositories/photo-descriptions';
import { testLogger } from '../support/logs';
import {
  bundleMetadataWorker,
  bundleWorker,
  driveRoot,
  NOW,
  openDriveFixture,
  type BundledWorker,
  type DriveFixture,
} from './drive-fixture';
import { localMetadata, localScans } from './local-ports';

const ROOT = '0d000000-0000-4000-8000-000000000003';

const fixture = (name: string): string =>
  fileURLToPath(new URL(`../fixtures/drive-media/${name}`, import.meta.url));

describe('reading the description of a still', () => {
  it('prefers XMP, then EXIF, then IPTC, and gives nothing without one', () => {
    const of = (name: string): string | null => readStill(readFileSync(fixture(name))).description;
    expect(of('description-all.jpg')).toBe('Sunset at the harbour');
    expect(of('description-exif.jpg')).toBe('Grandma’s birthday cake');
    expect(of('description-iptc.jpg')).toBe('Iptc only');
    expect(of('plain.jpg')).toBeNull();
    expect(of('exif-full.jpg')).toBe('probe');
  });
});

let bundleFolder = '';
let scannerScript = '';
let metadataWorker: BundledWorker;
let tree = '';
let drive: DriveFixture;
let descriptions: PhotoDescriptionsRepository;

beforeAll(async () => {
  bundleFolder = mkdtempSync(join(tmpdir(), 'description-bundle-'));
  scannerScript = join(bundleFolder, 'scanner-worker.mjs');
  await bundleWorker('scanner-worker.ts', scannerScript);
  metadataWorker = await bundleMetadataWorker();
});

afterAll(() => {
  rmSync(bundleFolder, { recursive: true, force: true });
  metadataWorker.dispose();
});

beforeEach(() => {
  tree = mkdtempSync(join(tmpdir(), 'description-tree-'));
  drive = openDriveFixture();
  descriptions = new PhotoDescriptionsRepository(drive.context);
  drive.addDrive(driveRoot(ROOT), tree);
});

afterEach(() => {
  drive.database.close();
  rmSync(tree, { recursive: true, force: true });
});

function place(name: string, as: string): void {
  mkdirSync(join(tree, as, '..'), { recursive: true });
  copyFileSync(fixture(name), join(tree, as));
}

async function scan(): Promise<void> {
  const env: ScanEnvironment = {
    ...localScans({
      roots: drive.roots,
      items: drive.items,
      context: drive.context,
      feed: drive.feed,
      now: () => new Date(NOW),
    }),
    availability: () => Promise.resolve('online'),
    mounted: () => Promise.resolve(false),
    workerScript: scannerScript,
    lanes: new DriveRootLanes(),
    log: testLogger(),
  };
  await scanHandler(env)({ kind: 'scan', rootId: ROOT }, new AbortController().signal);
}

async function read(): Promise<void> {
  await metadataHandler({
    ...localMetadata(drive, 'Asia/Bangkok', { descriptions }),
    availability: () => Promise.resolve('online'),
    workerScript: metadataWorker.script,
    log: testLogger(),
  })({ kind: 'metadata', rootId: ROOT }, new AbortController().signal);
}

function indexed(path: string): DriveItem {
  const item = drive.items.byPath(ROOT, path, null);
  if (item === undefined) throw new Error(`${path} is not indexed`);
  return item;
}

function backlog(): readonly string[] {
  return descriptions.pending(ROOT).map((one) => one.id);
}

describe('descriptions in the metadata job', () => {
  it('keeps the description of a new photo as read from the file', async () => {
    place('description-all.jpg', 'a.jpg');
    place('plain.jpg', 'b.jpg');
    await scan();
    await read();
    expect(descriptions.find(indexed('a.jpg').id)).toEqual({
      text: 'Sunset at the harbour',
      source: 'file',
    });
    expect(descriptions.find(indexed('b.jpg').id)).toBeUndefined();
  });

  it('reads the description of an already read photo once from the backlog without touching it', async () => {
    place('description-exif.jpg', 'a.jpg');
    await scan();
    await read();
    const before = indexed('a.jpg');
    drive.database.prepare('delete from photo_descriptions').run();
    drive.database
      .prepare('insert into photo_description_backlog (item_id) values (?)')
      .run(before.id);
    expect(backlog()).toEqual([before.id]);
    await read();
    expect(descriptions.find(before.id)?.text).toBe('Grandma’s birthday cake');
    expect(indexed('a.jpg')).toEqual(before);
    expect(backlog()).toEqual([]);
  });

  it('never replaces a description written by hand, cleared ones included', async () => {
    const profile = drive.profiles.create({ name: 'Robin' }).id;
    place('description-all.jpg', 'a.jpg');
    place('description-iptc.jpg', 'b.jpg');
    await scan();
    const a = indexed('a.jpg').id;
    const b = indexed('b.jpg').id;
    drive.context.write(() => {
      descriptions.setManual({ itemId: a, text: 'Our boat', setBy: profile });
      descriptions.setManual({ itemId: b, text: null, setBy: profile });
    });
    await read();
    expect(descriptions.find(a)).toEqual({ text: 'Our boat', source: 'manual' });
    expect(descriptions.find(b)).toEqual({ text: null, source: 'manual' });
  });
});
