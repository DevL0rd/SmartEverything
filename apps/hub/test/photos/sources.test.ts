import { createHash, randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { CLIENT_ROW, type DriveRoot } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fileDraft } from '../../src/drive/changes';
import { nodeFiles } from '../../src/drive/versions';
import { AiImageSource } from '../../src/photos/sources/ai-images';
import { CameraSource, savedName } from '../../src/photos/sources/cameras';
import { photoSourceRoutes } from '../../src/photos/sources/routes';
import type { SourceViewer, SourcesEnv, SourcesStore } from '../../src/photos/sources/shapes';
import { StoreContext } from '../../src/store/context';
import { ChangeFeed } from '../../src/store/feed';
import { migrate } from '../../src/store/migrate';
import { MIGRATIONS } from '../../src/store/migrations';
import { driveRepositories } from '../../src/store/repositories/areas/drive';
import { CamerasRepository } from '../../src/store/repositories/cameras';
import { DevicesRepository } from '../../src/store/repositories/devices';
import { UNSYNCED } from '../../src/store/repositories/drive-roots';
import { ProfilesRepository } from '../../src/store/repositories/profiles';
import { Sql } from '../../src/store/sql';
import { captureLogs, testLogger } from '../support/logs';
import { testStore, type TestStore } from '../support/store';

const NOW = '2026-11-07T08:00:00.000Z';
const PAGE = 200;

let database: DatabaseSync;
let context: StoreContext;
let store: SourcesStore;
let cameras: CamerasRepository;
let devices: DevicesRepository;
let base = '';
let env: SourcesEnv;
let alice = '';
let bob = '';
let homeRoot = '';
let aliceRoot = '';
let living = '';
let garage = '';
let blocked = '';
let permitted: string[] = [];
let cameraSource: CameraSource;
let aiSource: AiImageSource;
let nextIno = 1;

const sha = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');

function rootRow(
  id: string,
  path: string,
  scope: 'person' | 'home',
  owner: string | null,
): DriveRoot {
  return {
    id,
    kind: 'managed',
    label: 'Managed',
    scope,
    ownerProfileId: owner,
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

async function addRoot(
  name: string,
  scope: 'person' | 'home',
  owner: string | null,
): Promise<string> {
  const id = randomUUID();
  const path = join(base, name);
  await mkdir(path, { recursive: true });
  store.driveRoots.insert(rootRow(id, path, scope, owner));
  return id;
}

function camera(externalId: string, name: string): string {
  const [row] = devices.upsert([
    {
      provider: 'local',
      externalId,
      parentId: null,
      kind: 'camera',
      name,
      model: 'Cam',
      manufacturer: 'Acme',
      providerRoom: null,
      roomId: null,
      online: true,
      capabilities: [],
      details: {},
    },
  ]);
  if (row === undefined) throw new Error('the camera was not stored');
  cameras.upsert([
    {
      deviceId: row.id,
      streamName: externalId,
      sourceUrlKind: 'rtsp',
      physicalPtz: false,
      twoWayAudio: false,
    },
  ]);
  return row.id;
}

interface RecordingSpec {
  readonly deviceId: string;
  readonly kind: 'snapshot' | 'clip';
  readonly startedAt: string;
  readonly content?: string;
  readonly written?: boolean;
}

async function recording({
  deviceId,
  kind,
  startedAt,
  content = randomUUID(),
  written = true,
}: RecordingSpec): Promise<string> {
  const storagePath = `${deviceId}/${randomUUID()}.${kind === 'clip' ? 'mp4' : 'jpg'}`;
  if (written) {
    await mkdir(dirname(join(base, 'recordings', storagePath)), { recursive: true });
    await writeFile(join(base, 'recordings', storagePath), content);
  }
  return cameras.addRecording({
    deviceId,
    eventId: null,
    kind,
    storagePath,
    startedAt,
    durationMs: kind === 'clip' ? 5000 : null,
    bytes: content.length,
  }).id;
}

interface ImageSpec {
  readonly profileId: string;
  readonly chatId: string;
  readonly name: string;
  readonly content: string;
  readonly createdAt: string;
  readonly state?: string;
  readonly generated?: boolean;
}

function chat(profileId: string, title: string): string {
  const id = randomUUID();
  database
    .prepare(
      `insert into ai_chats (id, profile_id, kind, title, engine, pinned, created_at, updated_at)
       values (?, ?, 'chat', ?, '{}', 0, ?, ?)`,
    )
    .run(id, profileId, title, NOW, NOW);
  return id;
}

async function image(spec: ImageSpec): Promise<string> {
  const id = randomUUID();
  const storagePath = `${id}.png`;
  await mkdir(join(base, 'assistant'), { recursive: true });
  await writeFile(join(base, 'assistant', storagePath), spec.content);
  database
    .prepare(
      `insert into assistant_attachments (id, message_id, profile_id, name, mime, bytes, storage_path, sha256, created_at)
       values (?, null, ?, ?, 'image/png', ?, ?, ?, ?)`,
    )
    .run(
      id,
      spec.profileId,
      spec.name,
      spec.content.length,
      storagePath,
      sha(Buffer.from(spec.content)),
      spec.createdAt,
    );
  if (spec.generated === false) return id;
  const operation = randomUUID();
  database
    .prepare(
      `insert into image_operations (id, profile_id, chat_id, actor_key, request, receipt, state, created_at, updated_at)
       values (?, ?, ?, 'actor', '{}', '{}', ?, ?, ?)`,
    )
    .run(operation, spec.profileId, spec.chatId, spec.state ?? 'completed', NOW, NOW);
  database
    .prepare(
      'insert into image_artifacts (attachment_id, operation_id, position, lineage) values (?, ?, 0, ?)',
    )
    .run(id, operation, '[]');
  return id;
}

function owner(profileId: string): SourceViewer {
  return { profileId, devices: null };
}

beforeEach(async () => {
  captureLogs();
  base = await realpath(await mkdtemp(join(tmpdir(), 'photos-sources-')));
  database = new DatabaseSync(':memory:', { enableForeignKeyConstraints: true });
  const log = testLogger();
  const sql = new Sql(database);
  const feed = new ChangeFeed(log);
  context = new StoreContext(sql, feed, () => new Date(NOW));
  migrate(sql, MIGRATIONS, NOW, log);
  const profiles = new ProfilesRepository(context);
  devices = new DevicesRepository(context);
  cameras = new CamerasRepository(context);
  store = {
    ...driveRepositories(context),
    feed,
    write: <T>(work: () => T): T => context.write(work),
    devices,
    cameras,
    profiles,
  };
  alice = profiles.create({ name: 'Alice' }).id;
  bob = profiles.create({ name: 'Bob' }).id;
  homeRoot = await addRoot('home', 'home', null);
  aliceRoot = await addRoot('alice', 'person', alice);
  living = camera('living', 'Living room');
  garage = camera('garage', 'Garage');
  blocked = camera('hidden', 'Hidden room');
  permitted = [living, garage];
  env = {
    files: nodeFiles,
    store,
    sql,
    log,
    now: (): Date => new Date(NOW),
    purge: { rearm: (): void => undefined },
  };
  cameraSource = new CameraSource({
    env,
    recordingPath: (path: string): string => join(base, 'recordings', path),
    permitted: (): readonly string[] => permitted,
  });
  aiSource = new AiImageSource({
    env,
    attachmentPath: (path: string): string => join(base, 'assistant', path),
  });
});

afterEach(async () => {
  database.close();
  await rm(base, { recursive: true, force: true });
});

describe('cameras source', () => {
  it('lists clips and snapshots newest first with a chip and count per camera', async () => {
    const first = await recording({
      deviceId: living,
      kind: 'snapshot',
      startedAt: '2026-11-01T10:00:00.000Z',
    });
    const second = await recording({
      deviceId: garage,
      kind: 'clip',
      startedAt: '2026-11-02T10:00:00.000Z',
    });
    const third = await recording({
      deviceId: living,
      kind: 'clip',
      startedAt: '2026-11-03T10:00:00.000Z',
    });
    const page = cameraSource.page(owner(alice), {});
    expect(page.items.map((item) => item.itemId)).toEqual([third, second, first]);
    expect(page.items.map((item) => item.chipId)).toEqual([living, garage, living]);
    expect(page.items.every((item) => !item.kept)).toBe(true);
    expect(page.items.map((item) => item.mime)).toEqual(['video/mp4', 'video/mp4', 'image/jpeg']);
    expect(page.items.map((item) => item.durationMs)).toEqual([5000, 5000, null]);
    expect(page.items.every((item) => item.bytes > 0 && item.name.length > 0)).toBe(true);
    expect(page.chips).toEqual([
      { id: garage, name: 'Garage', count: 1 },
      { id: living, name: 'Living room', count: 2 },
    ]);
    expect(page.next).toBeNull();
    const only = cameraSource.page(owner(alice), { chipId: garage });
    expect(only.items.map((item) => item.itemId)).toEqual([second]);
  });

  it('never shows a camera that is blocked, its recordings or its chip', async () => {
    await recording({ deviceId: blocked, kind: 'snapshot', startedAt: '2026-11-01T10:00:00.000Z' });
    const shown = await recording({
      deviceId: living,
      kind: 'snapshot',
      startedAt: '2026-11-01T11:00:00.000Z',
    });
    const page = cameraSource.page(owner(alice), {});
    expect(page.items.map((item) => item.itemId)).toEqual([shown]);
    expect(page.chips.map((chip) => chip.id)).not.toContain(blocked);
    expect(() => cameraSource.page(owner(alice), { chipId: blocked })).toThrow(
      /not one you can see/,
    );
  });

  it('follows the camera access of the person', async () => {
    await recording({ deviceId: garage, kind: 'snapshot', startedAt: '2026-11-01T10:00:00.000Z' });
    const mine = await recording({
      deviceId: living,
      kind: 'snapshot',
      startedAt: '2026-11-01T11:00:00.000Z',
    });
    const member: SourceViewer = {
      profileId: bob,
      devices: { mode: 'only', rooms: [], devices: [living] },
    };
    const page = cameraSource.page(member, {});
    expect(page.items.map((item) => item.itemId)).toEqual([mine]);
    expect(page.chips.map((chip) => chip.id)).toEqual([living]);
    expect(() => cameraSource.page(member, { chipId: garage })).toThrow(/not one you can see/);
    await expect(cameraSource.keep(member, [mine])).resolves.toBe(1);
  });

  it('pages with a cursor that never repeats or skips recordings sharing one moment', async () => {
    const ids: string[] = [];
    for (let index = 0; index < PAGE + 2; index += 1) {
      ids.push(
        await recording({
          deviceId: living,
          kind: 'snapshot',
          startedAt: '2026-11-01T10:00:00.000Z',
        }),
      );
    }
    const first = cameraSource.page(owner(alice), {});
    expect(first.items).toHaveLength(PAGE);
    expect(first.next).not.toBeNull();
    const second = cameraSource.page(owner(alice), { cursor: first.next ?? '' });
    expect(second.items).toHaveLength(2);
    expect(second.next).toBeNull();
    const seen = [...first.items, ...second.items].map((item) => item.itemId);
    expect(new Set(seen)).toEqual(new Set(ids));
  });

  it('rejects a cursor this list never gave out', () => {
    expect(() => cameraSource.page(owner(alice), { cursor: 'nonsense' })).toThrow(/cursor/);
  });

  it('shows only what each camera still keeps and leaves kept copies alone', async () => {
    const old = await recording({
      deviceId: living,
      kind: 'snapshot',
      startedAt: '2026-11-01T10:00:00.000Z',
      content: 'old',
    });
    await cameraSource.keep(owner(alice), [old]);
    cameras.removeExpiredRecordings(new Date('2027-06-01T00:00:00.000Z'));
    const page = cameraSource.page(owner(alice), {});
    expect(page.items).toEqual([]);
    expect(page.chips.find((chip) => chip.id === living)?.count).toBe(0);
    const kept = store.driveItems.children(homeRoot, null, null, 10);
    expect(JSON.stringify(kept)).toContain('Saved');
    const files = await readdir(join(base, 'home', 'Saved', 'Cameras', 'Living room'));
    expect(files).toHaveLength(1);
  });
});

describe('keep from cameras', () => {
  it('copies the bytes into Saved/Cameras/<camera> and marks the item kept', async () => {
    const id = await recording({
      deviceId: living,
      kind: 'clip',
      startedAt: '2026-11-03T10:15:30.000Z',
      content: 'clip bytes',
    });
    const result = await cameraSource.keep(owner(alice), [id]);
    expect(result).toBe(1);
    const name = '2026-11-03 10.15.30 ' + id + '.mp4';
    const item = store.driveItems.byPath(homeRoot, `Saved/Cameras/Living room/${name}`);
    expect(item).toMatchObject({
      kind: 'video',
      bytes: 10,
      sha256: sha(Buffer.from('clip bytes')),
    });
    expect(
      await readFile(join(base, 'home', 'Saved', 'Cameras', 'Living room', name), 'utf8'),
    ).toBe('clip bytes');
    expect(
      ['Saved', 'Saved/Cameras', 'Saved/Cameras/Living room'].map(
        (path) => store.driveItems.byPath(homeRoot, path)?.kind,
      ),
    ).toEqual(['folder', 'folder', 'folder']);
    expect(cameraSource.page(owner(alice), {}).items[0]?.kept).toBe(true);
    expect(savedName({ id, kind: 'clip', started_at: '2026-11-03T10:15:30.000Z' })).toBe(name);
  });

  it('keeps one copy however often it is asked and stays kept after the camera is renamed', async () => {
    const id = await recording({
      deviceId: living,
      kind: 'snapshot',
      startedAt: '2026-11-03T10:00:00.000Z',
    });
    await expect(cameraSource.keep(owner(alice), [id])).resolves.toBe(1);
    devices.update(living, { display_name: 'Lounge' });
    await expect(cameraSource.keep(owner(alice), [id, id])).resolves.toBe(0);
    expect(await readdir(join(base, 'home', 'Saved', 'Cameras'))).toEqual(['Living room']);
    expect(cameraSource.page(owner(alice), {}).items[0]?.kept).toBe(true);
  });

  it('makes each folder once when several recordings are kept at the same time', async () => {
    const ids = [
      await recording({
        deviceId: living,
        kind: 'snapshot',
        startedAt: '2026-11-03T10:00:00.000Z',
      }),
      await recording({
        deviceId: living,
        kind: 'snapshot',
        startedAt: '2026-11-03T10:01:00.000Z',
      }),
      await recording({
        deviceId: garage,
        kind: 'snapshot',
        startedAt: '2026-11-03T10:02:00.000Z',
      }),
    ];
    const results = await Promise.all(ids.map((id) => cameraSource.keep(owner(alice), [id])));
    expect(results).toEqual([1, 1, 1]);
    expect((await readdir(join(base, 'home', 'Saved', 'Cameras'))).sort()).toEqual([
      'Garage',
      'Living room',
    ]);
  });

  it('refuses a blocked camera, an unknown recording and a lost file without copying anything', async () => {
    const hidden = await recording({
      deviceId: blocked,
      kind: 'snapshot',
      startedAt: '2026-11-03T10:00:00.000Z',
    });
    const fine = await recording({
      deviceId: living,
      kind: 'snapshot',
      startedAt: '2026-11-03T10:01:00.000Z',
    });
    const lost = await recording({
      deviceId: living,
      kind: 'snapshot',
      startedAt: '2026-11-03T10:02:00.000Z',
      written: false,
    });
    await expect(cameraSource.keep(owner(alice), [fine, hidden])).rejects.toThrow(
      /not one you can see/,
    );
    await expect(cameraSource.keep(owner(alice), [fine, randomUUID()])).rejects.toThrow(
      /no longer there/,
    );
    await expect(cameraSource.keep(owner(alice), [lost])).rejects.toThrow(/no longer on the hub/);
    expect(store.driveItems.byPath(homeRoot, 'Saved')).toBeUndefined();
  });

  it('says so when the hub has no SmartEverything folder', async () => {
    const id = await recording({
      deviceId: living,
      kind: 'snapshot',
      startedAt: '2026-11-03T10:00:00.000Z',
    });
    database.prepare('delete from drive_roots where id = ?').run(homeRoot);
    await expect(cameraSource.keep(owner(alice), [id])).rejects.toThrow(
      /no SmartEverything folder/,
    );
  });
});

describe('made with ai source', () => {
  it('lists only the completed images of the person with a chip per chat', async () => {
    const mine = chat(alice, 'Sunset');
    const other = chat(alice, 'Logo');
    const theirs = chat(bob, 'Bobs');
    const first = await image({
      profileId: alice,
      chatId: mine,
      name: 'a.png',
      content: 'a',
      createdAt: '2026-11-01T10:00:00.000Z',
    });
    const second = await image({
      profileId: alice,
      chatId: other,
      name: 'b.png',
      content: 'b',
      createdAt: '2026-11-02T10:00:00.000Z',
    });
    await image({
      profileId: alice,
      chatId: mine,
      name: 'c.png',
      content: 'c',
      createdAt: '2026-11-03T10:00:00.000Z',
      state: 'failed',
    });
    await image({
      profileId: alice,
      chatId: mine,
      name: 'upload.png',
      content: 'u',
      createdAt: '2026-11-04T10:00:00.000Z',
      generated: false,
    });
    await image({
      profileId: bob,
      chatId: theirs,
      name: 'x.png',
      content: 'x',
      createdAt: '2026-11-05T10:00:00.000Z',
    });
    const page = aiSource.page(owner(alice), {});
    expect(page.items.map((item) => item.itemId)).toEqual([second, first]);
    expect(page.items.map((item) => item.chipId)).toEqual([other, mine]);
    expect(page.items.map((item) => item.name)).toEqual(['b.png', 'a.png']);
    expect(
      page.items.every((item) => item.mime.startsWith('image/') && item.durationMs === null),
    ).toBe(true);
    expect(page.chips).toEqual([
      { id: other, name: 'Logo', count: 1 },
      { id: mine, name: 'Sunset', count: 1 },
    ]);
    expect(aiSource.page(owner(alice), { chipId: mine }).items.map((item) => item.itemId)).toEqual([
      first,
    ]);
    expect(aiSource.page(owner(bob), {}).items).toHaveLength(1);
  });

  it('gives the owner only their own images too', async () => {
    const theirs = chat(bob, 'Bobs');
    await image({
      profileId: bob,
      chatId: theirs,
      name: 'x.png',
      content: 'x',
      createdAt: '2026-11-05T10:00:00.000Z',
    });
    expect(aiSource.page(owner(alice), {}).items).toEqual([]);
  });

  it('copies a kept image into the Made with AI folder of the person and marks it kept', async () => {
    const conversation = chat(alice, 'Sunset');
    const id = await image({
      profileId: alice,
      chatId: conversation,
      name: 'sunset.png',
      content: 'pixels',
      createdAt: '2026-11-01T10:00:00.000Z',
    });
    await expect(aiSource.keep(owner(alice), [id])).resolves.toBe(1);
    const name = `sunset ${id.slice(0, 8)}.png`;
    expect(store.driveItems.byPath(aliceRoot, `Made with AI/${name}`)).toMatchObject({
      kind: 'image',
      sha256: sha(Buffer.from('pixels')),
    });
    expect(await readFile(join(base, 'alice', 'Made with AI', name), 'utf8')).toBe('pixels');
    expect(aiSource.page(owner(alice), {}).items[0]?.kept).toBe(true);
    await expect(aiSource.keep(owner(alice), [id])).resolves.toBe(0);
    expect(await readdir(join(base, 'alice', 'Made with AI'))).toEqual([name]);
  });

  it('counts an image already in the library as kept without copying it again', async () => {
    const conversation = chat(alice, 'Sunset');
    const id = await image({
      profileId: alice,
      chatId: conversation,
      name: 'same.png',
      content: 'same',
      createdAt: '2026-11-01T10:00:00.000Z',
    });
    store.driveItems.write({
      item: fileDraft(
        {
          rootId: aliceRoot,
          parentId: null,
          relPath: 'elsewhere.png',
          modifiedAt: NOW,
          addedAt: NOW,
          outside: false,
          addedByProfileId: alice,
        },
        { bytes: 4, sha256: sha(Buffer.from('same')) },
      ),
      identity: { dev: '1', ino: String(nextIno++) },
    });
    expect(aiSource.page(owner(alice), {}).items[0]?.kept).toBe(true);
    await expect(aiSource.keep(owner(alice), [id])).resolves.toBe(0);
    expect(store.driveItems.byPath(aliceRoot, 'Made with AI')).toBeUndefined();
  });

  it('refuses an image of someone else, an upload and a person without a library folder', async () => {
    const theirs = chat(bob, 'Bobs');
    const other = await image({
      profileId: bob,
      chatId: theirs,
      name: 'x.png',
      content: 'x',
      createdAt: '2026-11-05T10:00:00.000Z',
    });
    const mine = chat(bob, 'Mine');
    const own = await image({
      profileId: bob,
      chatId: mine,
      name: 'y.png',
      content: 'y',
      createdAt: '2026-11-05T11:00:00.000Z',
    });
    await expect(aiSource.keep(owner(alice), [other])).rejects.toThrow(/not one of yours/);
    await expect(aiSource.keep(owner(bob), [own])).rejects.toThrow(/no library folder/);
  });
});

describe('routes', () => {
  let opened: TestStore;

  beforeEach(async () => {
    opened = await testStore();
  });

  afterEach(async () => {
    await opened.close();
  });

  it('lists and keeps through one pair of endpoints for either source', async () => {
    const id = await recording({
      deviceId: living,
      kind: 'snapshot',
      startedAt: '2026-11-03T10:00:00.000Z',
    });
    const bound = photoSourceRoutes(opened.store, { cameras: cameraSource, ai: aiSource });
    const client = CLIENT_ROW.parse({
      id: randomUUID(),
      name: 'Desktop',
      platform: 'desktop',
      role: 'owner',
      built_in: false,
      profile_id: alice,
      created_at: NOW,
      last_seen_at: null,
    });
    const caller = { kind: 'client', client, profileId: alice } as const;
    const log = testLogger('photos-sources');
    const raw = (
      params: object,
      body: unknown,
    ): {
      params: object;
      query: object;
      body: unknown;
      remote: string;
      headers: Record<string, string>;
    } => ({
      params,
      query: {},
      body,
      remote: '127.0.0.1',
      headers: {},
    });
    expect(
      await bound.listPhotoSource.run(caller, raw({ source: 'cameras' }, undefined), log),
    ).toMatchObject({
      items: [{ itemId: id, kept: false }],
    });
    expect(
      await bound.keepSourceItems.run(caller, raw({ source: 'cameras' }, { itemIds: [id] }), log),
    ).toEqual({ kept: 1 });
    expect(
      await bound.listPhotoSource.run(caller, raw({ source: 'ai' }, undefined), log),
    ).toMatchObject({ items: [] });
  });
});
