import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { z } from 'zod';
import { DRIVE_ALBUM } from '../../../../packages/domain/src/drive/album';
import { DRIVE_CONFLICT } from '../../../../packages/domain/src/drive/conflict';
import { DRIVE_ITEM } from '../../../../packages/domain/src/drive/item';
import { DRIVE_QUOTA } from '../../../../packages/domain/src/drive/quota';
import {
  DRIVE_ROOT_KINDS,
  DRIVE_ROOT_STATES,
  DRIVE_ROOT,
} from '../../../../packages/domain/src/drive/root';
import { DRIVE_SETTINGS } from '../../../../packages/domain/src/drive/settings';
import { DRIVE_SHARE } from '../../../../packages/domain/src/drive/share';
import { DRIVE_SYNC_CLIENT } from '../../../../packages/domain/src/drive/sync-client';
import { DRIVE_TRASH_ENTRY } from '../../../../packages/domain/src/drive/trash';
import { DRIVE_USAGE } from '../../../../packages/domain/src/drive/usage';
import { DRIVE_VERSION } from '../../../../packages/domain/src/drive/version';
import { generateDriveFixture, type DriveFixture } from '../fixtures/drive-fixture';

const SEED = 20261107;
const LARGE_TIMEOUT_MS = 120_000;
const FIXTURE_DIRECTORY = join(__dirname, '..', 'fixtures');

function expectAllParse(schema: z.ZodType, rows: readonly unknown[]): void {
  const failures = rows.filter((row) => !schema.safeParse(row).success);
  expect(failures).toHaveLength(0);
}

function expectRowsParse(fixture: DriveFixture): void {
  expectAllParse(DRIVE_ROOT, fixture.roots);
  expectAllParse(DRIVE_ITEM, fixture.items);
  expectAllParse(DRIVE_ALBUM, fixture.albums);
  expectAllParse(DRIVE_TRASH_ENTRY, fixture.trash);
  expectAllParse(DRIVE_VERSION, fixture.versions);
  expectAllParse(DRIVE_SHARE, fixture.shares);
  expectAllParse(DRIVE_SYNC_CLIENT, fixture.syncClients);
  expectAllParse(DRIVE_CONFLICT, fixture.conflicts);
  expectAllParse(DRIVE_QUOTA, fixture.quotas);
  expectAllParse(DRIVE_USAGE, fixture.usage);
  expect(DRIVE_SETTINGS.safeParse(fixture.settings).success).toBe(true);
}

function expectItemIntegrity(fixture: DriveFixture): void {
  const byId = new Map(fixture.items.map((item) => [item.id, item]));
  const roots = new Set(fixture.roots.map((root) => root.id));
  const paths = new Set<string>();
  expect(byId.size).toBe(fixture.items.length);
  for (const item of fixture.items) {
    expect(roots.has(item.rootId)).toBe(true);
    const key = `${item.rootId}/${item.relPath}`;
    expect(paths.has(key)).toBe(false);
    paths.add(key);
    const parent = item.parentId === null ? undefined : byId.get(item.parentId);
    expect(item.parentId === null || parent?.kind === 'folder').toBe(true);
    expect(parent === undefined || parent.rootId === item.rootId).toBe(true);
  }
}

function expectFolderAndRootCounts(fixture: DriveFixture): void {
  const children = new Map<string, number>();
  for (const item of fixture.items) {
    if (item.parentId !== null) {
      children.set(item.parentId, (children.get(item.parentId) ?? 0) + 1);
    }
  }
  for (const item of fixture.items) {
    if (item.kind === 'folder') {
      expect(item.childCount).toBe(children.get(item.id) ?? 0);
    }
  }
  for (const root of fixture.roots) {
    const mine = fixture.items.filter((item) => item.rootId === root.id);
    const files = mine.filter((item) => item.kind !== 'folder');
    expect(root.items).toBe(files.length);
    expect(root.folders).toBe(mine.length - files.length);
    expect(root.bytes).toBe(files.reduce((sum, item) => sum + item.bytes, 0));
    const corrupt = files.filter((item) => 'integrity' in item && item.integrity === 'corrupt');
    expect(root.health.corrupt).toBe(corrupt.length);
  }
}

function expectManagedRoots(fixture: DriveFixture): void {
  const managed = fixture.roots.filter((root) => root.kind === 'managed');
  const person = managed.filter((root) => root.scope === 'person');
  const home = managed.filter((root) => root.scope === 'home');
  expect(person.map((root) => root.ownerProfileId).toSorted()).toEqual(
    fixture.people.map((entry) => entry.id).toSorted(),
  );
  expect(home).toHaveLength(1);
  expect(home[0]?.label).toBe('Shared');
  expect(home[0]?.ownerProfileId).toBeNull();
}

function expectAttribution(fixture: DriveFixture): void {
  const owners = new Map(fixture.roots.map((root) => [root.id, root]));
  const memberIds = fixture.people.filter((entry) => !entry.owner).map((entry) => entry.id);
  const shared = fixture.roots.find((root) => root.scope === 'home' && root.kind === 'managed');
  const sharedByMember = fixture.items.filter(
    (item) =>
      item.rootId === shared?.id &&
      item.addedByProfileId !== null &&
      memberIds.includes(item.addedByProfileId),
  );
  expect(sharedByMember.length).toBeGreaterThan(0);
  for (const item of fixture.items) {
    const root = owners.get(item.rootId);
    if (root?.kind === 'managed' && root.scope === 'person' && item.addedByProfileId !== null) {
      expect(item.addedByProfileId).toBe(root.ownerProfileId);
    }
  }
  expect(fixture.trash.some((entry) => entry.addedByProfileId !== null)).toBe(true);
  expect(fixture.versions.some((entry) => entry.addedByProfileId !== null)).toBe(true);
}

function expectRelations(fixture: DriveFixture): void {
  const ids = new Set(fixture.items.map((item) => item.id));
  const trashed = new Set(fixture.trash.map((entry) => entry.itemId));
  expect(fixture.trash.every((entry) => !ids.has(entry.itemId))).toBe(true);
  expect(trashed.size).toBe(fixture.trash.length);
  expect(fixture.versions.every((version) => ids.has(version.itemId))).toBe(true);
  expect(fixture.shares.every((share) => ids.has(share.itemId))).toBe(true);
  expect(fixture.albumItems.every((entry) => ids.has(entry.itemId))).toBe(true);
  for (const conflict of fixture.conflicts) {
    expect(ids.has(conflict.itemId)).toBe(true);
    expect(ids.has(conflict.conflictItemId)).toBe(true);
    expect(conflict.conflictRelPath).toContain('.sync-conflict-');
  }
}

function expectSyncRelations(fixture: DriveFixture): void {
  const roots = new Map(fixture.roots.map((root) => [root.id, root]));
  for (const client of fixture.syncClients) {
    const root = roots.get(client.rootId);
    expect(root?.sync?.clients.some((entry) => entry.clientId === client.clientId)).toBe(true);
  }
  expect(fixture.syncClients.some((client) => client.errors.length > 0)).toBe(true);
  expect(fixture.syncClients.some((client) => !client.enabled)).toBe(true);
  expect(fixture.conflicts.some((conflict) => conflict.resolvedAt === null)).toBe(true);
  expect(fixture.conflicts.some((conflict) => conflict.resolvedAt !== null)).toBe(true);
}

function expectUsageAndQuotas(fixture: DriveFixture): void {
  const files = fixture.items.filter((item) => item.kind !== 'folder');
  const total = (id: string | null): number =>
    files.filter((item) => item.addedByProfileId === id).reduce((sum, item) => sum + item.bytes, 0);
  for (const row of fixture.usage) {
    expect(row.live).toBe(total(row.profileId));
  }
  expect(fixture.usage.map((row) => row.profileId)).toContain(null);
  const used = (id: string): number => {
    const row = fixture.usage.find((entry) => entry.profileId === id);
    return row ? row.live + row.versions + row.trash : 0;
  };
  const over = fixture.quotas.filter((quota) => used(quota.profileId) > quota.bytes);
  expect(fixture.quotas.length).toBeGreaterThan(1);
  expect(over).toHaveLength(1);
}

function expectAlbums(fixture: DriveFixture): void {
  for (const album of fixture.albums) {
    if (album.kind === 'manual') {
      const members = fixture.albumItems.filter((entry) => entry.albumId === album.id);
      expect(members).toHaveLength(album.itemCount);
    }
  }
  const videos = fixture.items.filter((item) => item.kind === 'video').length;
  const smart = fixture.albums.find((album) => album.title === 'All videos');
  expect(smart?.itemCount).toBe(videos);
}

describe('drive fixture generator', () => {
  it('builds only the managed roots for an empty library', () => {
    const fixture = generateDriveFixture({ seed: SEED, size: 'empty' });
    expectRowsParse(fixture);
    expect(fixture.items).toHaveLength(0);
    expect(fixture.roots).toHaveLength(fixture.people.length + 1);
    expect(fixture.roots.every((root) => root.kind === 'managed' && root.items === 0)).toBe(true);
    expect(fixture.albums).toHaveLength(0);
    expect(fixture.trash).toHaveLength(0);
    expectManagedRoots(fixture);
  });

  it('is deterministic for a seed and differs for another seed', () => {
    const first = generateDriveFixture({ seed: SEED, size: 'small' });
    const second = generateDriveFixture({ seed: SEED, size: 'small' });
    const other = generateDriveFixture({ seed: SEED + 1, size: 'small' });
    expect(second).toEqual(first);
    expect(other).not.toEqual(first);
    expect(other.items.length).toBe(first.items.length);
  });

  describe('small library', () => {
    const fixture = generateDriveFixture({ seed: SEED, size: 'small' });

    it('parses every row with the domain schemas', () => {
      expectRowsParse(fixture);
    });

    it('covers every root kind and state', () => {
      expect(new Set(fixture.roots.map((root) => root.kind))).toEqual(new Set(DRIVE_ROOT_KINDS));
      expect(new Set(fixture.roots.map((root) => root.state))).toEqual(new Set(DRIVE_ROOT_STATES));
      expectManagedRoots(fixture);
      expect(fixture.roots.some((root) => root.kind !== 'managed' && root.readOnly)).toBe(true);
      expect(fixture.roots.some((root) => root.kind === 'folder' && !root.readOnly)).toBe(true);
    });

    it('keeps items, folders and root totals consistent', () => {
      expectItemIntegrity(fixture);
      expectFolderAndRootCounts(fixture);
    });

    it('carries corrupt, outside and unhashed items', () => {
      const files = fixture.items.filter((item) => item.kind !== 'folder');
      expect(files.some((item) => item.integrity === 'corrupt')).toBe(true);
      expect(files.some((item) => item.sha256 === null)).toBe(true);
      expect(fixture.items.some((item) => item.outside && item.addedByProfileId === null)).toBe(
        true,
      );
      expect(fixture.items.some((item) => item.starred)).toBe(true);
    });

    it('attributes bytes to the person who added them', () => {
      expectAttribution(fixture);
    });

    it('links trash, versions, shares, albums and conflicts to real items', () => {
      expectRelations(fixture);
      expect(fixture.shares.some((share) => share.hasPassword)).toBe(true);
      expect(fixture.shares.some((share) => share.revokedAt !== null)).toBe(true);
      expect(
        fixture.shares.some((share) => Date.parse(share.expiresAt ?? '') < Date.parse(fixture.now)),
      ).toBe(true);
    });

    it('keeps sync clients, conflicts, usage, quotas and albums consistent', () => {
      expectSyncRelations(fixture);
      expectUsageAndQuotas(fixture);
      expectAlbums(fixture);
    });
  });

  describe('large library', () => {
    it(
      'holds at least one hundred thousand items that all parse',
      () => {
        const fixture = generateDriveFixture({ seed: SEED, size: 'large' });
        expect(fixture.items.length).toBeGreaterThanOrEqual(100_000);
        expectRowsParse(fixture);
        expectItemIntegrity(fixture);
        expectFolderAndRootCounts(fixture);
      },
      LARGE_TIMEOUT_MS,
    );
  });

  it('is pure data with no node-only imports', () => {
    const files = [
      join(FIXTURE_DIRECTORY, 'drive-fixture.ts'),
      ...readdirSync(join(FIXTURE_DIRECTORY, 'drive-fixture')).map((name) =>
        join(FIXTURE_DIRECTORY, 'drive-fixture', name),
      ),
    ];
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      expect(source).not.toMatch(/from 'node:/);
      expect(source).not.toMatch(/from '(fs|path|crypto|os)'/);
    }
  });
});
