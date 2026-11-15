import type { LogPayload } from '@smarteverything/logging';
import { z } from 'zod';
import { SQL_JSON, jsonText, type Sql } from '../sql';
import type { Migration } from './migration';

const FLAG = (column: string): string => `check (${column} in (0, 1))`;

const COUNT = (column: string): string => `check (${column} >= 0)`;

const JSON_ARRAY = (column: string): string =>
  `check (json_valid(${column}) and json_type(${column}) = 'array')`;

const JSON_OBJECT = (column: string): string =>
  `check (json_valid(${column}) and json_type(${column}) = 'object')`;

const NAMED = (column: string): string => `check (length(trim(${column})) > 0)`;

const DAY = (column: string): string => `check (date(${column}) = ${column})`;

const ANALYSIS = [
  `create table photo_analysis (
    item_id text primary key references drive_items (id) on delete cascade,
    rev integer not null check (rev > 0),
    model text not null ${NAMED('model')},
    state text not null check (state in ('done', 'failed', 'needs_key', 'skipped')),
    caption text check (caption is null or length(trim(caption)) > 0),
    scene text check (scene is null or length(trim(scene)) > 0),
    labels text not null ${JSON_ARRAY('labels')},
    pets text not null ${JSON_ARRAY('pets')},
    error text check (error is null or length(error) > 0),
    analysed_at text not null,
    check ((state = 'failed') = (error is not null))
  ) strict`,
  'create index photo_analysis_by_state on photo_analysis (state)',
  `create table photo_embeddings (
    item_id text primary key references drive_items (id) on delete cascade,
    rev integer not null check (rev > 0),
    model text not null ${NAMED('model')},
    dims integer not null check (dims > 0),
    scale real not null check (scale > 0),
    vector blob not null check (length(vector) > 0)
  ) strict`,
];

const FACES = [
  `create table photo_faces (
    id text primary key,
    item_id text not null references drive_items (id) on delete cascade,
    rev integer not null check (rev > 0),
    kind text not null check (kind in ('person', 'pet')),
    species text check (species is null or length(trim(species)) > 0),
    box text not null ${JSON_OBJECT('box')},
    landmarks text check (landmarks is null or (json_valid(landmarks) and json_type(landmarks) = 'array')),
    score real not null check (score >= 0 and score <= 1),
    quality real not null check (quality >= 0 and quality <= 1),
    model text not null ${NAMED('model')},
    vector blob not null check (length(vector) > 0),
    check ((kind = 'pet') = (species is not null))
  ) strict`,
  'create index photo_faces_by_item on photo_faces (item_id)',
  'create index photo_faces_by_kind on photo_faces (kind)',
  `create table photo_groups (
    id text primary key,
    profile_id text not null references profiles (id) on delete cascade,
    kind text not null check (kind in ('person', 'pet')),
    species text check (species is null or length(trim(species)) > 0),
    name text check (name is null or length(trim(name)) > 0),
    linked_profile_id text references profiles (id) on delete set null,
    cover_face_id text references photo_faces (id) on delete set null,
    hidden integer not null ${FLAG('hidden')},
    created_at text not null,
    updated_at text not null,
    check ((kind = 'pet') = (species is not null)),
    check (kind = 'person' or linked_profile_id is null)
  ) strict`,
  'create index photo_groups_by_profile on photo_groups (profile_id, kind)',
  'create index photo_groups_by_linked on photo_groups (linked_profile_id) where linked_profile_id is not null',
  'create index photo_groups_by_cover on photo_groups (cover_face_id) where cover_face_id is not null',
  `create table photo_group_faces (
    group_id text not null references photo_groups (id) on delete cascade,
    face_id text not null references photo_faces (id) on delete cascade,
    profile_id text not null references profiles (id) on delete cascade,
    source text not null check (source in ('auto', 'confirmed', 'rejected')),
    primary key (group_id, face_id)
  ) strict, without rowid`,
  `create unique index photo_group_faces_one_group
    on photo_group_faces (profile_id, face_id) where source <> 'rejected'`,
  'create index photo_group_faces_by_face on photo_group_faces (face_id)',
  'create index photo_group_faces_by_profile on photo_group_faces (profile_id)',
];

const EDITS = [
  `create table photo_edits (
    item_id text not null references drive_items (id) on delete cascade,
    profile_id text not null references profiles (id) on delete cascade,
    recipe text not null ${JSON_OBJECT('recipe')},
    base_version_id text references drive_versions (id) on delete set null,
    result_sha256 text not null check (length(result_sha256) = 64),
    updated_at text not null,
    primary key (item_id, profile_id)
  ) strict, without rowid`,
  'create index photo_edits_by_profile on photo_edits (profile_id)',
  'create index photo_edits_by_version on photo_edits (base_version_id) where base_version_id is not null',
  `create table photo_meta_overrides (
    item_id text primary key references drive_items (id) on delete cascade,
    taken_at text check (taken_at is null or datetime(taken_at) is not null),
    tz_offset_min integer check (tz_offset_min is null or tz_offset_min between -1440 and 1440),
    lat real check (lat is null or lat between -90 and 90),
    lon real check (lon is null or lon between -180 and 180),
    place_label text check (place_label is null or length(trim(place_label)) > 0),
    location_cleared integer not null default 0 check (location_cleared in (0, 1)),
    set_by text references profiles (id) on delete set null,
    set_at text not null,
    check ((lat is null) = (lon is null)),
    check (tz_offset_min is null or taken_at is not null),
    check (place_label is null or lat is not null),
    check (location_cleared = 0 or lat is null),
    check (taken_at is not null or lat is not null or location_cleared = 1)
  ) strict`,
  'create index photo_meta_overrides_by_setter on photo_meta_overrides (set_by) where set_by is not null',
];

const PRIVACY = [
  `create table photo_archive (
    profile_id text not null references profiles (id) on delete cascade,
    item_id text not null references drive_items (id) on delete cascade,
    archived_at text not null,
    primary key (profile_id, item_id)
  ) strict, without rowid`,
  'create index photo_archive_by_item on photo_archive (item_id)',
  `create table photo_locked (
    profile_id text primary key references profiles (id) on delete cascade,
    pin_hash text not null ${NAMED('pin_hash')},
    pin_salt text not null ${NAMED('pin_salt')},
    created_at text not null
  ) strict`,
  `create table photo_unlocks (
    token_hash text primary key,
    profile_id text not null references profiles (id) on delete cascade,
    client_id text not null references clients (id) on delete cascade,
    expires_at text not null
  ) strict`,
  'create index photo_unlocks_by_profile on photo_unlocks (profile_id)',
  'create index photo_unlocks_by_client on photo_unlocks (client_id)',
  'create index photo_unlocks_by_expiry on photo_unlocks (expires_at)',
];

const SHARING = [
  `create table photo_album_members (
    album_id text not null references drive_albums (id) on delete cascade,
    profile_id text not null references profiles (id) on delete cascade,
    role text not null check (role in ('contributor', 'viewer')),
    added_by text not null references profiles (id) on delete cascade,
    joined_at text,
    primary key (album_id, profile_id)
  ) strict, without rowid`,
  'create index photo_album_members_by_profile on photo_album_members (profile_id)',
  'create index photo_album_members_by_adder on photo_album_members (added_by)',
  `create table photo_album_activity (
    id text primary key,
    album_id text not null references drive_albums (id) on delete cascade,
    item_id text references drive_items (id) on delete cascade,
    profile_id text not null references profiles (id) on delete cascade,
    kind text not null check (kind in ('added', 'comment', 'like', 'joined', 'left')),
    text text check (text is null or length(trim(text)) > 0),
    created_at text not null,
    check ((kind = 'comment') = (text is not null)),
    check (kind <> 'added' or item_id is not null),
    check (kind not in ('joined', 'left') or item_id is null)
  ) strict`,
  'create index photo_album_activity_by_album on photo_album_activity (album_id, created_at desc, id)',
  'create index photo_album_activity_by_item on photo_album_activity (item_id) where item_id is not null',
  'create index photo_album_activity_by_profile on photo_album_activity (profile_id)',
  `create unique index photo_album_activity_one_like
    on photo_album_activity (album_id, coalesce(item_id, ''), profile_id) where kind = 'like'`,
  `create table photo_partner_shares (
    id text primary key,
    sharer_id text not null references profiles (id) on delete cascade,
    recipient_id text not null references profiles (id) on delete cascade,
    scope text not null check (scope in ('all', 'people')),
    from_day text not null ${DAY('from_day')},
    state text not null check (state in ('offered', 'accepted', 'stopped')),
    auto_save integer not null ${FLAG('auto_save')},
    created_at text not null,
    check (sharer_id <> recipient_id)
  ) strict`,
  `create table photo_partner_groups (
    share_id text not null references photo_partner_shares (id) on delete cascade,
    group_id text not null references photo_groups (id) on delete cascade,
    primary key (share_id, group_id)
  ) strict, without rowid`,
  'create index photo_partner_groups_by_group on photo_partner_groups (group_id)',
  `create unique index photo_partner_shares_open
    on photo_partner_shares (sharer_id, recipient_id) where state <> 'stopped'`,
  'create index photo_partner_shares_by_recipient on photo_partner_shares (recipient_id, state)',
  `create table photo_partner_saved_albums (
    sharer_id text not null references profiles (id) on delete cascade,
    recipient_id text not null references profiles (id) on delete cascade,
    album_id text not null references drive_albums (id) on delete cascade,
    primary key (sharer_id, recipient_id)
  ) strict, without rowid`,
  'create unique index photo_partner_saved_albums_by_album on photo_partner_saved_albums (album_id)',
];

const ALBUM_ADDERS = [
  'alter table drive_album_items add column added_by text references profiles (id) on delete cascade',
  `update drive_album_items set added_by =
    (select a.owner_profile_id from drive_albums a where a.id = drive_album_items.album_id)`,
  'create index drive_album_items_by_adder on drive_album_items (added_by) where added_by is not null',
];

const SHARE_COLUMNS = `id, token_hash, permission, expires_at, password_hash, created_by,
  created_at, revoked_at, opens, downloads, last_opened_at`;

const SHARES = [
  `create table drive_shares_next (
    id text primary key,
    item_id text,
    album_id text references drive_albums (id) on delete cascade,
    token_hash text not null unique,
    permission text not null check (permission in ('view', 'download')),
    expires_at text,
    password_hash text check (password_hash is null or length(password_hash) > 0),
    created_by text not null references profiles (id) on delete cascade,
    created_at text not null,
    revoked_at text,
    opens integer not null ${COUNT('opens')},
    downloads integer not null ${COUNT('downloads')},
    last_opened_at text,
    check ((item_id is null) <> (album_id is null))
  ) strict`,
  `insert into drive_shares_next (item_id, ${SHARE_COLUMNS})
    select item_id, ${SHARE_COLUMNS} from drive_shares`,
  'drop table drive_shares',
  'alter table drive_shares_next rename to drive_shares',
  'create index drive_shares_by_item on drive_shares (item_id, created_at desc) where item_id is not null',
  'create index drive_shares_by_album on drive_shares (album_id, created_at desc) where album_id is not null',
  'create index drive_shares_by_creator on drive_shares (created_by)',
];

const SEARCH = [
  `create virtual table drive_items_search_next using fts5(
    item_id unindexed, name, path, camera, albums, dates, labels,
    tokenize = 'unicode61 remove_diacritics 2'
  )`,
  `insert into drive_items_search_next (item_id, name, path, camera, albums, dates, labels)
    select item_id, name, path, camera, albums, dates, '' from drive_items_search`,
  'drop table drive_items_search',
  'alter table drive_items_search_next rename to drive_items_search',
];

const PHOTOS_PAGE = 'photos';

const PHOTOS_PREF_FROM = 3;

const PHOTOS_PREF_TO = 4;

const DEFAULT_PREF = {
  showCameras: true,
  showAi: true,
  libraryZoom: 'days',
  libraryGroup: 'day',
  showVideos: true,
  showNotBackedUp: true,
  map: true,
  removeLocationOutside: true,
  faceGrouping: true,
  albumActivity: true,
} as const;

const PREF_ROW = z.object({
  profile_id: z.string(),
  owner: z.number(),
  layout: SQL_JSON.nullable(),
});

const STORED_PREF = z.looseObject({
  version: z.literal(PHOTOS_PREF_FROM),
  value: z.looseObject({}),
});

function seedOwnerPref(sql: Sql, profileId: string, now: string): void {
  sql.run(
    'seed the Photos preferences of an owner with Smart search on',
    `insert into layouts (client_id, profile_id, page, layout, updated_at)
      values (null, $profileId, $page, $layout, $now)`,
    {
      profileId,
      page: PHOTOS_PAGE,
      layout: jsonText({
        version: PHOTOS_PREF_TO,
        value: { ...DEFAULT_PREF, smartSearch: true },
      }),
      now,
    },
  );
}

function moveStoredPref(
  sql: Sql,
  row: z.output<typeof PREF_ROW>,
  stored: z.output<typeof STORED_PREF>,
  now: string,
): void {
  sql.run(
    'add the wave 2 Photos preferences to a stored layout',
    'update layouts set layout = $layout, updated_at = $now where profile_id = $profileId and page = $page',
    {
      profileId: row.profile_id,
      page: PHOTOS_PAGE,
      layout: jsonText({
        ...stored,
        version: PHOTOS_PREF_TO,
        value: {
          ...stored.value,
          smartSearch: row.owner === 1,
          faceGrouping: true,
          albumActivity: true,
        },
      }),
      now,
    },
  );
}

export function photosWave2Prefs(sql: Sql, now: string): LogPayload {
  const rows = sql.all(
    PREF_ROW,
    `select p.id as profile_id,
        coalesce((select a.role = 'owner' from person_access a where a.profile_id = p.id), 0) as owner,
        (select l.layout from layouts l where l.profile_id = p.id and l.page = $page) as layout
      from profiles p`,
    { page: PHOTOS_PAGE },
  );
  let moved = 0;
  let seeded = 0;
  for (const row of rows) {
    if (row.layout === null) {
      if (row.owner !== 1) continue;
      seedOwnerPref(sql, row.profile_id, now);
      seeded += 1;
      continue;
    }
    const stored = STORED_PREF.safeParse(row.layout);
    if (!stored.success) continue;
    moveStoredPref(sql, row, stored.data, now);
    moved += 1;
  }
  return { preferencesMoved: moved, preferencesSeeded: seeded };
}

export const PHOTOS_WAVE2_MIGRATION: Migration = {
  version: 214,
  name: 'photos-wave2',
  foreignKeys: 'off',
  statements: [
    ...ANALYSIS,
    ...FACES,
    ...EDITS,
    ...PRIVACY,
    ...SHARING,
    ...ALBUM_ADDERS,
    ...SHARES,
    ...SEARCH,
  ],
  backfill: photosWave2Prefs,
};
