import { testStore, type TestStore, type SeededStore } from '../../support/store';
import { randomUUID } from 'node:crypto';
import type { DriveActor } from '../../../src/drive/access';
import { fileDraft } from '../../../src/drive/changes';
import type { NoticeListener } from '../../../src/store/feed';
import type { SqlFilter } from '../../../src/store/sql';
import { driveRoot } from '../../drive/drive-fixture';

export const NOW = '2026-10-08T10:00:00.000Z';

export type Notice = Parameters<NoticeListener>[0];

export interface Seed {
  readonly n: number;
  readonly takenAt: string;
  readonly root?: string;
  readonly name?: string;
  readonly offset?: number;
  readonly placeId?: string;
}

export interface Kit {
  readonly test: TestStore;
  readonly store: SeededStore;
  readonly alice: DriveActor;
  readonly bob: DriveActor;
  readonly homeRoot: string;
  readonly aliceRoot: string;
  readonly bobRoot: string;
  readonly notices: Notice[];
  readonly time: { current: Date };
  readonly phone: string;
  readonly tablet: string;
  readonly seed: (input: Seed) => string;
  readonly shown: (filter: SqlFilter) => string[];
  readonly row: (id: string) => Record<string, unknown>;
}

function seedPlaces(store: SeededStore): void {
  for (const [id, name] of [
    ['1001', 'Lisbon'],
    ['1002', 'Porto'],
  ] as const) {
    store.context.sql.run(
      'seed a place',
      `insert into drive_places (id, name, admin, country, lat, lon)
        values ($id, $name, null, 'PT', 40.0, -8.0)`,
      { id, name },
    );
  }
}

function seeder(store: SeededStore, homeRoot: string): (input: Seed) => string {
  return (input) => {
    const id = `0f000000-0000-4000-8000-${String(input.n).padStart(12, '0')}`;
    const rootId = input.root ?? homeRoot;
    const draft = fileDraft(
      {
        id,
        rootId,
        parentId: null,
        relPath: input.name ?? `${String(input.n)}.jpg`,
        modifiedAt: NOW,
        addedAt: NOW,
        outside: false,
        addedByProfileId: null,
      },
      { bytes: 10, sha256: null },
    );
    if (draft.kind !== 'image') throw new Error('The seeded item is not an image.');
    store.driveItems.write({
      item: { ...draft, takenAt: input.takenAt, width: 400, height: 300 },
      identity: { dev: '1', ino: String(input.n) },
    });
    store.context.sql.run(
      'seed the media row',
      `insert into drive_media (item_id, time_source, tz_offset_min, preview_state, poster_state,
        playable_state, place_id)
        values ($id, 'metadata', $offset, 'ready', 'none', 'none', $placeId)`,
      { id, offset: input.offset ?? null, placeId: input.placeId ?? null },
    );
    store.context.sql.run(
      'seed the library row',
      'insert into drive_photo_library (item_id, root_id) values ($id, $rootId)',
      { id, rootId },
    );
    return id;
  };
}

function readers(store: SeededStore): Pick<Kit, 'shown' | 'row'> {
  return {
    shown: (filter) =>
      store.database
        .prepare(
          `select i.id from drive_items i join drive_roots r on r.id = i.root_id
            where ${filter.text} order by i.id`,
        )
        .all(filter.parameters)
        .map((row) => String(row['id'])),
    row: (id) =>
      store.database
        .prepare(
          `select i.taken_at, i.place_lat, i.place_lon, i.rel_path, m.tz_offset_min, m.time_source,
              m.place_id
            from drive_items i join drive_media m on m.item_id = i.id where i.id = ?`,
        )
        .get(id) ?? {},
  };
}

export async function openKit(): Promise<Kit> {
  const time = { current: new Date(NOW) };
  const test = await testStore(() => time.current);
  const { store } = test;
  const aliceProfile = store.profiles.create({ name: 'Alice' }).id;
  const bobProfile = store.profiles.create({ name: 'Bob' }).id;
  const personal = (ownerProfileId: string): string =>
    store.driveRoots.insert(driveRoot(randomUUID(), { scope: 'person', ownerProfileId })).id;
  const homeRoot = store.driveRoots.insert(driveRoot(randomUUID())).id;
  const client = (name: string, tokenHash: string): string =>
    store.clients.create({ name, platform: 'android', role: 'owner', tokenHash }).id;
  seedPlaces(store);
  const notices: Notice[] = [];
  store.feed.subscribeNotices((notice) => {
    notices.push(notice);
  });
  return {
    test,
    store,
    alice: { profileId: aliceProfile },
    bob: { profileId: bobProfile },
    homeRoot,
    aliceRoot: personal(aliceProfile),
    bobRoot: personal(bobProfile),
    notices,
    time,
    phone: client('Phone', 'a'.repeat(64)),
    tablet: client('Tablet', 'b'.repeat(64)),
    seed: seeder(store, homeRoot),
    ...readers(store),
  };
}
