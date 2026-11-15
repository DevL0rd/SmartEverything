import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DriveItem } from '@smarteverything/domain';
import { build } from 'esbuild';
import sharp from 'sharp';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { scanHandler, type ScanEnvironment } from '../../../src/drive/jobs';
import { DriveInodesRepository } from '../../../src/store/repositories/drive-inodes';
import {
  collectTextBacklog,
  textHandler,
  textTrigger,
  type TextEnvironment,
} from '../../../src/drive/content/text-job';
import {
  FolderIconRefresher,
  folderIconFile,
} from '../../../src/drive/content/folder-icon/refresh';
import { DriveSearch } from '../../../src/drive/search';
import { updateDriveSettings } from '../../../src/drive/settings';
import { DriveFeedRepository } from '../../../src/store/repositories/drive-feed';
import { DriveFolderIconsRepository } from '../../../src/store/repositories/drive-folder-icons';
import { DriveItemTextRepository } from '../../../src/store/repositories/drive-item-text';
import { DriveMediaRepository } from '../../../src/store/repositories/drive-media';
import { testLogger } from '../../support/logs';
import { driveRoot, NOW, openDriveFixture, type DriveFixture } from '../drive-fixture';
import { zipOf, pngOf, solid } from './builders';

const ROOT = '0d000000-0000-4000-8000-000000000002';

const SCANNER_SOURCE = fileURLToPath(
  new URL('../../../src/drive/scanner-worker.ts', import.meta.url),
);

const CONTENT_SOURCE = fileURLToPath(
  new URL('../../../src/drive/content/content-worker.ts', import.meta.url),
);

const BUNDLE_BASE = fileURLToPath(
  new URL('../../../../../tmp/drive-content-test/', import.meta.url),
);

const BUNDLE_BANNER =
  'import { createRequire as createServiceRequire } from "node:module"; import { fileURLToPath as serviceFileUrlToPath } from "node:url"; import { dirname as serviceDirname } from "node:path"; const require = createServiceRequire(import.meta.url); const __filename = serviceFileUrlToPath(import.meta.url); const __dirname = serviceDirname(__filename);';

let bundleFolder = '';
let scannerScript = '';
let contentScript = '';
let tree = '';
let previews = '';
let derived = '';
let languages = '';
let fixture: DriveFixture;
let texts: DriveItemTextRepository;
let icons: DriveFolderIconsRepository;
let media: DriveMediaRepository;
let driveFeed: DriveFeedRepository;
let progress: string[];
let changed: number;

beforeAll(async () => {
  mkdirSync(BUNDLE_BASE, { recursive: true });
  bundleFolder = mkdtempSync(join(BUNDLE_BASE, 'bundle-'));
  scannerScript = join(bundleFolder, 'scanner-worker.mjs');
  contentScript = join(bundleFolder, 'content-worker.mjs');
  await build({
    entryPoints: [SCANNER_SOURCE],
    outfile: scannerScript,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node24',
    logLevel: 'silent',
  });
  await build({
    entryPoints: [CONTENT_SOURCE],
    outfile: contentScript,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node24',
    external: ['sharp', 'tesseract.js'],
    banner: { js: BUNDLE_BANNER },
    logLevel: 'silent',
  });
});

afterAll(() => {
  rmSync(BUNDLE_BASE, { recursive: true, force: true });
});

beforeEach(() => {
  tree = mkdtempSync(join(tmpdir(), 'text-tree-'));
  previews = mkdtempSync(join(tmpdir(), 'text-previews-'));
  derived = mkdtempSync(join(tmpdir(), 'text-derived-'));
  languages = mkdtempSync(join(tmpdir(), 'text-languages-'));
  fixture = openDriveFixture();
  fixture.addDrive(driveRoot(ROOT), tree);
  texts = new DriveItemTextRepository(fixture.context);
  icons = new DriveFolderIconsRepository(fixture.context);
  media = new DriveMediaRepository(fixture.context);
  driveFeed = new DriveFeedRepository(fixture.context);
  progress = [];
  changed = 0;
  fixture.feed.subscribeNotices((notice) => {
    if (notice.type === 'drive_progress')
      progress.push(`${notice.phase}:${String(notice.done)}/${String(notice.total)}`);
    if (notice.type === 'drive_changed') changed += 1;
  });
});

afterEach(() => {
  fixture.database.close();
  for (const path of [tree, previews, derived, languages])
    rmSync(path, { recursive: true, force: true });
});

function put(path: string, content: string | Buffer): void {
  const full = join(tree, path);
  mkdirSync(join(full, '..'), { recursive: true });
  writeFileSync(full, content);
}

function indexed(path: string): DriveItem {
  const item = fixture.items.byPath(ROOT, path, null);
  if (item === undefined) throw new Error(`${path} is not indexed`);
  return item;
}

const signal = (): AbortSignal => new AbortController().signal;

async function scan(): Promise<void> {
  const env: ScanEnvironment = {
    store: {
      driveRoots: fixture.roots,
      driveItems: fixture.items,
      driveInodes: new DriveInodesRepository(fixture.context),
      feed: fixture.feed,
      write: (work) => fixture.context.write(work),
      now: () => new Date(NOW),
    },
    availability: () => Promise.resolve('online'),
    mounted: (): boolean => false,
    workerScript: scannerScript,
    log: testLogger(),
  };
  await scanHandler(env)({ kind: 'scan', rootId: ROOT }, signal());
}

function textEnvironment(): TextEnvironment {
  const refresher = new FolderIconRefresher({
    store: {
      driveItems: fixture.items,
      driveFolderIcons: icons,
      driveFeed,
      feed: fixture.feed,
    },
    derivedDirectory: (): string => derived,
    log: testLogger(),
  });
  return {
    store: {
      driveRoots: fixture.roots,
      driveItems: fixture.items,
      driveItemText: texts,
      settingsKv: fixture.settings,
      feed: fixture.feed,
      write: (work) => fixture.context.write(work),
    },
    media,
    availability: () => Promise.resolve('online'),
    workerScript: contentScript,
    previewPath: (itemId, rev) => join(previews, `${itemId}-${String(rev)}.png`),
    languageDirectory: languages,
    icons: refresher,
    log: testLogger(),
  };
}

async function readText(): Promise<void> {
  await textHandler(textEnvironment())({ kind: 'text', rootId: ROOT }, signal());
}

async function readyPreview(path: string, words: string): Promise<void> {
  const item = indexed(path);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="220"><rect width="900" height="220" fill="white"/><text x="20" y="140" font-size="80" font-family="DejaVu Sans" fill="black">${words}</text></svg>`;
  await sharp(Buffer.from(svg))
    .png()
    .toFile(join(previews, `${item.id}-${String(item.rev)}.png`));
  media.save({
    item_id: item.id,
    time_source: 'modified',
    tz_offset_min: null,
    thumbhash: null,
    preview_state: 'ready',
    preview_reason: null,
    poster_state: 'none',
    poster_reason: null,
    playable_state: 'none',
    playable_reason: null,
    motion_clip_id: null,
    live_id: null,
    burst_id: null,
    stem_key: null,
    stack_id: null,
    place_id: null,
  });
}

function stateOf(path: string): string | undefined {
  const row = texts.find(indexed(path).id);
  return row === undefined ? undefined : `${row.source}:${row.state}`;
}

function searchFor(text: string): string[] {
  const search = new DriveSearch(fixture.context);
  const profile = fixture.profiles.create({ name: 'Robin' }).id;
  return search
    .search(
      { profileId: profile },
      {
        text,
        match: 'all',
        rootId: null,
        folderId: null,
        kinds: null,
        starred: null,
        duration: null,
        taken: null,
        sort: { field: 'name', direction: 'asc' },
        cursor: null,
      },
      100,
    )
    .items.map((item) => item.name);
}

describe('reading the text of a drive', () => {
  it('reads each kind of file in one run and records what it could not read', async () => {
    put('notes.txt', 'The lighthouse keeper writes home.');
    put(
      'letter.docx',
      zipOf([
        { name: 'word/document.xml', data: '<w:p><w:r><w:t>harbour budget</w:t></w:r></w:p>' },
      ]),
    );
    put('clip.mp4', 'not really a video');
    put('blank.txt', '   ');
    put('broken.pdf', 'not a pdf');
    await scan();
    await readText();
    expect(stateOf('notes.txt')).toBe('document:ok');
    expect(stateOf('letter.docx')).toBe('document:ok');
    expect(stateOf('clip.mp4')).toBe('document:unsupported');
    expect(stateOf('blank.txt')).toBe('document:empty');
    expect(stateOf('broken.pdf')).toBe('document:failed');
    expect(searchFor('lighthouse')).toEqual(['notes.txt']);
    expect(searchFor('harbour')).toEqual(['letter.docx']);
    expect(progress.at(-1)).toBe('text:5/5');
  });

  it('reads the words in a picture from its preview, and waits while there is no preview', async () => {
    const image = await sharp({
      create: { width: 10, height: 10, channels: 3, background: 'white' },
    })
      .png()
      .toBuffer();
    put('sign.png', image);
    await scan();
    await readText();
    expect(stateOf('sign.png')).toBeUndefined();
    await readyPreview('sign.png', 'Invoice lighthouse');
    await readText();
    expect(stateOf('sign.png')).toBe('image:ok');
    expect(searchFor('lighthouse')).toEqual(['sign.png']);
  }, 60_000);

  it('records a picture whose preview failed as unsupported', async () => {
    put('bad.png', 'not an image');
    await scan();
    const item = indexed('bad.png');
    media.save({
      item_id: item.id,
      time_source: 'modified',
      tz_offset_min: null,
      thumbhash: null,
      preview_state: 'failed',
      preview_reason: 'bad image',
      poster_state: 'none',
      poster_reason: null,
      playable_state: 'none',
      playable_reason: null,
      motion_clip_id: null,
      live_id: null,
      burst_id: null,
      stem_key: null,
      stack_id: null,
      place_id: null,
    });
    await readText();
    expect(stateOf('bad.png')).toBe('document:unsupported');
  });

  it('reads a file again only after its revision changes', async () => {
    put('notes.txt', 'first words');
    await scan();
    await readText();
    const before = texts.find(indexed('notes.txt').id);
    expect(
      collectTextBacklog({ store: textEnvironment().store, media }, fixture.roots.byId(ROOT)).work,
    ).toEqual([]);
    put('notes.txt', 'second words here');
    utimesSync(
      join(tree, 'notes.txt'),
      new Date('2026-11-08T00:00:00Z'),
      new Date('2026-11-08T00:00:00Z'),
    );
    await scan();
    const stale = collectTextBacklog(
      { store: textEnvironment().store, media },
      fixture.roots.byId(ROOT),
    );
    expect(stale.work.map((work) => work.item.name)).toEqual(['notes.txt']);
    await readText();
    const after = texts.find(indexed('notes.txt').id);
    expect(after?.rev).toBeGreaterThan(before?.rev ?? 0);
    expect(searchFor('second')).toEqual(['notes.txt']);
    expect(searchFor('first')).toEqual([]);
  });

  it('starts nothing when content indexing is off and keeps the index it has', async () => {
    put('old.txt', 'kept words');
    await scan();
    await readText();
    updateDriveSettings(
      { settingsKv: fixture.settings, write: (work) => fixture.context.write(work) },
      { contentIndexing: false },
    );
    put('new.txt', 'unread words');
    await scan();
    await readText();
    expect(stateOf('new.txt')).toBeUndefined();
    expect(searchFor('kept')).toEqual(['old.txt']);
    expect(searchFor('unread')).toEqual([]);
    updateDriveSettings(
      { settingsKv: fixture.settings, write: (work) => fixture.context.write(work) },
      { contentIndexing: true },
    );
    await readText();
    expect(searchFor('unread')).toEqual(['new.txt']);
  });

  it('starts nothing while indexing is paused', async () => {
    put('a.txt', 'paused words');
    await scan();
    updateDriveSettings(
      { settingsKv: fixture.settings, write: (work) => fixture.context.write(work) },
      { indexingPaused: true },
    );
    await readText();
    expect(stateOf('a.txt')).toBeUndefined();
  });

  it('is started again by a drive change notice for each changed drive', () => {
    const roots: string[] = [];
    const stop = textTrigger(fixture.feed, (rootId) => roots.push(rootId));
    fixture.feed.notice({
      type: 'drive_changed',
      rootIds: [ROOT, '0d000000-0000-4000-8000-000000000009'],
      folderIds: [],
      albumIds: [],
      months: [],
      cursor: 0,
    });
    fixture.feed.notice({ type: 'drive_progress', rootId: ROOT, phase: 'scan', done: 1, total: 1 });
    stop();
    expect(roots).toEqual([ROOT, '0d000000-0000-4000-8000-000000000009']);
  });
});

describe('folder icons during the job', () => {
  it('records an icon file in a folder, serves it from the cache and announces it', async () => {
    const icon = await pngOf(8, 8, solid(8, 8, [255, 0, 0, 255]));
    put('trips/folder.png', icon);
    put('trips/readme.txt', 'x');
    await scan();
    changed = 0;
    await readText();
    const folder = indexed('trips');
    const row = icons.find(folder.id);
    expect(row).toMatchObject({ source: 'named_file', sourceRelPath: 'trips/folder.png' });
    expect(
      existsSync(
        folderIconFile({ derivedDirectory: () => derived }, folder.id, row?.imageSha256 ?? ''),
      ),
    ).toBe(true);
    expect(changed).toBe(1);
    expect(fixture.items.find(folder.id, null)).toBeDefined();
  });

  it('clears the icon and its cached image when the icon file goes away', async () => {
    put('trips/folder.png', await pngOf(8, 8, solid(8, 8, [0, 255, 0, 255])));
    await scan();
    await readText();
    const folder = indexed('trips');
    const sha = icons.find(folder.id)?.imageSha256 ?? '';
    rmSync(join(tree, 'trips', 'folder.png'));
    utimesSync(
      join(tree, 'trips'),
      new Date('2026-11-09T00:00:00Z'),
      new Date('2026-11-09T00:00:00Z'),
    );
    await scan();
    await readText();
    expect(icons.find(folder.id)).toBeUndefined();
    expect(existsSync(folderIconFile({ derivedDirectory: () => derived }, folder.id, sha))).toBe(
      false,
    );
  });

  it('replaces the cached image when the icon file changes', async () => {
    put('trips/folder.png', await pngOf(8, 8, solid(8, 8, [0, 0, 255, 255])));
    await scan();
    const environment = textEnvironment();
    await textHandler(environment)({ kind: 'text', rootId: ROOT }, signal());
    const folder = indexed('trips');
    const first = icons.find(folder.id);
    put('trips/folder.png', await pngOf(8, 8, solid(8, 8, [255, 255, 0, 255])));
    utimesSync(
      join(tree, 'trips', 'folder.png'),
      new Date('2026-11-10T00:00:00Z'),
      new Date('2026-11-10T00:00:00Z'),
    );
    await textHandler(environment)({ kind: 'text', rootId: ROOT }, signal());
    const second = icons.find(folder.id);
    expect(second?.imageSha256).not.toBe(first?.imageSha256);
    expect(
      existsSync(
        folderIconFile({ derivedDirectory: () => derived }, folder.id, first?.imageSha256 ?? ''),
      ),
    ).toBe(false);
    expect(
      existsSync(
        folderIconFile({ derivedDirectory: () => derived }, folder.id, second?.imageSha256 ?? ''),
      ),
    ).toBe(true);
  });

  it('keeps reading icons while content indexing is off', async () => {
    updateDriveSettings(
      { settingsKv: fixture.settings, write: (work) => fixture.context.write(work) },
      { contentIndexing: false },
    );
    put('trips/icon.png', await pngOf(8, 8, solid(8, 8, [1, 2, 3, 255])));
    await scan();
    await readText();
    expect(icons.find(indexed('trips').id)).toBeDefined();
  });
});
