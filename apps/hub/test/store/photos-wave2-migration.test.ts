import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { StoreContext } from '../../src/store/context';
import { ChangeFeed } from '../../src/store/feed';
import { migrate } from '../../src/store/migrate';
import { MIGRATIONS } from '../../src/store/migrations';
import { PHOTOS_WAVE2_MIGRATION } from '../../src/store/migrations/photos-wave2';
import { DriveRootsRepository } from '../../src/store/repositories/drive-roots';
import { ProfilesRepository } from '../../src/store/repositories/profiles';
import { Sql } from '../../src/store/sql';
import { testLogger } from '../support/logs';
import { drivePathOf, personalDriveRoot, sharedDriveRoot } from './drive-roots-fixture';

const NOW = '2026-11-14T00:00:00.000Z';

const id = (group: string, index: number): string =>
  `${group}000000-0000-4000-8000-${String(index).padStart(12, '0')}`;

const SHARED = id('0a', 1);
const OWNER_ROOT = id('0a', 2);
const MEMBER_ROOT = id('0a', 3);
const OWNER_PHOTO = id('0b', 1);
const MEMBER_PHOTO = id('0b', 2);
const ALBUM = id('0c', 1);
const HOME_ALBUM = id('0c', 2);
const ITEM_SHARE = id('0d', 1);
const OLD_PREF = {
  version: 3,
  value: {
    showCameras: false,
    showAi: true,
    libraryZoom: 'months',
    libraryGroup: 'month',
    showVideos: true,
    showNotBackedUp: false,
    map: true,
    removeLocationOutside: false,
  },
};

type Fields = Record<string, string | number | null>;

let database: DatabaseSync;
let sql: Sql;
let owner: string;
let member: string;
let bare: string;

function insert(table: string, fields: Fields): void {
  const columns = Object.keys(fields);
  database
    .prepare(
      `insert into ${table} (${columns.join(', ')}) values (${columns.map(() => '?').join(', ')})`,
    )
    .run(...Object.values(fields));
}

function rows<T extends z.ZodType>(schema: T, text: string): z.output<T>[] {
  return z.array(schema).parse(database.prepare(text).all());
}

function item(itemId: string, rootId: string, name: string): void {
  insert('drive_items', {
    id: itemId,
    root_id: rootId,
    parent_id: null,
    rel_path: name,
    name,
    kind: 'image',
    mime: 'image/jpeg',
    bytes: 10,
    integrity: 'unknown',
    modified_at: NOW,
    added_at: NOW,
    rev: 1,
    etag: 'etag',
    outside: 0,
    thumb_state: 'none',
  });
}

function album(albumId: string, scope: string, ownerId: string | null): void {
  insert('drive_albums', {
    id: albumId,
    title: albumId,
    kind: 'manual',
    rule: null,
    surface: 'photos',
    scope,
    owner_profile_id: ownerId,
    cover_item_id: null,
    item_count: 1,
    created_at: NOW,
    updated_at: NOW,
  });
}

function role(profileId: string, name: string): void {
  database
    .prepare('update person_access set role = ?, template = ? where profile_id = ?')
    .run(name, name === 'owner' ? 'owner' : 'adult', profileId);
}

function layout(profileId: string, value: unknown): void {
  insert('layouts', {
    client_id: null,
    profile_id: profileId,
    page: 'photos',
    layout: JSON.stringify(value),
    updated_at: NOW,
  });
}

beforeEach(() => {
  database = new DatabaseSync(':memory:', { enableForeignKeyConstraints: true });
  sql = new Sql(database);
  const log = testLogger();
  migrate(
    sql,
    MIGRATIONS.filter((migration) => migration.version < PHOTOS_WAVE2_MIGRATION.version),
    NOW,
    log,
  );
  const context = new StoreContext(sql, new ChangeFeed(log), () => new Date(NOW));
  const profiles = new ProfilesRepository(context);
  owner = profiles.create({ name: 'Robin' }).id;
  member = profiles.create({ name: 'Sam' }).id;
  bare = profiles.create({ name: 'Kit' }).id;
  role(owner, 'owner');
  role(member, 'member');
  role(bare, 'member');
  const roots = new DriveRootsRepository(context, drivePathOf);
  roots.insert(sharedDriveRoot(SHARED));
  roots.insert(personalDriveRoot(OWNER_ROOT, owner));
  roots.insert(personalDriveRoot(MEMBER_ROOT, member));
  item(OWNER_PHOTO, OWNER_ROOT, 'a.jpg');
  item(MEMBER_PHOTO, MEMBER_ROOT, 'b.jpg');
  album(ALBUM, 'person', owner);
  album(HOME_ALBUM, 'home', null);
  insert('drive_album_items', {
    album_id: ALBUM,
    item_id: OWNER_PHOTO,
    position: 1,
    added_at: NOW,
  });
  insert('drive_album_items', {
    album_id: HOME_ALBUM,
    item_id: MEMBER_PHOTO,
    position: 1,
    added_at: NOW,
  });
  insert('drive_shares', {
    id: ITEM_SHARE,
    item_id: OWNER_PHOTO,
    token_hash: 'token-one',
    permission: 'view',
    expires_at: null,
    password_hash: 'hash',
    created_by: owner,
    created_at: NOW,
    revoked_at: null,
    opens: 4,
    downloads: 2,
    last_opened_at: NOW,
  });
  insert('drive_share_events', { share_id: ITEM_SHARE, kind: 'open', at: NOW });
  insert('drive_items_search', {
    item_id: OWNER_PHOTO,
    name: 'beach holiday',
    path: 'Photos',
    camera: 'Pixel',
    albums: 'Summer',
    dates: '2026 June',
  });
  layout(owner, OLD_PREF);
  layout(member, OLD_PREF);
  migrate(sql, MIGRATIONS, NOW, log);
});

afterEach(() => {
  database.close();
});

describe('migrating Photos to wave 2', () => {
  it('creates every wave 2 table', () => {
    const names = rows(
      z.object({ name: z.string() }),
      "select name from sqlite_master where type = 'table' and name like 'photo_%' order by name",
    ).map((row) => row.name);
    expect(names).toEqual([
      'photo_album_activity',
      'photo_album_members',
      'photo_analysis',
      'photo_archive',
      'photo_asset_folders',
      'photo_edits',
      'photo_embeddings',
      'photo_faces',
      'photo_group_faces',
      'photo_groups',
      'photo_hidden_folders',
      'photo_locked',
      'photo_merge_dismissals',
      'photo_meta_overrides',
      'photo_partner_delivered',
      'photo_partner_groups',
      'photo_partner_saved_albums',
      'photo_partner_shares',
      'photo_unlocks',
    ]);
  });

  it('gives existing album items the album owner as adder and leaves home albums without one', () => {
    expect(
      rows(
        z.object({ album_id: z.string(), added_by: z.string().nullable() }),
        'select album_id, added_by from drive_album_items order by album_id',
      ),
    ).toEqual([
      { album_id: ALBUM, added_by: owner },
      { album_id: HOME_ALBUM, added_by: null },
    ]);
  });

  it('keeps share rows, ids and events through the rebuild and fills the album column empty', () => {
    expect(
      rows(
        z.object({
          id: z.string(),
          item_id: z.string(),
          album_id: z.null(),
          token_hash: z.string(),
          password_hash: z.string(),
          opens: z.number(),
          downloads: z.number(),
        }),
        'select id, item_id, album_id, token_hash, password_hash, opens, downloads from drive_shares',
      ),
    ).toEqual([
      {
        id: ITEM_SHARE,
        item_id: OWNER_PHOTO,
        album_id: null,
        token_hash: 'token-one',
        password_hash: 'hash',
        opens: 4,
        downloads: 2,
      },
    ]);
    expect(
      rows(z.object({ n: z.number() }), 'select count(*) as n from drive_share_events'),
    ).toEqual([{ n: 1 }]);
  });

  it('shares an item or an album and never both or neither', () => {
    const share = (itemId: string | null, albumId: string | null, token: string): void => {
      insert('drive_shares', {
        id: id('0e', token.length),
        item_id: itemId,
        album_id: albumId,
        token_hash: token,
        permission: 'view',
        expires_at: null,
        password_hash: null,
        created_by: owner,
        created_at: NOW,
        revoked_at: null,
        opens: 0,
        downloads: 0,
        last_opened_at: null,
      });
    };
    share(null, ALBUM, 'album-token');
    expect(() => {
      share(OWNER_PHOTO, ALBUM, 'both');
    }).toThrow(/constraint/);
    expect(() => {
      share(null, null, 'neither!');
    }).toThrow(/constraint/);
    database.prepare('delete from drive_albums where id = ?').run(ALBUM);
    expect(
      rows(
        z.object({ n: z.number() }),
        'select count(*) as n from drive_shares where album_id is not null',
      ),
    ).toEqual([{ n: 0 }]);
  });

  it('rebuilds the search index with labels and keeps the old rows', () => {
    insert('drive_items_search', {
      item_id: MEMBER_PHOTO,
      name: 'dog',
      path: 'Photos',
      camera: '',
      albums: '',
      dates: '',
      labels: 'labrador beach',
    });
    expect(
      rows(
        z.object({ item_id: z.string() }),
        "select item_id from drive_items_search where drive_items_search match 'holiday'",
      ),
    ).toEqual([{ item_id: OWNER_PHOTO }]);
    expect(
      rows(
        z.object({ item_id: z.string() }),
        "select item_id from drive_items_search where drive_items_search match 'labels:labrador'",
      ),
    ).toEqual([{ item_id: MEMBER_PHOTO }]);
  });

  it('moves stored preferences to version 4 by role and leaves other keys alone', () => {
    const stored = (profileId: string): unknown =>
      JSON.parse(
        rows(
          z.object({ layout: z.string() }),
          `select layout from layouts where profile_id = '${profileId}' and page = 'photos'`,
        )[0]?.layout ?? 'null',
      );
    expect(stored(owner)).toEqual({
      version: 4,
      value: { ...OLD_PREF.value, smartSearch: true, faceGrouping: true, albumActivity: true },
    });
    expect(stored(member)).toEqual({
      version: 4,
      value: { ...OLD_PREF.value, smartSearch: false, faceGrouping: true, albumActivity: true },
    });
    expect(
      rows(
        z.object({ n: z.number() }),
        `select count(*) as n from layouts where profile_id = '${bare}'`,
      ),
    ).toEqual([{ n: 0 }]);
  });

  it('refuses invalid rows in the new tables', () => {
    expect(() => {
      insert('photo_analysis', {
        item_id: OWNER_PHOTO,
        rev: 1,
        model: 'm',
        state: 'failed',
        caption: null,
        scene: null,
        labels: '[]',
        pets: '[]',
        error: null,
        analysed_at: NOW,
      });
    }).toThrow(/constraint/);
    expect(() => {
      insert('photo_partner_shares', {
        id: id('0f', 1),
        sharer_id: owner,
        recipient_id: owner,
        scope: 'all',
        from_day: '2026-01-01',
        state: 'offered',
        auto_save: 0,
        created_at: NOW,
      });
    }).toThrow(/constraint/);
    expect(() => {
      insert('photo_meta_overrides', { item_id: OWNER_PHOTO, set_at: NOW });
    }).toThrow(/constraint/);
  });

  it('removes a person data with the profile and an item data with the item', () => {
    insert('photo_archive', { profile_id: owner, item_id: OWNER_PHOTO, archived_at: NOW });
    insert('photo_locked', {
      profile_id: member,
      pin_hash: 'h',
      pin_salt: 's',
      created_at: NOW,
    });
    database.prepare('delete from drive_items where id = ?').run(OWNER_PHOTO);
    database.prepare('delete from profiles where id = ?').run(member);
    for (const table of ['photo_archive', 'photo_locked']) {
      expect(rows(z.object({ n: z.number() }), `select count(*) as n from ${table}`)).toEqual([
        { n: 0 },
      ]);
    }
  });

  it('leaves no foreign key violation', () => {
    expect(database.prepare('pragma foreign_key_check').all()).toEqual([]);
  });
});
