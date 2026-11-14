import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DrivePlacement } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { afterEach, describe, expect, it } from 'vitest';
import { openDriveSyncDatabase, type DriveSyncDatabase } from '../../src/drive-sync/db/index.js';

const PLACEMENT_ID_A = '11111111-1111-4111-8111-111111111111';
const PLACEMENT_ID_B = '22222222-2222-4222-8222-222222222222';
const DEVICE_ID = '33333333-3333-4333-8333-333333333333';
const DRIVE_ID = '44444444-4444-4444-8444-444444444444';
const FOLDER_ID = '55555555-5555-4555-8555-555555555555';
const PERSON_ID = '66666666-6666-4666-8666-666666666666';

function placement(
  id: string,
  mode: 'synced' | 'mounted',
  folderItemId: string | null,
): DrivePlacement {
  return {
    id,
    deviceId: DEVICE_ID,
    rootId: DRIVE_ID,
    folderItemId,
    mode,
    ...(mode === 'synced' ? { excluded: [], ignorePatterns: [], conflictCopies: true } : {}),
    localPath: `/data/${id}`,
    enabled: true,
    hold: null,
    createdBy: PERSON_ID,
    createdAt: '2026-11-07T10:00:00Z',
    status: {
      state: 'starting' as const,
      tier: null,
      basicLimits: null,
      readOnly: false,
      route: null,
      cacheBytes: 0,
      pinnedBytes: 0,
      openFiles: 0,
      pendingUploads: 0,
      needBytes: 0,
      lastSyncedAt: null,
      errors: [],
      reason: null,
      reportedAt: '2026-11-07T10:00:00Z',
    },
  };
}

const directories: string[] = [];
const opened: DriveSyncDatabase[] = [];

function open(directory: string): DriveSyncDatabase {
  const database = openDriveSyncDatabase(
    join(directory, 'drive-sync.sqlite'),
    new Logger('desktop.test'),
  );
  opened.push(database);
  return database;
}

function freshDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), 'placements-db-'));
  directories.push(directory);
  return directory;
}

afterEach(() => {
  for (const database of opened.splice(0)) database.close();
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

describe('placements cache', () => {
  it('starts empty', () => {
    expect(open(freshDirectory()).placements.all()).toEqual([]);
  });

  it('keeps the last frame across a reopen, in frame order', () => {
    const directory = freshDirectory();
    const frame = [
      placement(PLACEMENT_ID_B, 'mounted', FOLDER_ID),
      placement(PLACEMENT_ID_A, 'synced', null),
    ];
    open(directory).placements.replaceAll(frame);
    for (const database of opened.splice(0)) database.close();
    expect(open(directory).placements.all()).toEqual(frame);
  });

  it('replaces the whole cache with each frame', () => {
    const database = open(freshDirectory());
    database.placements.replaceAll([placement(PLACEMENT_ID_A, 'synced', null)]);
    database.placements.replaceAll([placement(PLACEMENT_ID_B, 'mounted', FOLDER_ID)]);
    expect(database.placements.all().map((cached) => cached.id)).toEqual([PLACEMENT_ID_B]);
    database.placements.replaceAll([]);
    expect(database.placements.all()).toEqual([]);
  });

  it('clears on revocation without touching other tables', () => {
    const database = open(freshDirectory());
    database.cursors.set({ placementId: DRIVE_ID, indexId: 'index', lastSeq: 4 });
    database.placements.replaceAll([placement(PLACEMENT_ID_A, 'synced', null)]);
    database.placements.clear();
    expect(database.placements.all()).toEqual([]);
    expect(database.cursors.get(DRIVE_ID)?.lastSeq).toBe(4);
  });

  it('leaves the old cache intact when a frame holds an invalid placement', () => {
    const database = open(freshDirectory());
    database.placements.replaceAll([placement(PLACEMENT_ID_A, 'synced', null)]);
    const invalid = [
      placement(PLACEMENT_ID_B, 'mounted', FOLDER_ID),
      { ...placement(PLACEMENT_ID_A, 'mounted', FOLDER_ID), excluded: [] },
    ];
    expect(() => {
      database.placements.replaceAll(invalid);
    }).toThrow();
    expect(database.placements.all().map((cached) => cached.id)).toEqual([PLACEMENT_ID_A]);
  });
});
