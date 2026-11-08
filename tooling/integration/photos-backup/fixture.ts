import { createHash, randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import http from 'node:http';
import { join } from 'node:path';
import type { DriveItem, DriveRoot } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { folderDraft, recordItem, type ChangeEnv } from '../../../apps/hub/src/drive/changes';
import { TusUploads } from '../../../apps/hub/src/drive/uploads-tus';
import { nodeFiles } from '../../../apps/hub/src/drive/versions';
import type { VolumeSpace } from '../../../apps/hub/src/drive/volumes';
import type { TusCaller } from '../../../apps/hub/src/drive/uploads-tus-wire';
import { BackupService } from '../../../apps/hub/src/photos/backup';
import { DriveBackupRepository } from '../../../apps/hub/src/store/repositories/drive-backup';
import { UNSYNCED } from '../../../apps/hub/src/store/repositories/drive-roots';
import { captureLogs, testLogger } from '../../../apps/hub/test/support/logs';
import { testStore, type TestStore } from '../../../apps/hub/test/support/store';
import { PersistedUrlStorage } from '../../../apps/app/src/features/nas/uploads/resume-store';
import type {
  TransportAnswer,
  TransportRequest,
  UploadRequest,
} from '../../../apps/app/src/features/nas/uploads/types';

const NOW = new Date('2026-11-07T00:00:00.000Z');

export interface ProtocolFixture {
  readonly opened: TestStore;
  readonly root: DriveRoot;
  readonly folderId: string;
  readonly profileId: string;
  readonly phoneId: string;
  readonly service: BackupService;
  readonly origin: string;
  readonly close: () => Promise<void>;
}

export function hash(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

function rootRow(path: string, profileId: string): DriveRoot {
  const id = randomUUID();
  return {
    id,
    kind: 'managed',
    label: 'Isolated backup root',
    scope: 'person',
    ownerProfileId: profileId,
    path,
    readOnly: false,
    versions: true,
    volume: null,
    indexId: `index-${id}`,
    state: 'ready',
    stateReason: null,
    items: 0,
    folders: 0,
    bytes: 0,
    scannedAt: null,
    health: { hashedShare: 0, verifiedShare: 0, corrupt: 0, lastScrubAt: null, lastBackupAt: null },
    inPhotos: true,
    skipPatterns: [],
    includeHidden: false,
    synced: false,
    sync: UNSYNCED,
  };
}

function backupPhone(opened: TestStore, service: BackupService, profileId: string): string {
  const [phone] = opened.store.devices.upsert([
    {
      provider: 'local',
      externalId: 'isolated-backup-phone',
      parentId: null,
      kind: 'phone',
      name: 'Phone',
      model: 'Fake',
      manufacturer: 'Fake',
      providerRoom: null,
      roomId: null,
      online: true,
      capabilities: [],
      details: {},
    },
  ]);
  if (phone === undefined) throw new Error('Missing isolated phone');
  service.registerDevice(profileId, {
    deviceId: phone.id,
    name: 'Phone',
    platform: 'android',
    settings: {
      enabled: true,
      folders: ['Camera'],
      wifiOnly: true,
      chargingOnly: false,
      includeVideos: true,
    },
  });
  return phone.id;
}

async function listen(
  uploads: TusUploads,
): Promise<{ readonly origin: string; readonly server: http.Server }> {
  const server = http.createServer((request, response) => {
    background(uploads.handle(request, response), 'upload.integration_request_failed');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string')
    throw new Error('Missing isolated HTTP address');
  return { origin: `http://127.0.0.1:${String(address.port)}`, server };
}

type StorageFixture = Omit<ProtocolFixture, 'origin' | 'close'> & {
  readonly env: ChangeEnv;
  readonly clientId: string;
};

function folderOf(env: ChangeEnv, root: DriveRoot, profileId: string): string {
  return recordItem(env, {
    draft: folderDraft(
      {
        rootId: root.id,
        parentId: null,
        relPath: 'Uploads',
        modifiedAt: NOW.toISOString(),
        addedAt: NOW.toISOString(),
        outside: false,
        addedByProfileId: profileId,
      },
      0,
    ),
    identity: { dev: '1', ino: '1' },
    op: 'create',
    actor: { actorProfileId: profileId, via: 'app', deviceId: null },
  }).id;
}

async function storageFixture(): Promise<StorageFixture> {
  captureLogs();
  const opened = await testStore(() => NOW);
  const profileId = opened.store.profiles.create({ name: 'Isolated person' }).id;
  const root = rootRow(join(opened.directory, 'library'), profileId);
  await mkdir(join(opened.directory, 'library', 'Uploads'), { recursive: true });
  opened.store.driveRoots.insert(root);
  const env: ChangeEnv = {
    files: nodeFiles,
    store: opened.store,
    log: testLogger('upload-integration'),
    now: () => NOW,
    purge: { rearm: (): void => undefined },
  };
  const folderId = folderOf(env, root, profileId);
  const service = new BackupService({
    ...env,
    store: { ...opened.store, driveBackup: new DriveBackupRepository(opened.store.context) },
    sql: opened.store.context.sql,
  });
  const phoneId = backupPhone(opened, service, profileId);
  const client = opened.store.clients.create({
    name: 'Isolated phone',
    platform: 'android',
    role: 'member',
    tokenHash: 'a'.repeat(64),
  });
  return { opened, root, profileId, folderId, service, phoneId, clientId: client.id, env };
}

async function closeServer(server: http.Server, opened: TestStore): Promise<void> {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) =>
    server.close((cause) => {
      if (cause === undefined) resolve();
      else reject(cause);
    }),
  );
  await opened.close();
}

export async function protocolFixture(
  completed: (item: DriveItem, service: BackupService) => void = (item, service): void => {
    service.settleItem(item);
  },
): Promise<ProtocolFixture> {
  const storage = await storageFixture();
  const { env, opened, profileId, clientId, service } = storage;
  const uploads = new TusUploads({
    ...env,
    store: opened.store,
    space: (): Promise<VolumeSpace> => Promise.resolve({ totalBytes: 1e12, freeBytes: 1e12 }),
    authenticate: (request): TusCaller | null =>
      request.headers.authorization === 'Bearer isolated-client'
        ? { profileId, owner: false, clientId, nodeId: null }
        : null,
    completed: (item: DriveItem): void => {
      completed(item, service);
    },
  });
  const { origin, server } = await listen(uploads);
  return { ...storage, origin, close: () => closeServer(server, opened) };
}

export function resumeStorage(): PersistedUrlStorage {
  let value: string | null = null;
  return new PersistedUrlStorage({
    getItem: () => Promise.resolve(value),
    setItem: (_key, next): Promise<void> => {
      value = next;
      return Promise.resolve();
    },
  });
}

export async function exchange(
  origin: string,
  request: TransportRequest,
): Promise<TransportAnswer> {
  const response = await fetch(new URL(request.path, origin), {
    method: request.method,
    headers: { Authorization: 'Bearer isolated-client', ...request.headers },
    body: request.body,
    signal: request.signal,
  });
  return {
    status: response.status,
    headers: Object.fromEntries(response.headers),
    body: await response.text(),
  };
}

export function appRequest(folderId: string, text: string, name = 'app.jpg'): UploadRequest {
  return {
    identity: name,
    name,
    source: new Blob([text], { type: 'image/jpeg' }),
    target: { kind: 'folder', folderId },
    sha256: hash(text),
  };
}
