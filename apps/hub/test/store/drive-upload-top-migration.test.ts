import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { migrate } from '../../src/store/migrate';
import { DRIVE_UPLOAD_TOP_MIGRATION } from '../../src/store/migrations/drive-upload-top';
import { Sql } from '../../src/store/sql';
import { testLogger } from '../support/logs';

let database: DatabaseSync;

const UPLOAD = `insert into drive_uploads (id, root_id, target_kind, target_id, base_rev, name, length,
  offset, state, failure_reason, profile_id, client_id, node_id, created_at, expires_at,
  expected_sha256) values `;

beforeEach(() => {
  database = new DatabaseSync(':memory:', { enableForeignKeyConstraints: true });
  database.exec(`
    create table drive_roots(id text primary key);
    create table profiles(id text primary key);
    create table clients(id text primary key);
    create table computer_nodes(device_id text primary key);
    create table drive_uploads (
      id text primary key,
      root_id text not null references drive_roots (id) on delete cascade,
      target_kind text not null check (target_kind in ('folder', 'item')),
      target_id text not null,
      base_rev integer,
      name text not null,
      length integer not null,
      offset integer not null,
      state text not null,
      failure_reason text,
      profile_id text not null references profiles (id) on delete cascade,
      client_id text references clients (id) on delete cascade,
      node_id text references computer_nodes (device_id) on delete cascade,
      created_at text not null,
      expires_at text not null,
      expected_sha256 text
    ) strict;
    create table drive_upload_results (
      upload_id text primary key references drive_uploads(id) on delete cascade,
      item_id text not null,
      name text not null
    ) strict;
    insert into drive_roots values ('root');
    insert into profiles values ('person');
    insert into clients values ('phone');
    ${UPLOAD}('folder-upload', 'root', 'folder', 'folder', null, 'a.jpg', 10, 4, 'open', null,
      'person', 'phone', null, '2026-11-14T00:00:00Z', '2026-11-15T00:00:00Z', null),
      ('item-upload', 'root', 'item', 'file', 3, 'b.txt', 5, 5, 'complete', null,
      'person', 'phone', null, '2026-11-14T00:00:00Z', '2026-11-15T00:00:00Z', null);
    insert into drive_upload_results values ('item-upload', 'file', 'b.txt');
  `);
  migrate(
    new Sql(database),
    [DRIVE_UPLOAD_TOP_MIGRATION],
    '2026-11-14T00:00:00.000Z',
    testLogger(),
  );
});

afterEach(() => {
  database.close();
});

it('keeps every upload and its result while allowing uploads to the top of a drive', () => {
  expect(
    database.prepare('select id, target_kind, target_id from drive_uploads order by id').all(),
  ).toEqual([
    { id: 'folder-upload', target_kind: 'folder', target_id: 'folder' },
    { id: 'item-upload', target_kind: 'item', target_id: 'file' },
  ]);
  database.exec(
    `${UPLOAD}('top-upload', 'root', 'drive', 'root', null, 'c.pdf', 1, 0, 'open', null,
      'person', 'phone', null, '2026-11-14T00:00:00Z', '2026-11-15T00:00:00Z', null)`,
  );
  expect(database.prepare('pragma foreign_key_check').all()).toEqual([]);
  database.exec("delete from drive_uploads where id = 'item-upload'");
  expect(database.prepare('select count(*) as n from drive_upload_results').get()).toEqual({
    n: 0,
  });
});

it('refuses a drive top upload that names another drive', () => {
  database.exec("insert into drive_roots values ('other')");
  expect(() => {
    database.exec(
      `${UPLOAD}('bad', 'root', 'drive', 'other', null, 'c.pdf', 1, 0, 'open', null,
        'person', 'phone', null, '2026-11-14T00:00:00Z', '2026-11-15T00:00:00Z', null)`,
    );
  }).toThrow();
});
