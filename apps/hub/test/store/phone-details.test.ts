import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { migrate } from '../../src/store/migrate';
import { MIGRATIONS } from '../../src/store/migrations';
import { Sql } from '../../src/store/sql';
import { captureLogs, testLogger, type CapturedLogs } from '../support/logs';
import { stampPhoneDetail } from '@smarteverything/domain';
import { addPhoneDevice, FULL_DETAIL, STORED_DETAIL } from '../support/phone-fixtures';
import { testStore, type TestStore } from '../support/store';

const LATER = '2026-10-18T10:05:00.000Z';
const NOW = '2026-10-18T09:00:00.000Z';
const VERSION = MIGRATIONS.find((migration) => migration.name === 'phone_details')?.version ?? 0;

let test: TestStore;
let logs: CapturedLogs;

beforeEach(async () => {
  logs = captureLogs();
  test = await testStore();
});

afterEach(async () => {
  await test.close();
});

function phone(): string {
  const profileId = test.store.profiles.first().id;
  return addPhoneDevice(test, { clientId: 'client-1', profileId, name: 'Pixel' }).device.id;
}

describe('stored phone detail', () => {
  it('reads nothing for a phone that has not reported detail', () => {
    expect(test.store.phoneDetails.read(phone())).toEqual({});
  });

  it('stamps every reported section with its time', () => {
    const id = phone();
    test.store.phoneDetails.merge(id, STORED_DETAIL);
    const stored = test.store.phoneDetails.read(id);
    expect(Object.keys(stored).sort()).toEqual(Object.keys(FULL_DETAIL).sort());
    expect(stored.power).toMatchObject({ level: 62, at: STORED_DETAIL.power?.at });
    expect(stored.apps?.installed).toHaveLength(2);
  });

  it('replaces only the sections a later report carries', () => {
    const id = phone();
    test.store.phoneDetails.merge(id, STORED_DETAIL);
    test.store.phoneDetails.merge(
      id,
      stampPhoneDetail({ alarm: { nextAt: null, appLabel: null } }, LATER),
    );
    const stored = test.store.phoneDetails.read(id);
    expect(stored.alarm).toEqual({ nextAt: null, appLabel: null, at: LATER });
    expect(stored.power?.at).toBe(STORED_DETAIL.power?.at);
    expect(stored.network?.wifi?.ssid).toBe('Home');
  });

  it('reads the sections that are still valid and logs the one that no longer is', () => {
    const id = phone();
    test.store.phoneDetails.merge(id, STORED_DETAIL);
    const raw = new DatabaseSync(join(test.directory, 'test.db'));
    raw.prepare('update phone_details set power = \'{"level":500}\' where device_id = ?').run(id);
    raw.close();
    const stored = test.store.phoneDetails.read(id);
    expect(logs.events()).toContain('phone.detail_unreadable');
    expect(stored.power).toBeUndefined();
    expect(Object.keys(stored).sort()).toEqual(
      Object.keys(STORED_DETAIL)
        .filter((name) => name !== 'power')
        .sort(),
    );
  });

  it('keeps the detail of each phone apart', () => {
    const first = phone();
    const second = addPhoneDevice(test, {
      clientId: 'client-2',
      profileId: test.store.profiles.first().id,
      name: 'Tablet',
    }).device.id;
    test.store.phoneDetails.merge(first, STORED_DETAIL);
    expect(test.store.phoneDetails.read(second)).toEqual({});
  });

  it('is removed with the device', () => {
    const id = phone();
    test.store.phoneDetails.merge(id, STORED_DETAIL);
    test.store.devices.remove([id]);
    expect(test.store.phoneDetails.read(id)).toEqual({});
  });
});

describe('stored phone icons', () => {
  const BYTES = Buffer.from('RIFF0000WEBPVP8 ', 'latin1');
  const HASH = createHash('sha256').update(BYTES).digest('hex');

  it('returns the bytes saved under a hash and nothing for an unknown hash', () => {
    test.store.phoneIcons.save(HASH, BYTES);
    expect(Buffer.from(test.store.phoneIcons.find(HASH) ?? []).equals(BYTES)).toBe(true);
    expect(test.store.phoneIcons.find('0'.repeat(64))).toBeUndefined();
  });

  it('keeps the first copy when the same hash is saved again', () => {
    test.store.phoneIcons.save(HASH, BYTES);
    test.store.phoneIcons.save(HASH, Buffer.from('other'));
    expect(Buffer.from(test.store.phoneIcons.find(HASH) ?? []).equals(BYTES)).toBe(true);
  });
});

describe('phone detail migration', () => {
  let directory: string;
  let database: DatabaseSync;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'hub-phone-detail-'));
    database = new DatabaseSync(join(directory, 'hub.db'), { enableForeignKeyConstraints: true });
  });

  afterEach(async () => {
    database.close();
    await rm(directory, { recursive: true, force: true });
  });

  function upTo(version: number): void {
    migrate(
      new Sql(database),
      MIGRATIONS.filter((migration) => migration.version <= version),
      NOW,
      testLogger(),
    );
  }

  function tables(): string[] {
    return database
      .prepare("select name from sqlite_master where type = 'table' and name like 'phone_%'")
      .all()
      .map((row) => String(row['name']))
      .sort();
  }

  it('adds the detail and icon tables and nothing before it', () => {
    upTo(VERSION - 1);
    expect(tables()).toEqual(['phone_contexts']);
    upTo(VERSION);
    expect(tables()).toEqual(['phone_contexts', 'phone_details', 'phone_icons']);
  });

  it('refuses a section that is not JSON and an icon hash of the wrong length', () => {
    upTo(VERSION);
    database
      .prepare(
        "insert into devices (id, provider, external_id, kind, name, model, manufacturer, online, capabilities, details, created_at, updated_at) values ('d1', 'local', 'phone:1', 'phone', 'P', 'm', 'v', 1, '[]', '{}', ?, ?)",
      )
      .run(NOW, NOW);
    expect(() =>
      database
        .prepare("insert into phone_details (device_id, power) values ('d1', 'not json')")
        .run(),
    ).toThrow(/constraint/i);
    expect(() =>
      database
        .prepare("insert into phone_icons (hash, webp, created_at) values ('short', x'00', ?)")
        .run(NOW),
    ).toThrow(/constraint/i);
  });
});
