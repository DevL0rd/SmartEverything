import type { BackupRegister } from '@smarteverything/domain';
import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, expect, it } from 'vitest';
import type { Caller } from '../../src/server/auth';
import { nodeFiles } from '../../src/drive/versions';
import { BackupService } from '../../src/photos/backup';
import { DriveBackupRepository } from '../../src/store/repositories/drive-backup';
import { photoBackupRoutes } from '../../src/photos/backup-routes';
import { insertDriveRow } from './photo-rows';
import { testLogger } from '../support/logs';
import { testStore, type TestStore } from '../support/store';

let fixture: TestStore;
beforeEach(async () => {
  fixture = await testStore();
});
afterEach(async () => {
  await fixture.close();
});

function pairedDevice(kind: 'phone' | 'computer' = 'computer'): {
  deviceId: string;
  caller: Caller;
} {
  const { store } = fixture;
  const profileId = store.profiles.create({ name: 'Desktop person' }).id;
  insertDriveRow(store.database, { id: randomUUID(), scope: 'person', ownerId: profileId });
  const clientId = randomUUID();
  store.context.sql.run(
    'create fixture client',
    `insert into clients (id,name,platform,role,token_hash,profile_id,created_at) values ($id,'Desktop',$platform,'member',$token,$profile,$now)`,
    {
      id: clientId,
      token: randomUUID(),
      profile: profileId,
      platform: kind === 'computer' ? 'web' : 'android',
      now: store.now().toISOString(),
    },
  );
  const [device] = store.devices.upsert([
    {
      provider: 'local',
      externalId: randomUUID(),
      parentId: null,
      kind,
      name: 'Laptop',
      model: 'smarteverything.computer',
      manufacturer: 'Test',
      providerRoom: null,
      roomId: null,
      online: true,
      capabilities: [],
      details: kind === 'phone' ? { clientId, profileId } : {},
    },
  ]);
  if (device === undefined) throw new Error('Missing fixture computer');
  if (kind === 'computer')
    store.computerNodes.bind({
      deviceId: device.id,
      machineId: device.id.replaceAll('-', ''),
      tokenHash: randomUUID(),
      hubUrl: 'https://fixture.test',
      windowClientId: clientId,
      profileId,
    });
  return {
    deviceId: device.id,
    caller: { kind: 'client', client: store.clients.byId(clientId), profileId },
  };
}

function routes(): ReturnType<typeof photoBackupRoutes> {
  const store = fixture.store;
  const service = new BackupService({
    store: { ...store, driveBackup: new DriveBackupRepository(store.context) },
    sql: store.context.sql,
    log: testLogger(),
    now: store.now,
    files: nodeFiles,
    purge: { rearm: (): void => undefined },
  });
  return photoBackupRoutes(store, service);
}

function raw(
  deviceId: string,
  platform: BackupRegister['platform'] = 'desktop',
): {
  params: Record<string, never>;
  query: Record<string, never>;
  body: unknown;
  remote: string;
  headers: Record<string, string>;
} {
  return {
    params: {},
    query: {},
    body: {
      deviceId,
      name: 'Laptop',
      platform,
      settings: {
        enabled: true,
        folders: [],
        wifiOnly: true,
        chargingOnly: false,
        includeVideos: true,
      },
    },
    remote: '127.0.0.1',
    headers: {},
  };
}

it('backs up only the active paired computer belonging to the calling window and person', async () => {
  const mine = pairedDevice();
  const another = pairedDevice();
  const route = routes().registerBackupDevice;
  expect(await route.run(mine.caller, raw(mine.deviceId), testLogger())).toMatchObject({
    deviceId: mine.deviceId,
    platform: 'desktop',
  });
  await expect(route.run(mine.caller, raw(another.deviceId), testLogger())).rejects.toThrow(
    'paired phone or computer',
  );
  fixture.store.computerNodes.revoke(mine.deviceId);
  await expect(route.run(mine.caller, raw(mine.deviceId), testLogger())).rejects.toThrow(
    'paired phone or computer',
  );
});

it('rejects a backup platform inconsistent with the paired device without registering it', async () => {
  const computer = pairedDevice();
  const phone = pairedDevice('phone');
  const route = routes().registerBackupDevice;
  await expect(
    route.run(computer.caller, raw(computer.deviceId, 'android'), testLogger()),
  ).rejects.toThrow('backup platform must match');
  await expect(
    route.run(phone.caller, raw(phone.deviceId, 'desktop'), testLogger()),
  ).rejects.toThrow('backup platform must match');
  await expect(route.run(phone.caller, raw(phone.deviceId, 'ios'), testLogger())).rejects.toThrow(
    'backup platform must match',
  );
  const backup = new DriveBackupRepository(fixture.store.context);
  expect(backup.findDeviceByHubDevice(computer.deviceId)).toBeUndefined();
  expect(backup.findDeviceByHubDevice(phone.deviceId)).toBeUndefined();
  expect(await route.run(phone.caller, raw(phone.deviceId, 'android'), testLogger())).toMatchObject(
    { platform: 'android' },
  );
});
