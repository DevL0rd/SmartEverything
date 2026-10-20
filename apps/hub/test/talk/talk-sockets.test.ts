import { TALK_NEW_CHANNEL, TALK_PROTOCOL, type TalkPresence } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TalkService } from '../../src/talk/talk-service';
import {
  addClient,
  serveSockets,
  type SocketBench,
  type SocketLink,
  type TestClient,
} from '../support/socket-client';
import { captureLogs, testLogger } from '../support/logs';
import { testStore, type TestStore } from '../support/store';
import { until } from '../support/wait';

const OPUS_20_MS = Uint8Array.from([0xf8, 0xff, 0xfe]);
const AUDIO_FRAME = Buffer.concat([Buffer.from([1]), OPUS_20_MS]);

let test: TestStore;
let service: TalkService;
let bench: SocketBench;
let presence: TalkPresence;
let garage: string;
let kitchen: string;
let alice: TestClient;
let bob: TestClient;
let stranger: TestClient;

function channel(name: string): string {
  const { members, ...input } = TALK_NEW_CHANNEL.parse({ name, ai_listens: false });
  expect(members).toEqual([]);
  return test.store.talk.createChannel(input).id;
}

function join(channelId: string, client: TestClient, listening: boolean): void {
  test.store.talk.setMember({ channelId, kind: 'client', memberId: client.id }, listening, {
    label: 'Phone',
    detail: null,
  });
}

beforeEach(async () => {
  captureLogs();
  test = await testStore();
  presence = { floors: [], online: [] };
  alice = addClient(test, 'Alice', 'owner');
  bob = addClient(test, 'Bob', 'member');
  stranger = addClient(test, 'Stranger', 'member');
  garage = channel('Garage');
  kitchen = channel('Kitchen');
  join(garage, alice, true);
  join(garage, bob, true);
  join(kitchen, alice, true);
  service = new TalkService({
    store: test.store,
    go2rtc: {
      play: (): Promise<void> => Promise.resolve(),
      backchannel: (): Promise<boolean> => Promise.resolve(true),
    },
    streamReady: (): Promise<void> => Promise.resolve(),
    rtspPort: 8554,
    dataDirectory: test.directory,
    presence: (next): void => {
      presence = next;
    },
    now: (): Date => new Date(),
    log: testLogger('talk'),
  });
  await service.start();
  bench = await serveSockets(TALK_PROTOCOL, (request, socket, head) => {
    service.upgrade(request, socket, head);
  });
});

afterEach(async () => {
  bench.stop();
  service.stop();
  await test.close();
});

function say(link: SocketLink, message: object): void {
  link.socket.send(JSON.stringify(message));
}

function heard(link: SocketLink, key: string, value: unknown): boolean {
  return link.messages.some((message) => message[key] === value);
}

describe('talk sockets', () => {
  it('refuses a connection without a device token', async () => {
    expect(await bench.refused()).toBeInstanceOf(Error);
    expect(presence.online).toEqual([]);
  });

  it('greets a client with the channels it belongs to and lists it online', async () => {
    const link = await bench.connect(alice.token);
    await until(() => link.messages.length === 1, 'the greeting');
    expect(link.messages[0]).toMatchObject({ type: 'ready', clientId: alice.id });
    expect(link.messages[0]?.['channels']).toEqual(expect.arrayContaining([garage, kitchen]));
    await until(() => presence.online.includes(alice.id), 'the presence');
  });

  it('grants the floor to a member, relays audio to the other listener and ends on release', async () => {
    const talker = await bench.connect(alice.token);
    const listener = await bench.connect(bob.token);
    await until(() => presence.online.length === 2, 'both online');
    say(talker, { type: 'press', channelId: garage });
    await until(() => heard(talker, 'type', 'granted'), 'the grant');
    await until(() => heard(listener, 'type', 'rx_start'), 'rx_start');
    expect(presence.floors.map((floor) => floor.channelId)).toEqual([garage]);
    talker.socket.send(AUDIO_FRAME);
    await until(() => listener.frames.length === 1, 'the relayed audio');
    expect([...(listener.frames[0] ?? [])]).toEqual([...AUDIO_FRAME]);
    say(talker, { type: 'release' });
    await until(() => heard(talker, 'reason', 'released'), 'the end');
    await until(() => presence.floors.length === 0, 'the floor to clear');
    await until(
      () => test.store.talk.messages({ channelId: garage, limit: 10 }).some((m) => m.bytes > 0),
      'the recording to be saved',
    );
  });

  it('denies a press from a client that is not in the channel', async () => {
    const link = await bench.connect(stranger.token);
    await until(() => link.messages.length === 1, 'the greeting');
    say(link, { type: 'press', channelId: garage });
    await until(() => link.messages.length === 2, 'the denial');
    expect(link.messages[1]).toEqual({ type: 'denied', channelId: garage, reason: 'not_member' });
  });

  it('denies a second speaker on a busy channel and a speaker already talking elsewhere', async () => {
    const first = await bench.connect(alice.token);
    const second = await bench.connect(bob.token);
    await until(() => presence.online.length === 2, 'both online');
    say(first, { type: 'press', channelId: garage });
    await until(() => heard(first, 'type', 'granted'), 'the grant');
    say(second, { type: 'press', channelId: garage });
    await until(() => heard(second, 'type', 'denied'), 'the busy denial');
    expect(second.messages.find((message) => message['type'] === 'denied')).toMatchObject({
      reason: 'busy',
    });
    say(first, { type: 'press', channelId: kitchen });
    await until(() => heard(first, 'reason', 'talking_elsewhere'), 'the second denial');
  });

  it('ends the floor and lists the client offline when its socket closes mid-message', async () => {
    const link = await bench.connect(alice.token);
    await until(() => presence.online.length === 1, 'online');
    say(link, { type: 'press', channelId: garage });
    await until(() => heard(link, 'type', 'granted'), 'the grant');
    link.socket.terminate();
    await until(() => presence.floors.length === 0 && presence.online.length === 0, 'cleanup');
  });

  it('closes a client socket with code 4001 when the client is removed', async () => {
    const link = await bench.connect(bob.token);
    await until(() => presence.online.includes(bob.id), 'online');
    const closed = new Promise<number>((resolve) => {
      link.socket.once('close', (code) => {
        resolve(code);
      });
    });
    test.store.clients.remove(bob.id);
    expect(await closed).toBe(4001);
    expect(test.store.talk.members().some((member) => member.member_id === bob.id)).toBe(false);
  });
});
