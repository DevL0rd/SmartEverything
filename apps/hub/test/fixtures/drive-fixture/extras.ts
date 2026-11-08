import type { DriveAlbum } from '../../../../../packages/domain/src/drive/album';
import type { DriveConflict } from '../../../../../packages/domain/src/drive/conflict';
import type { DriveItem } from '../../../../../packages/domain/src/drive/item';
import type { DriveQuota } from '../../../../../packages/domain/src/drive/quota';
import type { DriveShare } from '../../../../../packages/domain/src/drive/share';
import type { DriveTrashEntry } from '../../../../../packages/domain/src/drive/trash';
import type { DriveUsage } from '../../../../../packages/domain/src/drive/usage';
import type { DriveVersion } from '../../../../../packages/domain/src/drive/version';
import type { BuiltRoot } from './items';
import type { People, RootPlan } from './plans';
import { cycle, DAY_MS, HOUR_MS, iso, MINUTE_MS, NOW_MS, RETENTION_MS } from './random';
import type { NonEmpty, Random } from './random';
import type { DriveFixtureAlbumItem } from './types';

const VERSIONED_SHARE = 0.5;
const TRASH_SHARE = 0.02;
const SHARES_SHARE = 0.05;
const ALBUM_STRIDE = 8;
const OVER_QUOTA_SHARE = 0.9;
const ROOMY_QUOTA_FACTOR = 10;

export function buildVersions(
  random: Random,
  entry: BuiltRoot,
  deviceIds: NonEmpty<string>,
): readonly DriveVersion[] {
  if (!entry.plan.versions) {
    return [];
  }
  return entry.items.flatMap((item) => {
    if (item.kind === 'folder' || item.rev < 2 || !random.chance(VERSIONED_SHARE)) {
      return [];
    }
    return Array.from({ length: item.rev - 1 }, (_, index) => {
      const at = Date.parse(item.addedAt) + (index + 1) * HOUR_MS;
      const synced = index % 2 === 1;
      return {
        id: random.uuid(),
        itemId: item.id,
        rev: index + 1,
        sha256: random.hex(64),
        bytes: random.between(0, item.bytes),
        at: iso(at),
        purgeAt: iso(at + RETENTION_MS),
        actorProfileId: item.addedByProfileId,
        via: synced ? ('sync' as const) : ('app' as const),
        deviceId: synced ? deviceIds[0] : null,
        addedByProfileId: item.addedByProfileId,
      };
    });
  });
}

export function buildTrash(random: Random, entry: BuiltRoot): readonly DriveTrashEntry[] {
  const { plan } = entry;
  if (plan.readOnly) {
    return [];
  }
  const files = entry.items.filter((item) => item.kind !== 'folder').length;
  return Array.from({ length: Math.ceil(files * TRASH_SHARE) }, (_, index) => {
    const id = random.uuid();
    const name = `Old ${String(index + 1)}.pdf`;
    const deletedAt = NOW_MS - (index === 0 ? 29 * DAY_MS : random.int(25 * DAY_MS));
    const person = plan.adders === null ? null : cycle(plan.adders, index);
    return {
      itemId: id,
      rootId: plan.id,
      name,
      originalRelPath: `Trashed/${name}`,
      trashRelPath: `.smarteverything/trash/${id}`,
      isFolder: index % 10 === 9,
      bytes: random.between(10_000, 50_000_000),
      deletedAt: iso(deletedAt),
      purgeAt: iso(deletedAt + RETENTION_MS),
      deletedBy: person,
      addedByProfileId: person,
    };
  });
}

export function buildShares(
  random: Random,
  entry: BuiltRoot,
  owner: string,
): readonly DriveShare[] {
  if (entry.plan.readOnly) {
    return [];
  }
  const files = entry.items.filter((item) => item.kind !== 'folder');
  return files.slice(0, Math.ceil(files.length * SHARES_SHARE)).map((item, index) => ({
    id: random.uuid(),
    itemId: item.id,
    permission: index % 2 === 0 ? ('view' as const) : ('download' as const),
    expiresAt: iso(NOW_MS + (index % 4 === 1 ? -DAY_MS : 14 * DAY_MS)),
    hasPassword: index % 5 === 0,
    createdBy: item.addedByProfileId ?? owner,
    revokedAt: index % 4 === 2 ? iso(NOW_MS - 2 * DAY_MS) : null,
    opens: random.between(0, 40),
    downloads: random.between(0, 10),
    lastOpenedAt: index % 3 === 0 ? iso(NOW_MS - random.int(10 * DAY_MS)) : null,
  }));
}

export function buildConflicts(
  random: Random,
  entry: BuiltRoot,
  people: People,
  deviceIds: NonEmpty<string>,
): readonly DriveConflict[] {
  return entry.pairs.map(({ original, copy }, index) => {
    const base = {
      id: random.uuid(),
      rootId: entry.plan.id,
      itemId: original.id,
      conflictItemId: copy.id,
      relPath: original.relPath,
      conflictRelPath: copy.relPath,
      hubRev: original.rev,
      baseRev: Math.max(1, original.rev - 1),
      deviceId: cycle(deviceIds, index),
      profileId: cycle(people, index).id,
      at: iso(NOW_MS - (index + 1) * HOUR_MS),
    };
    return index % 2 === 1
      ? {
          ...base,
          resolvedAt: iso(NOW_MS - index * 30 * MINUTE_MS),
          resolution: 'keep_both' as const,
        }
      : { ...base, resolvedAt: null, resolution: null };
  });
}

function imagesOf(
  built: readonly BuiltRoot[],
  test: (plan: RootPlan) => boolean,
): readonly DriveItem[] {
  return built
    .filter((entry) => test(entry.plan))
    .flatMap((entry) => entry.items.filter((item) => item.kind === 'image'))
    .filter((_, index) => index % ALBUM_STRIDE === 0);
}

interface ManualSpec {
  readonly id: string;
  readonly title: string;
  readonly scope: 'home' | 'person';
  readonly owner: string | null;
  readonly pool: readonly DriveItem[];
}

function manualSpecs(
  random: Random,
  people: People,
  built: readonly BuiltRoot[],
): readonly ManualSpec[] {
  const [owner, sam] = people;
  return [
    {
      title: 'Holidays 2025',
      scope: 'person' as const,
      owner: owner.id,
      pool: imagesOf(built, (plan) => plan.owner === owner.id && plan.kind === 'managed'),
    },
    {
      title: 'Family',
      scope: 'home' as const,
      owner: null,
      pool: imagesOf(built, (plan) => plan.scope === 'home' && plan.kind !== 'cameras'),
    },
    {
      title: 'Sam favourites',
      scope: 'person' as const,
      owner: sam.id,
      pool: imagesOf(built, (plan) => plan.owner === sam.id),
    },
  ].map((spec) => ({ ...spec, id: random.uuid() }));
}

function smartAlbums(
  random: Random,
  owner: string,
  all: readonly DriveItem[],
): readonly DriveAlbum[] {
  const stamp = { createdAt: iso(NOW_MS - 90 * DAY_MS), updatedAt: iso(NOW_MS - DAY_MS) };
  const videos = all.filter((item) => item.kind === 'video');
  const starred = all.filter((item) => item.starred);
  return [
    {
      id: random.uuid(),
      title: 'All videos',
      surface: 'photos',
      scope: 'home',
      ownerProfileId: null,
      coverItemId: videos[0]?.id ?? null,
      itemCount: videos.length,
      ...stamp,
      kind: 'smart',
      rule: { match: 'all', rules: [{ kind: 'item_kind', itemKinds: ['video'] }] },
    },
    {
      id: random.uuid(),
      title: 'Starred',
      surface: 'photos',
      scope: 'person',
      ownerProfileId: owner,
      coverItemId: starred[0]?.id ?? null,
      itemCount: starred.length,
      ...stamp,
      kind: 'smart',
      rule: { match: 'all', rules: [{ kind: 'starred', starred: true }] },
    },
  ];
}

export function buildAlbums(
  random: Random,
  people: People,
  built: readonly BuiltRoot[],
): { readonly albums: readonly DriveAlbum[]; readonly members: readonly DriveFixtureAlbumItem[] } {
  const all = built.flatMap((entry) => entry.items);
  if (all.length === 0) {
    return { albums: [], members: [] };
  }
  const manual = manualSpecs(random, people, built);
  const stamp = { createdAt: iso(NOW_MS - 90 * DAY_MS), updatedAt: iso(NOW_MS - DAY_MS) };
  const albums: readonly DriveAlbum[] = [
    ...manual.map((spec): DriveAlbum => ({
      id: spec.id,
      title: spec.title,
      surface: 'photos',
      scope: spec.scope,
      ownerProfileId: spec.owner,
      coverItemId: spec.pool[0]?.id ?? null,
      itemCount: spec.pool.length,
      ...stamp,
      kind: 'manual',
    })),
    ...smartAlbums(random, people[0].id, all),
  ];
  const members = manual.flatMap((spec) =>
    spec.pool.map((item, position) => ({ albumId: spec.id, itemId: item.id, position })),
  );
  return { albums, members };
}

export function buildUsage(
  profiles: readonly (string | null)[],
  items: readonly DriveItem[],
  versions: readonly DriveVersion[],
  trash: readonly DriveTrashEntry[],
): readonly DriveUsage[] {
  const files = items.filter((item) => item.kind !== 'folder');
  const sum = (
    rows: readonly { readonly bytes: number; readonly addedByProfileId: string | null }[],
    profileId: string | null,
  ): number =>
    rows.reduce(
      (total, row) => (row.addedByProfileId === profileId ? total + row.bytes : total),
      0,
    );
  return profiles.map((profileId) => ({
    profileId,
    live: sum(files, profileId),
    versions: sum(versions, profileId),
    trash: sum(trash, profileId),
  }));
}

export function buildQuotas(people: People, usage: readonly DriveUsage[]): readonly DriveQuota[] {
  const total = (profileId: string): number => {
    const row = usage.find((entry) => entry.profileId === profileId);
    return row ? row.live + row.versions + row.trash : 0;
  };
  return people
    .filter((person) => !person.owner && total(person.id) > 0)
    .map((person, index) => ({
      profileId: person.id,
      bytes:
        index === 0
          ? total(person.id) * ROOMY_QUOTA_FACTOR
          : Math.max(1, Math.floor(total(person.id) * OVER_QUOTA_SHARE)),
    }));
}
