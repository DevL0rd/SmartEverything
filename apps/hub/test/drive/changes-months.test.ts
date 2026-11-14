import { randomUUID } from 'node:crypto';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  fileDraft,
  folderDraft,
  recordItem,
  type ChangeActor,
  type ChangeEnv,
} from '../../src/drive/changes';
import { takenMonths } from '../../src/drive/changes-months';
import { nodeFiles } from '../../src/drive/versions';
import { captureLogs, testLogger } from '../support/logs';
import type { TestStore } from '../support/store';
import { sharedDriveRoot } from '../store/drive-roots-fixture';
import { driveTestStore } from './spaces-fixture';

const NOW = new Date('2026-11-07T00:00:00.000Z');
const ACTOR: ChangeActor = { actorProfileId: null, via: 'app', deviceId: null };

let opened: TestStore;
let base = '';
let rootId = '';
let months: (readonly string[])[] = [];

function env(): ChangeEnv {
  return {
    files: nodeFiles,
    store: opened.store,
    log: testLogger('drive'),
    now: () => NOW,
    purge: { rearm: (): void => undefined },
  };
}

function newItem(relPath: string): Parameters<typeof fileDraft>[0] {
  return {
    rootId,
    parentId: null,
    relPath,
    modifiedAt: NOW.toISOString(),
    addedAt: NOW.toISOString(),
    outside: false,
    addedByProfileId: null,
  };
}

function record(draft: ReturnType<typeof fileDraft>, name: string): ReturnType<typeof recordItem> {
  return recordItem(env(), {
    draft,
    identity: { dev: '1', ino: name },
    op: 'create',
    actor: ACTOR,
  });
}

function taken(relPath: string, takenAt: string | null): ReturnType<typeof fileDraft> {
  const draft = fileDraft(newItem(relPath), { bytes: 1, sha256: null });
  if (draft.kind === 'folder') throw new Error('expected a file');
  return draft.kind === 'image' || draft.kind === 'video' ? { ...draft, takenAt } : draft;
}

beforeEach(async () => {
  captureLogs();
  opened = await driveTestStore();
  base = await realpath(await mkdtemp(join(tmpdir(), 'hub-drive-months-')));
  rootId = randomUUID();
  opened.store.driveRoots.insert(sharedDriveRoot(rootId));
  months = [];
  opened.store.feed.subscribeNotices((notice) => {
    if (notice.type === 'drive_changed') months.push(notice.months);
  });
});

afterEach(async () => {
  await opened.close();
  await rm(base, { recursive: true, force: true });
});

describe('the taken months of a drive change', () => {
  it('names the month a committed photo was taken in', () => {
    record(taken('a.jpg', '2026-03-15T10:00:00.000Z'), 'a');
    expect(months).toStrictEqual([['2026-03']]);
  });

  it('is empty when the item has no capture time', () => {
    record(taken('b.jpg', null), 'b');
    expect(months).toStrictEqual([[]]);
  });

  it('is empty for a file that is not a photo or video and for a folder', () => {
    record(taken('notes.txt', null), 'c');
    record(folderDraft(newItem('albums'), 0), 'd');
    expect(months).toStrictEqual([[], []]);
  });
});

describe('takenMonths', () => {
  const photo = (takenAt: string | null): ReturnType<typeof taken> => taken('x.jpg', takenAt);

  function asItems(
    drafts: readonly ReturnType<typeof fileDraft>[],
  ): Parameters<typeof takenMonths>[0] {
    return drafts.map((draft, index) => ({
      ...draft,
      rev: 1,
      etag: `e${String(index)}`,
      openedAt: null,
    }));
  }

  it('lists each month once, oldest first, in UTC', () => {
    const items = asItems([
      photo('2026-05-31T23:30:00-02:00'),
      photo('2026-02-01T00:00:00.000Z'),
      photo('2026-02-20T00:00:00.000Z'),
    ]);
    expect(takenMonths(items)).toStrictEqual(['2026-02', '2026-06']);
  });

  it('is empty for no items', () => {
    expect(takenMonths([])).toStrictEqual([]);
  });
});
