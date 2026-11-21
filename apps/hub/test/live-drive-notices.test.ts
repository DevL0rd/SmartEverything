import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { mkdir } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { Readable } from 'node:stream';
import { createClientToken, hashClientToken, liveProtocols } from '@smarteverything/domain';
import type { HubStatus } from '@smarteverything/domain';
import WebSocket from 'ws';
import { z } from 'zod';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { commitContent, type ChangeActor, type ChangeEnv } from '../src/drive/changes';
import type { DriveWriteRoot } from '../src/drive/intents';
import { commitRestore, commitTrash } from '../src/drive/trash-purge';
import { nodeFiles, stageBytes } from '../src/drive/versions';
import { LiveHub } from '../src/server/live';
import { personalDriveRoot, sharedDriveRoot } from './store/drive-roots-fixture';
import { driveTestStore } from './drive/spaces-fixture';
import { testLogger } from './support/logs';
import { refusingUpgrades } from './support/socket-client';
import type { TestStore } from './support/store';
import { pause, until } from './support/wait';

const HEARD = z.looseObject({ type: z.string(), rootIds: z.array(z.string()).optional() });

type Heard = z.infer<typeof HEARD>;

let test: TestStore;
let hub: LiveHub;
let http: Server;
let port = 0;
let root: DriveWriteRoot;
const sockets: WebSocket[] = [];

function env(): ChangeEnv {
  return {
    files: nodeFiles,
    store: test.store,
    log: testLogger('drive'),
    now: () => new Date('2026-11-15T00:00:00.000Z'),
    purge: { rearm: (): void => undefined },
  };
}

function person(name: string, role: 'owner' | 'member'): { token: string; profileId: string } {
  const token = createClientToken();
  const profile = test.store.profiles.create({ name });
  test.store.clients.create({
    name: `${name} phone`,
    platform: 'android',
    role,
    tokenHash: hashClientToken(token),
    profileId: profile.id,
  });
  return { token, profileId: profile.id };
}

async function listen(token: string, background = false): Promise<Heard[]> {
  const heard: Heard[] = [];
  const socket = new WebSocket(`ws://127.0.0.1:${String(port)}/live`, [...liveProtocols(token)]);
  sockets.push(socket);
  let subscribed = false;
  socket.on('message', (data: Buffer) => {
    const message = HEARD.parse(JSON.parse(data.toString('utf8')));
    if (message.type === 'subscribed') subscribed = true;
    else heard.push(message);
  });
  await once(socket, 'open');
  socket.send(JSON.stringify({ type: 'subscribe', tables: [], streams: [], background }));
  await until(() => subscribed, 'the subscription to be confirmed');
  return heard;
}

function driveChanges(heard: readonly Heard[]): readonly Heard[] {
  return heard.filter((message) => message.type === 'drive_changed');
}

function typesOf(heard: readonly Heard[]): readonly string[] {
  return heard
    .map((message) => message.type)
    .filter((type) => type.startsWith('drive_') || type.startsWith('photos_'));
}

async function written(relPath: string, who: ChangeActor): Promise<string> {
  const staged = await stageBytes(env(), root, Readable.from([Buffer.from('hello')]));
  return (await commitContent(env(), { root, staged, relPath, actor: who })).item.id;
}

beforeEach(async () => {
  test = await driveTestStore();
  const dir = test.layout.home.drive;
  await mkdir(dir, { recursive: true });
  root = { id: randomUUID(), path: dir, versions: true };
  test.store.driveRoots.insert(sharedDriveRoot(root.id));
  hub = new LiveHub({
    store: test.store,
    status: (): HubStatus => ({
      version: 'test',
      startedAt: '2026-11-15T00:00:00.000Z',
      cameras: 'running',
    }),
    log: testLogger('live'),
  });
  http = createServer();
  http.on(
    'upgrade',
    refusingUpgrades((request, socket, head) => hub.upgrade(request, socket, head)),
  );
  await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve));
  const address = http.address();
  port = typeof address === 'object' && address !== null ? address.port : 0;
});

afterEach(async () => {
  sockets.splice(0).forEach((socket) => {
    socket.terminate();
  });
  hub.stop();
  http.close();
  await test.close();
});

describe('drive change notices on the live socket', () => {
  it('tells every open app that can see the drive when an item is moved to the trash and back', async () => {
    const robin = person('Robin', 'owner');
    const ann = person('Ann', 'member');
    const who: ChangeActor = { actorProfileId: robin.profileId, via: 'app', deviceId: null };
    const itemId = await written('a.txt', who);
    const robinHeard = await listen(robin.token);
    const annHeard = await listen(ann.token);
    await commitTrash(env(), root, itemId, who);
    await until(
      () => driveChanges(robinHeard).length === 1 && driveChanges(annHeard).length === 1,
      'the trash to reach both apps',
    );
    expect(driveChanges(robinHeard)[0]?.rootIds).toEqual([root.id]);
    await commitRestore(env(), root, itemId, who);
    await until(
      () => driveChanges(robinHeard).length === 2 && driveChanges(annHeard).length === 2,
      'the restore to reach both apps',
    );
  });

  it('keeps a change in a personal drive from an app that cannot see that drive', async () => {
    const robin = person('Robin', 'owner');
    const ann = person('Ann', 'member');
    const annRoot = randomUUID();
    test.store.driveRoots.insert(personalDriveRoot(annRoot, ann.profileId));
    const robinHeard = await listen(robin.token);
    const annHeard = await listen(ann.token);
    test.store.feed.notice({
      type: 'drive_changed',
      rootIds: [annRoot],
      folderIds: [],
      albumIds: [],
      months: [],
      cursor: 0,
    });
    await until(() => driveChanges(annHeard).length === 1, 'the change to reach its owner');
    await pause(50);
    expect(driveChanges(robinHeard)).toEqual([]);
  });

  it('delivers a person’s photo folder change to that person only', async () => {
    const robin = person('Robin', 'owner');
    const ann = person('Ann', 'member');
    const robinHeard = await listen(robin.token);
    const annHeard = await listen(ann.token);
    test.store.feed.notice({ type: 'photos_folders_changed', profileId: ann.profileId });
    await until(
      () => annHeard.some((message) => message.type === 'photos_folders_changed'),
      'the folder change to reach its owner',
    );
    await pause(50);
    expect(robinHeard.some((message) => message.type === 'photos_folders_changed')).toBe(false);
  });

  it('sends an app in the background no drive or photo notice at all, so nothing wakes the phone', async () => {
    const robin = person('Robin', 'owner');
    const back = await listen(robin.token, true);
    const front = await listen(robin.token);
    test.store.feed.notice({
      type: 'drive_progress',
      rootId: root.id,
      phase: 'scan',
      done: 1,
      total: 2,
    });
    test.store.feed.notice({ type: 'photos_folders_changed', profileId: robin.profileId });
    test.store.feed.notice({
      type: 'drive_changed',
      rootIds: [root.id],
      folderIds: [],
      albumIds: [],
      months: [],
      cursor: 0,
    });
    await until(() => driveChanges(front).length === 1, 'the change to reach the open app');
    await pause(50);
    expect(typesOf(front)).toEqual(['drive_progress', 'photos_folders_changed', 'drive_changed']);
    expect(typesOf(back)).toEqual([]);
  });
});
