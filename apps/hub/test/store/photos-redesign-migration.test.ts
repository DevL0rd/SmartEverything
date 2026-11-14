import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { migrate } from '../../src/store/migrate';
import { MIGRATIONS } from '../../src/store/migrations';
import { PHOTOS_REDESIGN_MIGRATION } from '../../src/store/migrations/photos-redesign';
import { Sql } from '../../src/store/sql';
import { testLogger } from '../support/logs';

const NOW = '2026-11-14T09:00:00.000Z';
const PROFILE = '0e000000-0000-4000-8000-0000000000f1';
const CHAT = '0e000000-0000-4000-8000-0000000000c1';
const CLIENT = 'c1';

const LAYOUTS = z.array(z.object({ owner: z.string(), page: z.string(), layout: z.string() }));
const MESSAGES = z.array(z.object({ id: z.string(), embeds: z.string() }));

const pin = (id: string, path: string): unknown => ({
  kind: 'pin',
  id,
  target: { kind: 'page', path },
  title: `Title ${id}`,
  icon: null,
});

const navigation = (items: readonly unknown[] | null): unknown => ({
  version: 1,
  value: { items, hidden: [] },
});

const widget = (key: string, type: string): unknown => ({ key, type, size: 'M' });

const arrangements = (types: readonly string[]): Record<string, unknown> =>
  Object.fromEntries(
    ['compact', 'medium', 'expanded'].map((name) => [
      name,
      { widgets: types.map((type) => widget(type, type)) },
    ]),
  );

const stage = (types: readonly string[]): unknown => ({
  version: 2,
  classes: arrangements(types),
  added: arrangements(types),
  previous: { classes: arrangements(types), added: arrangements(types) },
});

const PREF_BEFORE = {
  version: 1,
  value: {
    showCameras: true,
    showAi: false,
    timelineZoom: 'months',
    timelineGroup: 'month',
    showVideos: true,
    showNotBackedUp: true,
    memories: true,
    tripDistanceKm: 80,
    yearInReview: false,
    excludedAlbumIds: [],
    map: true,
    removeLocationOutside: true,
  },
};

const PREF_AFTER = {
  version: 3,
  value: {
    showCameras: true,
    showAi: false,
    libraryZoom: 'months',
    libraryGroup: 'month',
    showVideos: true,
    showNotBackedUp: true,
    map: true,
    removeLocationOutside: true,
  },
};

const FITNESS = { goals: { steps: 9000 } };
const UNTOUCHED_BOARD = stage(['steps', 'sleep']);

const PROFILE_ROWS: readonly (readonly [string, unknown])[] = [
  ['photos', PREF_BEFORE],
  ['fitness', FITNESS],
  ['home', stage(['steps', 'photo-memories', 'sleep'])],
  ['devices', UNTOUCHED_BOARD],
  [
    'navigation',
    navigation([
      pin('a', 'photos-search'),
      pin('b', 'photos-memories'),
      pin('c', 'photos-duplicates'),
      pin('d', 'photos-backup'),
      pin('e', 'photos-cameras'),
      {
        kind: 'folder',
        id: 'f',
        title: 'Pictures',
        icon: 'image',
        items: [
          pin('g', 'photos-memories'),
          pin('h', 'photos-ai'),
          { kind: 'section', section: 'photos' },
        ],
      },
    ]),
  ],
];

const CLIENT_ROWS: readonly (readonly [string, unknown])[] = [
  [
    'navigation-device',
    {
      version: 1,
      value: {
        override: {
          items: [pin('x', 'photos'), pin('y', 'photos-search'), pin('z', 'photos-memories')],
          hidden: [],
        },
      },
    },
  ],
  ['home', stage(['photo-memories'])],
  ['navigation-device', { version: 1, value: { override: null } }],
];

const PROFILE_AFTER: Readonly<Record<string, unknown>> = {
  photos: PREF_AFTER,
  fitness: FITNESS,
  home: stage(['steps', 'sleep']),
  devices: UNTOUCHED_BOARD,
  navigation: navigation([
    pin('a', 'photos'),
    pin('c', 'settings/photos/duplicates'),
    pin('d', 'settings/photos/backup'),
    pin('e', 'photos-cameras'),
    {
      kind: 'folder',
      id: 'f',
      title: 'Pictures',
      icon: 'image',
      items: [pin('h', 'photos-ai'), { kind: 'section', section: 'photos' }],
    },
  ]),
};

const MEMORY_EMBEDS = [
  { kind: 'photos', view: 'memory', id: 'on-this-day' },
  { kind: 'board', type: 'photo-memories' },
  { kind: 'setting_link', setting: 'photos.memories.enabled', value: null },
  { kind: 'setting_link', setting: 'photos.memories.trip_distance', value: '50' },
  { kind: 'setting_link', setting: 'photos.memories.year_in_review', value: null },
  { kind: 'setting_link', setting: 'photos.memories.excluded', value: null },
  { kind: 'setting_link', setting: 'photos.sources.folders', value: null },
  { kind: 'setting_link', setting: 'photos.phones', value: null },
  { kind: 'setting_link', setting: 'photos.backup.status', value: null },
  { kind: 'setting_link', setting: 'photos.backup.free_up', value: null },
];

const KEPT_EMBEDS = [
  { kind: 'photos', view: 'album', id: 'a1' },
  { kind: 'photos', view: 'month', id: '2026-07' },
  { kind: 'board', type: 'steps' },
  { kind: 'setting_link', setting: 'photos.map', value: null },
  { kind: 'helper_dialogue', direction: 'in' },
];

const MESSAGE_IDS = {
  mixed: '0e000000-0000-4000-8000-0000000000a1',
  onlyMemory: '0e000000-0000-4000-8000-0000000000a2',
  plain: '0e000000-0000-4000-8000-0000000000a3',
};

let database: DatabaseSync;

beforeEach(() => {
  database = new DatabaseSync(':memory:', { enableForeignKeyConstraints: true });
  migrate(
    new Sql(database),
    MIGRATIONS.filter((migration) => migration.version < PHOTOS_REDESIGN_MIGRATION.version),
    NOW,
    testLogger(),
  );
  database
    .prepare(
      "insert into profiles (id, name, colour, fitness_goals, position, created_at, updated_at) values (?, 'Ann', 'amber', '{}', 0, ?, ?)",
    )
    .run(PROFILE, NOW, NOW);
  database
    .prepare(
      "insert into clients (id, name, platform, role, built_in, token_hash, created_at) values (?, ?, 'android', 'owner', 0, 'hash', ?)",
    )
    .run(CLIENT, CLIENT, NOW);
  database
    .prepare(
      "insert into ai_chats (id, profile_id, kind, title, engine, pinned, created_at, updated_at) values (?, ?, 'chat', 'Home', '{}', 0, ?, ?)",
    )
    .run(CHAT, PROFILE, NOW, NOW);
  for (const [page, layout] of PROFILE_ROWS)
    database
      .prepare(
        'insert into layouts (client_id, profile_id, page, layout, updated_at) values (null, ?, ?, ?, ?)',
      )
      .run(PROFILE, page, JSON.stringify(layout), NOW);
  for (const [page, layout] of CLIENT_ROWS.slice(0, 2))
    database
      .prepare(
        'insert into layouts (client_id, profile_id, page, layout, updated_at) values (?, null, ?, ?, ?)',
      )
      .run(CLIENT, page, JSON.stringify(layout), NOW);
  const add = database.prepare(
    "insert into assistant_messages (id, profile_id, role, kind, author, text, attachments, chat_id, embeds, created_at, updated_at) values (?, ?, 'responder', 'text', 'Nova', 'hi', '[]', ?, ?, ?, ?)",
  );
  add.run(
    MESSAGE_IDS.mixed,
    PROFILE,
    CHAT,
    JSON.stringify([...KEPT_EMBEDS, ...MEMORY_EMBEDS]),
    NOW,
    NOW,
  );
  add.run(MESSAGE_IDS.onlyMemory, PROFILE, CHAT, JSON.stringify(MEMORY_EMBEDS), NOW, NOW);
  add.run(MESSAGE_IDS.plain, PROFILE, CHAT, JSON.stringify(KEPT_EMBEDS), NOW, NOW);
});

afterEach(() => {
  database.close();
});

function layouts(): { profile: Record<string, unknown>; client: Record<string, unknown> } {
  const rows = LAYOUTS.parse(
    database
      .prepare(
        'select coalesce(client_id, profile_id) as owner, page, layout from layouts order by rowid',
      )
      .all(),
  );
  const pick = (owner: string): Record<string, unknown> =>
    Object.fromEntries(
      rows.filter((row) => row.owner === owner).map((row) => [row.page, JSON.parse(row.layout)]),
    );
  return { profile: pick(PROFILE), client: pick(CLIENT) };
}

function messages(): Record<string, unknown> {
  return Object.fromEntries(
    MESSAGES.parse(database.prepare('select id, embeds from assistant_messages').all()).map(
      (row) => [row.id, JSON.parse(row.embeds)],
    ),
  );
}

function run(): void {
  migrate(new Sql(database), MIGRATIONS, NOW, testLogger());
}

describe('the Photos redesign migration', () => {
  it('moves a version 2 Photos pref that still has the excluded albums to version 3', () => {
    database.prepare("update layouts set layout = ? where page = 'photos'").run(
      JSON.stringify({
        version: 2,
        value: { ...PREF_AFTER.value, excludedAlbumIds: ['0e000000-0000-4000-8000-0000000000b1'] },
      }),
    );
    run();

    expect(layouts().profile['photos']).toStrictEqual(PREF_AFTER);
  });

  it('moves the Photos pref to version 3 and removes the Memories fields', () => {
    run();

    expect(layouts().profile['photos']).toStrictEqual(PREF_AFTER);
  });

  it('removes Memories board widgets from every arrangement and leaves other boards byte identical', () => {
    run();
    const { profile, client } = layouts();

    expect(profile['home']).toStrictEqual(PROFILE_AFTER['home']);
    expect(client['home']).toStrictEqual(stage([]));
    expect(profile['devices']).toStrictEqual(UNTOUCHED_BOARD);
    expect(profile['fitness']).toStrictEqual(FITNESS);
  });

  it('rewrites the synced navigation pins, in top level items and folders', () => {
    run();

    expect(layouts().profile['navigation']).toStrictEqual(PROFILE_AFTER['navigation']);
  });

  it('removes the search pin of a device layout that already pins the Library', () => {
    run();

    expect(layouts().client['navigation-device']).toStrictEqual({
      version: 1,
      value: { override: { items: [pin('x', 'photos')], hidden: [] } },
    });
  });

  it('removes the Memories embeds and setting links from messages and keeps the rest', () => {
    run();

    expect(messages()).toStrictEqual({
      [MESSAGE_IDS.mixed]: KEPT_EMBEDS,
      [MESSAGE_IDS.onlyMemory]: [],
      [MESSAGE_IDS.plain]: KEPT_EMBEDS,
    });
  });

  it('points the Timeline setting links at the Library settings', () => {
    const renamed = '0e000000-0000-4000-8000-0000000000a4';
    database
      .prepare(
        "insert into assistant_messages (id, profile_id, role, kind, author, text, attachments, chat_id, embeds, created_at, updated_at) values (?, ?, 'responder', 'text', 'Nova', 'hi', '[]', ?, ?, ?, ?)",
      )
      .run(
        renamed,
        PROFILE,
        CHAT,
        JSON.stringify([
          { kind: 'setting_link', setting: 'photos.timeline.zoom', value: 'months' },
          { kind: 'setting_link', setting: 'photos.timeline.not_backed_up', value: null },
          { kind: 'setting_link', setting: 'photos.phones', value: null },
        ]),
        NOW,
        NOW,
      );
    run();

    expect(messages()[renamed]).toStrictEqual([
      { kind: 'setting_link', setting: 'photos.library.zoom', value: 'months' },
      { kind: 'setting_link', setting: 'photos.library.not_backed_up', value: null },
    ]);
  });

  it('logs the counts and changes nothing when run on the migrated data again', () => {
    run();
    const first = { layouts: layouts(), messages: messages() };
    const sql = new Sql(database);
    const counts = sql.transaction(() => PHOTOS_REDESIGN_MIGRATION.backfill?.(sql, NOW));

    expect(counts).toStrictEqual({ layouts: 0, widgets: 0, pins: 0, messages: 0, embeds: 0 });
    expect({ layouts: layouts(), messages: messages() }).toStrictEqual(first);
  });

  it('creates the stash for trashed rows', () => {
    run();

    expect(database.prepare('select count(*) as n from drive_trash_rows').get()).toEqual({ n: 0 });
  });
});
