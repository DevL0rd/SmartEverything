import type { DriveRoot } from '@smarteverything/domain';
import type { TextEnvironment } from '../../src/drive/content/text-job';
import type { FolderIconStore } from '../../src/drive/content/folder-icon/refresh';
import type { DriveFolderIconsRepository } from '../../src/store/repositories/drive-folder-icons';
import type { MetadataEnvironment } from '../../src/drive/metadata';
import { readDriveSettings } from '../../src/drive/settings';
import { collectPending, recordMetadata, type MetadataParts } from '../../src/drive/units/metadata';
import { changedFolders, recordText, textBacklog } from '../../src/drive/units/text';
import { DriveFeedRepository } from '../../src/store/repositories/drive-feed';
import { DriveItemTextRepository } from '../../src/store/repositories/drive-item-text';
import { DriveMediaRepository } from '../../src/store/repositories/drive-media';
import { PhotoDescriptionsRepository } from '../../src/store/repositories/photo-descriptions';
import { PhotoDeviceZonesRepository } from '../../src/store/repositories/photo-device-zones';
import { PhotoMetaOverridesRepository } from '../../src/store/repositories/photo-meta-overrides';
import type { DriveFixture } from './drive-fixture';
import { scanEntryOf } from '../../src/drive/file-type';
import type { ScanEnvironment } from '../../src/drive/jobs';
import { ScanCommitter, type CommitDependencies } from '../../src/drive/scanner-commit';
import type { WalkEntry } from '../../src/drive/scanner-walk';
import type { ScanPort } from '../../src/drive/scan-port';
import {
  scanApply,
  scanBegin,
  scanEnd,
  scanIndexed,
  scanPlace,
  scanSettle,
  scanSweep,
} from '../../src/drive/units/scan';
import type { IndexReader } from '../../src/drive/watch-reflect';
import type { StoreContext } from '../../src/store/context';
import type { ChangeFeed } from '../../src/store/feed';
import { DriveInodesRepository } from '../../src/store/repositories/drive-inodes';
import type { DriveItemsRepository } from '../../src/store/repositories/drive-items';
import { DriveMissingRepository } from '../../src/store/repositories/drive-missing';
import type { DriveRootsRepository } from '../../src/store/repositories/drive-roots';

export interface LocalDrive {
  readonly roots: DriveRootsRepository;
  readonly items: DriveItemsRepository;
  readonly context: StoreContext;
  readonly feed: ChangeFeed;
  readonly now: () => Date;
}

function written(context: StoreContext): <T>(work: () => T) => Promise<T> {
  return (work) => Promise.resolve().then(() => context.write(work));
}

export function localScanPort(drive: LocalDrive): ScanPort {
  const store = {
    driveRoots: drive.roots,
    driveItems: drive.items,
    driveInodes: new DriveInodesRepository(drive.context),
    driveMissing: new DriveMissingRepository(drive.context),
    now: drive.now,
  };
  const run = written(drive.context);
  return {
    root: (rootId) => run(() => drive.roots.find(rootId)),
    update: (rootId, patch) => run(() => drive.roots.update(rootId, patch)),
    begin: (input) => run(() => scanBegin(store, input)),
    apply: (input) =>
      run(() => {
        scanApply(store, input);
      }),
    settle: (input) => run(() => scanSettle(store, input)),
    place: (input) =>
      run(() => {
        scanPlace(store, input);
      }),
    sweep: (input) => run(() => scanSweep(store, input)),
    end: (input) =>
      run(() => {
        scanEnd(store, input);
      }),
  };
}

export function localScans(drive: LocalDrive): Pick<ScanEnvironment, 'scans' | 'feed' | 'now'> {
  return { scans: localScanPort(drive), feed: drive.feed, now: drive.now };
}

export function localIndex(drive: Pick<LocalDrive, 'items' | 'context'>): IndexReader {
  const store = { driveItems: drive.items, driveInodes: new DriveInodesRepository(drive.context) };
  return (rootId, relPaths) => Promise.resolve(scanIndexed(store, { rootId, relPaths }));
}

export interface TestScanDeps extends CommitDependencies {
  readonly hash: (entry: WalkEntry) => Promise<string | null>;
  readonly write: <T>(work: () => T) => T;
}

export class TestScan {
  private readonly committer: ScanCommitter;

  constructor(
    private readonly deps: TestScanDeps,
    root: DriveRoot,
    scopes: readonly string[] | null,
  ) {
    this.committer = deps.write(() => new ScanCommitter(deps, root, scopes));
  }

  get previous(): number {
    return this.committer.previous;
  }

  apply(entries: readonly WalkEntry[]): void {
    this.deps.write(() => {
      this.committer.apply(entries.map(scanEntryOf));
    });
  }

  async finish(unreadable: readonly string[]): Promise<void> {
    const wanted = this.deps.write(() => this.committer.settle(unreadable));
    const hashes: (string | null)[] = [];
    for (const entry of wanted) hashes.push(await this.deps.hash(entry));
    this.deps.write(() => {
      this.committer.place(hashes);
    });
    while (this.deps.write(() => this.committer.sweep()));
  }
}

export function localMetadata(
  drive: DriveFixture,
  hubZone: string,
  given: Partial<Pick<MetadataParts, 'media' | 'overrides' | 'descriptions'>> = {},
): Pick<
  MetadataEnvironment,
  'root' | 'settings' | 'hubZone' | 'pending' | 'record' | 'latestSeq' | 'feed'
> {
  const parts: MetadataParts = {
    items: drive.items,
    descriptions: given.descriptions ?? new PhotoDescriptionsRepository(drive.context),
    overrides: given.overrides ?? new PhotoMetaOverridesRepository(drive.context),
    media: given.media ?? new DriveMediaRepository(drive.context),
    deviceZones: new PhotoDeviceZonesRepository(drive.context),
  };
  const run = written(drive.context);
  return {
    root: (rootId) => run(() => drive.roots.find(rootId)),
    settings: () => run(() => readDriveSettings({ settingsKv: drive.settings })),
    hubZone: () => Promise.resolve(hubZone),
    pending: (rootId) => run(() => collectPending(parts, rootId)),
    record: (input) => run(() => recordMetadata(parts, input)),
    latestSeq: () => run(() => new DriveFeedRepository(drive.context).latestSeq()),
    feed: drive.feed,
  };
}

export function localText(
  drive: DriveFixture,
  items: DriveItemsRepository = drive.items,
): Pick<
  TextEnvironment,
  'root' | 'settings' | 'latestSeqInRoot' | 'backlog' | 'changedFolders' | 'record' | 'feed'
> {
  const store = {
    driveItems: items,
    driveItemText: new DriveItemTextRepository(drive.context),
    driveFeed: new DriveFeedRepository(drive.context),
  };
  const run = written(drive.context);
  return {
    root: (rootId) => run(() => drive.roots.find(rootId)),
    settings: () => run(() => readDriveSettings({ settingsKv: drive.settings })),
    latestSeqInRoot: (rootId) => run(() => store.driveFeed.latestSeqInRoot(rootId)),
    backlog: (input) => run(() => textBacklog(store, input)),
    changedFolders: (input) => run(() => changedFolders(store, input)),
    record: (input) => run(() => recordText(store, input)),
    feed: drive.feed,
  };
}

export function localFolderIcons(
  drive: DriveFixture,
  icons: DriveFolderIconsRepository,
  items: DriveItemsRepository = drive.items,
): FolderIconStore {
  const run = written(drive.context);
  const feed = new DriveFeedRepository(drive.context);
  return {
    children: (query) => run(() => items.children(query)),
    find: (folderItemId) => run(() => icons.find(folderItemId)),
    set: (input) => run(() => icons.set(input)),
    clear: (folderItemId) => run(() => icons.clear(folderItemId)),
    latestSeq: () => run(() => feed.latestSeq()),
  };
}
