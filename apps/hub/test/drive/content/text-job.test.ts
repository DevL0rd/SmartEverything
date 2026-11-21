import { DriveActivity } from '../../../src/drive/activity';
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DriveItem } from '@smarteverything/domain';
import { build } from 'esbuild';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { scanHandler, type ScanEnvironment } from '../../../src/drive/jobs';
import { DriveRootLanes } from '../../../src/drive/root-lanes';
import {
  TextCursors,
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
import { testLogger } from '../../support/logs';
import { driveRoot, NOW, openDriveFixture, type DriveFixture } from '../drive-fixture';
import { zipOf, pngOf, solid } from './builders';
import { localFolderIcons, localScans, localText } from '../local-ports';
import { collectTextBacklog, type TextStore } from '../../../src/drive/units/text';
import type { DriveItemsRepository } from '../../../src/store/repositories/drive-items';

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
let derived = '';
let fixture: DriveFixture;
let texts: DriveItemTextRepository;
let icons: DriveFolderIconsRepository;
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
    external: [],
    banner: { js: BUNDLE_BANNER },
    logLevel: 'silent',
  });
});

afterAll(() => {
  rmSync(BUNDLE_BASE, { recursive: true, force: true });
});

beforeEach(() => {
  tree = mkdtempSync(join(tmpdir(), 'text-tree-'));
  derived = mkdtempSync(join(tmpdir(), 'text-derived-'));
  fixture = openDriveFixture();
  fixture.addDrive(driveRoot(ROOT), tree);
  texts = new DriveItemTextRepository(fixture.context);
  icons = new DriveFolderIconsRepository(fixture.context);
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
  for (const path of [tree, derived]) rmSync(path, { recursive: true, force: true });
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
    ...localScans({
      roots: fixture.roots,
      items: fixture.items,
      context: fixture.context,
      feed: fixture.feed,
      now: () => new Date(NOW),
    }),
    availability: () => Promise.resolve('online'),
    mounted: () => Promise.resolve(false),
    workerScript: scannerScript,
    lanes: new DriveRootLanes(),
    log: testLogger(),
  };
  await scanHandler(env)({ kind: 'scan', rootId: ROOT }, signal());
}

function textEnvironment(items: DriveItemsRepository = fixture.items): TextEnvironment {
  const refresher = new FolderIconRefresher({
    icons: localFolderIcons(fixture, icons, items),
    feed: fixture.feed,
    derivedDirectory: (): string => derived,
    log: testLogger(),
  });
  return {
    ...localText(fixture, items),
    availability: () => Promise.resolve('online'),
    workerScript: contentScript,
    activity: new DriveActivity(),
    icons: refresher,
    log: testLogger(),
  };
}

function textStore(): TextStore {
  return { driveItems: fixture.items, driveItemText: texts, driveFeed };
}

async function readText(): Promise<void> {
  await textHandler(textEnvironment(), new TextCursors())({ kind: 'text', rootId: ROOT }, signal());
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
    put('blank.txt', '   ');
    put('broken.pdf', 'not a pdf');
    await scan();
    await readText();
    expect(stateOf('notes.txt')).toBe('document:ok');
    expect(stateOf('letter.docx')).toBe('document:ok');
    expect(stateOf('blank.txt')).toBe('document:empty');
    expect(stateOf('broken.pdf')).toBe('document:failed');
    expect(searchFor('lighthouse')).toEqual(['notes.txt']);
    expect(searchFor('harbour')).toEqual(['letter.docx']);
    expect(progress.at(-1)).toBe('text:4/4');
  });

  it('leaves pictures and videos to the vision model', async () => {
    put('sign.png', await pngOf(8, 8, solid(8, 8, [255, 255, 255, 255])));
    put('clip.mp4', 'not really a video');
    put('notes.txt', 'harbour words');
    await scan();
    await readText();
    expect(stateOf('sign.png')).toBeUndefined();
    expect(stateOf('clip.mp4')).toBeUndefined();
    expect(stateOf('notes.txt')).toBe('document:ok');
    expect(progress.at(-1)).toBe('text:1/1');
  });

  it('reads a file again only after its revision changes', async () => {
    put('notes.txt', 'first words');
    await scan();
    await readText();
    const before = texts.find(indexed('notes.txt').id);
    expect(collectTextBacklog(textStore(), ROOT).work).toEqual([]);
    put('notes.txt', 'second words here');
    utimesSync(
      join(tree, 'notes.txt'),
      new Date('2026-11-08T00:00:00Z'),
      new Date('2026-11-08T00:00:00Z'),
    );
    await scan();
    const stale = collectTextBacklog(textStore(), ROOT);
    expect(stale.work.map((item) => item.name)).toEqual(['notes.txt']);
    await readText();
    const after = texts.find(indexed('notes.txt').id);
    expect(after?.rev).toBeGreaterThan(before?.rev ?? 0);
    expect(searchFor('second')).toEqual(['notes.txt']);
    expect(searchFor('first')).toEqual([]);
  });

  it('walks the drive once and then reads only what the drive feed says changed', async () => {
    put('a/one.txt', 'alpha words');
    put('b/two.txt', 'beta words');
    put('b/three.png', await pngOf(8, 8, solid(8, 8, [255, 255, 255, 255])));
    await scan();
    let listed = 0;
    const counted = textEnvironment(
      new Proxy(fixture.items, {
        get(target, key, receiver): unknown {
          if (key === 'children') listed += 1;
          const value: unknown = Reflect.get(target, key, receiver);
          return typeof value === 'function' ? value.bind(target) : value;
        },
      }),
    );
    const cursors = new TextCursors();
    const run = textHandler(counted, cursors);
    await run({ kind: 'text', rootId: ROOT }, signal());
    expect(searchFor('alpha')).toEqual(['one.txt']);
    const walked = listed;
    expect(walked).toBeGreaterThan(0);
    put('b/two.txt', 'gamma words now');
    utimesSync(
      join(tree, 'b/two.txt'),
      new Date('2026-11-08T00:00:00Z'),
      new Date('2026-11-08T00:00:00Z'),
    );
    await scan();
    const two = indexed('b/two.txt');
    driveFeed.append({
      rootId: ROOT,
      itemId: two.id,
      op: 'update',
      rev: two.rev,
      actorProfileId: null,
      via: 'outside',
      deviceId: null,
    });
    await run({ kind: 'text', rootId: ROOT }, signal());
    expect(listed).toBe(walked);
    expect(searchFor('gamma')).toEqual(['two.txt']);
    expect(texts.find(indexed('b/three.png').id)).toBeUndefined();
    cursors.forget(ROOT);
    await run({ kind: 'text', rootId: ROOT }, signal());
    expect(listed).toBeGreaterThan(walked);
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
    await textHandler(environment, new TextCursors())({ kind: 'text', rootId: ROOT }, signal());
    const folder = indexed('trips');
    const first = icons.find(folder.id);
    put('trips/folder.png', await pngOf(8, 8, solid(8, 8, [255, 255, 0, 255])));
    utimesSync(
      join(tree, 'trips', 'folder.png'),
      new Date('2026-11-10T00:00:00Z'),
      new Date('2026-11-10T00:00:00Z'),
    );
    await textHandler(environment, new TextCursors())({ kind: 'text', rootId: ROOT }, signal());
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
