import { DatabaseSync } from 'node:sqlite';
import { expect, it } from 'vitest';
import { migrate } from '../../src/store/migrate';
import { Sql } from '../../src/store/sql';
import { PHOTOS_DESKTOP_BACKUP_MIGRATION } from '../../src/store/migrations/photos-desktop-backup';
import { testLogger } from '../support/logs';

it('retains existing backup receipts and their foreign keys while adding desktop devices', () => {
  const database = new DatabaseSync(':memory:', { enableForeignKeyConstraints: true });
  try {
    database.exec(`
      create table profiles(id text primary key);
      create table devices(id text primary key);
      create table drive_backup_devices(id text primary key, profile_id text not null references profiles(id), device_id text not null unique references devices(id), name text not null, platform text not null check(platform in ('android','ios')),last_seen_at text,settings text not null);
      create index drive_backup_devices_by_profile on drive_backup_devices(profile_id,name);
      create table drive_backup_assets(backup_device_id text references drive_backup_devices(id) on delete cascade, local_id text, state text);
      insert into profiles values('person');
      insert into devices values('phone'),('desktop');
      insert into drive_backup_devices values('backup','person','phone','Phone','android',null,'{}');
      insert into drive_backup_assets values('backup','photo','verified');
    `);
    const sql = new Sql(database);
    migrate(sql, [PHOTOS_DESKTOP_BACKUP_MIGRATION], '2026-11-08T00:00:00.000Z', testLogger());
    expect(database.prepare('select * from drive_backup_assets').all()).toEqual([
      { backup_device_id: 'backup', local_id: 'photo', state: 'verified' },
    ]);
    database.exec(
      "insert into drive_backup_devices values('desktop-backup','person','desktop','Desktop','desktop',null,'{}')",
    );
    expect(database.prepare('pragma foreign_key_check').all()).toEqual([]);
    expect(database.prepare('pragma foreign_keys').get()).toEqual({ foreign_keys: 1 });
    expect(() => {
      database.exec(
        "insert into drive_backup_devices values('bad','person','missing','Bad','desktop',null,'{}')",
      );
    }).toThrow();
  } finally {
    database.close();
  }
});
