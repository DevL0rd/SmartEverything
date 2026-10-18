import {
  LIVE_SERVER_MESSAGE,
  TRANSCRIPT_PAGE,
  createClientToken,
  hashClientToken,
  liveProtocols,
  type HubStatus,
  type TranscriptChangedNotice,
  type TranscriptLineInput,
  type TranscriptSource,
} from '@smarteverything/domain';
import { once } from 'node:events';
import { createServer } from 'node:http';
import WebSocket from 'ws';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Caller } from '../src/server/auth';
import { transcriptRoutes } from '../src/server/handlers/transcripts';
import { LiveHub } from '../src/server/live';
import { Transcripts } from '../src/transcripts/transcript-service';
import { FakeClock } from './support/fake-clock';
import { testLogger } from './support/logs';
import { testStore, type TestStore } from './support/store';
import { until } from './support/wait';

const START = '2026-10-08T10:00:00.000Z';

let test: TestStore;
let transcripts: Transcripts;
let owner: Caller;
let member: Caller;
let routes: ReturnType<typeof transcriptRoutes>;

function line(minute: number, text: string): TranscriptLineInput {
  return {
    at: new Date(Date.parse(START) + minute * 60_000).toISOString(),
    speaker_id: null,
    speaker: 'Someone',
    text,
    bot: false,
  };
}

function open(source: TranscriptSource, sourceId: string, title: string): string {
  return transcripts.open({
    source,
    sourceId,
    pluginId: null,
    title,
    retentionDays: null,
    startedAt: START,
  }).id;
}

async function call(
  name: keyof typeof routes,
  caller: Caller,
  raw: { readonly query?: unknown; readonly params?: unknown },
): Promise<unknown> {
  return routes[name].run(
    caller,
    { params: raw.params ?? {}, query: raw.query ?? {}, body: undefined, remote: '127.0.0.1' },
    testLogger('transcripts'),
  );
}

function assistantOf(caller: Caller): Caller {
  return caller.kind === 'client' ? { ...caller, via: 'assistant' } : caller;
}

function memberId(): string {
  return member.kind === 'client' ? member.client.id : '';
}

function phone(name: string, profileId: string): string {
  const [row] = test.store.devices.upsert([
    {
      provider: 'local',
      externalId: `phone-${name}`,
      parentId: null,
      kind: 'phone',
      name,
      model: 'm',
      manufacturer: 'm',
      providerRoom: null,
      roomId: null,
      online: true,
      capabilities: [],
      details: { profileId },
    },
  ]);
  return row?.id ?? '';
}

async function texts(caller: Caller, query: unknown): Promise<string[]> {
  const page = TRANSCRIPT_PAGE.parse(await call('readCameraTranscriptFeed', caller, { query }));
  return page.items.map((hit) => hit.line.text);
}

beforeEach(async () => {
  test = await testStore();
  transcripts = new Transcripts({
    store: test.store,
    clock: new FakeClock(START),
    log: testLogger('transcripts'),
  });
  const ownerRow = test.store.clients.create({
    name: 'Owner',
    platform: 'android',
    role: 'owner',
    tokenHash: 'a'.repeat(64),
  });
  const memberRow = test.store.clients.create({
    name: 'Member',
    platform: 'android',
    role: 'member',
    tokenHash: 'b'.repeat(64),
  });
  owner = { kind: 'client', client: ownerRow };
  member = { kind: 'client', client: memberRow };
  routes = transcriptRoutes(test.store, transcripts, {
    status: () => Promise.reject(new Error('unused')),
  });
});

afterEach(async () => {
  await test.close();
});

describe('transcript feed', () => {
  it('serves camera speech by default to members and plugin speech to the owner only', async () => {
    const camera = open('camera', 'cam-1', 'Porch');
    const call1 = open('plugin', 'call-1', 'Discord call');
    transcripts.add(camera, line(0, 'knock knock'));
    transcripts.add(call1, line(1, 'hello team'));
    expect(await texts(member, {})).toStrictEqual(['knock knock']);
    expect(await texts(owner, { source: 'plugin' })).toStrictEqual(['hello team']);
    await expect(texts(member, { source: 'plugin' })).rejects.toMatchObject({
      code: 'forbidden',
    });
    await expect(texts(member, { sessionId: call1 })).rejects.toMatchObject({
      code: 'forbidden',
    });
  });

  it('keeps a member’s phone and computer speech to their own devices', async () => {
    const memberPhone = phone('Mine', test.store.profiles.activeOf(memberId()).id);
    const otherPhone = phone('Theirs', crypto.randomUUID());
    const mine = open('phone', memberPhone, 'Mine');
    const theirs = open('phone', otherPhone, 'Theirs');
    transcripts.add(mine, line(0, 'my words'));
    transcripts.add(theirs, line(1, 'their words'));
    expect(await texts(member, { source: 'phone', sourceId: memberPhone })).toStrictEqual([
      'my words',
    ]);
    expect(await texts(owner, { source: 'phone' })).toStrictEqual(['my words', 'their words']);
    await expect(texts(member, { source: 'phone', sourceId: otherPhone })).rejects.toMatchObject({
      code: 'forbidden',
    });
    await expect(texts(member, { source: 'phone' })).rejects.toMatchObject({ code: 'forbidden' });
    await expect(texts(member, { sessionId: theirs })).rejects.toMatchObject({
      code: 'forbidden',
    });
    expect(await texts(member, { sessionId: mine })).toStrictEqual(['my words']);
  });

  it('lets a member’s AI read their own phone speech but no camera or other device speech', async () => {
    const assistant = assistantOf(member);
    const memberPhone = phone('Mine', test.store.profiles.activeOf(memberId()).id);
    const otherPhone = phone('Theirs', crypto.randomUUID());
    transcripts.add(open('phone', memberPhone, 'Mine'), line(0, 'my words'));
    transcripts.add(open('phone', otherPhone, 'Theirs'), line(1, 'their words'));
    transcripts.add(open('camera', 'cam-1', 'Porch'), line(2, 'knock knock'));
    expect(await texts(assistant, { source: 'phone', sourceId: memberPhone })).toStrictEqual([
      'my words',
    ]);
    await expect(texts(assistant, { source: 'phone', sourceId: otherPhone })).rejects.toMatchObject(
      { code: 'forbidden' },
    );
    await expect(texts(assistant, {})).rejects.toMatchObject({ code: 'forbidden' });
    await expect(texts(assistant, { source: 'camera' })).rejects.toMatchObject({
      code: 'forbidden',
    });
    const ownerAssistant = assistantOf(owner);
    expect(await texts(ownerAssistant, { source: 'camera' })).toStrictEqual(['knock knock']);
  });

  it('narrows the feed to one source or to one transcript', async () => {
    const porch = open('camera', 'cam-1', 'Porch');
    const garage = open('camera', 'cam-2', 'Garage');
    transcripts.add(porch, line(0, 'porch line'));
    transcripts.add(garage, line(1, 'garage line'));
    expect(await texts(owner, {})).toStrictEqual(['porch line', 'garage line']);
    expect(await texts(owner, { sourceId: 'cam-2' })).toStrictEqual(['garage line']);
    expect(await texts(owner, { sessionId: porch })).toStrictEqual(['porch line']);
    await expect(
      call('readCameraTranscriptFeed', owner, { query: { sessionId: porch, sourceId: 'cam-2' } }),
    ).rejects.toMatchObject({ code: 'invalid_request' });
  });

  it('pages older and newer lines by cursor without overlap', async () => {
    const session = open('camera', 'cam-1', 'Porch');
    for (let minute = 0; minute < 5; minute += 1)
      transcripts.add(session, line(minute, `line ${String(minute)}`));
    const latest = TRANSCRIPT_PAGE.parse(
      await call('readCameraTranscriptFeed', owner, { query: { limit: 2 } }),
    );
    expect(latest.items.map((hit) => hit.line.text)).toStrictEqual(['line 3', 'line 4']);
    expect(latest.after).toBeNull();
    const older = TRANSCRIPT_PAGE.parse(
      await call('readCameraTranscriptFeed', owner, { query: { limit: 2, cursor: latest.before } }),
    );
    expect(older.items.map((hit) => hit.line.text)).toStrictEqual(['line 1', 'line 2']);
    const newer = TRANSCRIPT_PAGE.parse(
      await call('readCameraTranscriptFeed', owner, {
        query: { limit: 2, direction: 'after', cursor: older.after },
      }),
    );
    expect(newer.items.map((hit) => hit.line.text)).toStrictEqual(['line 3', 'line 4']);
  });

  it('deletes one line without touching its transcript, counts or the other lines', async () => {
    const session = open('camera', 'cam-1', 'Porch');
    const keep = transcripts.add(session, line(0, 'keep this'));
    const drop = transcripts.add(session, line(1, 'drop this'));
    await call('removeTranscript', owner, {
      params: { sessionId: session },
      query: { lineId: String(drop.id) },
    });
    expect(await texts(owner, {})).toStrictEqual(['keep this']);
    expect(transcripts.find(session)?.line_count).toBe(1);
    expect(transcripts.search({ words: 'drop', limit: 5 })).toStrictEqual([]);
    expect(transcripts.search({ words: 'keep', limit: 5 }).map((hit) => hit.line.id)).toStrictEqual(
      [keep.id],
    );
    await expect(
      call('removeTranscript', owner, {
        params: { sessionId: session },
        query: { lineId: String(drop.id) },
      }),
    ).rejects.toMatchObject({ name: 'StoreNotFoundError' });
  });

  it('deletes a whole transcript only for the owner and not while a conversation runs', async () => {
    const finished = open('camera', 'cam-1', 'Porch');
    const running = open('plugin', 'call-1', 'Discord call');
    transcripts.add(finished, line(0, 'old talk'));
    await expect(
      call('removeTranscript', member, { params: { sessionId: finished } }),
    ).rejects.toMatchObject({ code: 'forbidden' });
    await expect(
      call('removeTranscript', member, { params: { sessionId: finished }, query: { lineId: '1' } }),
    ).rejects.toMatchObject({ code: 'forbidden' });
    await expect(
      call('removeTranscript', owner, { params: { sessionId: running } }),
    ).rejects.toMatchObject({ code: 'conflict' });
    await call('removeTranscript', owner, { params: { sessionId: finished } });
    expect(transcripts.find(finished)).toBeUndefined();
  });
});

async function liveViewer(
  port: number,
  role: 'owner' | 'member',
): Promise<{ readonly seen: TranscriptChangedNotice[]; readonly close: () => void }> {
  const token = createClientToken();
  test.store.clients.create({
    name: `Viewer ${role}`,
    platform: 'android',
    role,
    tokenHash: hashClientToken(token),
  });
  const seen: TranscriptChangedNotice[] = [];
  const socket = new WebSocket(`ws://127.0.0.1:${String(port)}/live`, [...liveProtocols(token)]);
  let subscribed = false;
  socket.on('message', (data: Buffer) => {
    const message = LIVE_SERVER_MESSAGE.parse(JSON.parse(data.toString('utf8')));
    if (message.type === 'subscribed') subscribed = true;
    if (message.type === 'transcript_changed') seen.push(message);
  });
  await once(socket, 'open');
  socket.send(JSON.stringify({ type: 'subscribe', tables: [], streams: [] }));
  await until(() => subscribed);
  return {
    seen,
    close: (): void => {
      socket.close();
    },
  };
}

describe('transcript notices', () => {
  it('reach every viewer for camera speech and only owners for plugin speech, without any capability being declared', async () => {
    const hub = new LiveHub({
      store: test.store,
      status: (): HubStatus => ({ version: 'test', startedAt: START, cameras: 'running' }),
      log: testLogger('live'),
    });
    const http = createServer();
    http.on('upgrade', (request, socket, head) => {
      hub.upgrade(request, socket, head);
    });
    await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve));
    const address = http.address();
    const port = typeof address === 'object' && address !== null ? address.port : 0;
    const asMember = await liveViewer(port, 'member');
    const asOwner = await liveViewer(port, 'owner');
    open('plugin', 'call-1', 'Discord call');
    await until(() => asOwner.seen.length > 0);
    open('camera', 'cam-1', 'Porch');
    await until(() => asMember.seen.length > 0 && asOwner.seen.length > 1);
    expect(asOwner.seen.map((notice) => notice.source)).toStrictEqual(['plugin', 'camera']);
    expect(asMember.seen.map((notice) => notice.source)).toStrictEqual(['camera']);
    asMember.close();
    asOwner.close();
    hub.stop();
    http.close();
  });
});
