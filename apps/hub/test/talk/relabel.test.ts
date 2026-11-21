import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import type { Store } from '../../src/store/store';
import { TALK_NEW_CHANNEL } from '@smarteverything/domain';
import { TalkService } from '../../src/talk/talk-service';
import { addClient, type TestClient } from '../support/socket-client';
import { captureLogs, testLogger } from '../support/logs';
import { testStore, type TestStore } from '../support/store';

let test: TestStore;
let service: TalkService;
let alice: TestClient;
let bob: TestClient;
let channelId: string;
let writes: MockInstance<Store['host']['write']>;

function relabels(): number {
  return writes.mock.calls.filter(([unit]) => unit === 'talkRelabel').length;
}

async function relabelled(): Promise<void> {
  await test.store.host.call('hubMarks', 'read', 'relabelled');
}

function labelOf(clientId: string): string | undefined {
  return test.store.talk.member({ channelId, kind: 'client', memberId: clientId })?.label;
}

beforeEach(async () => {
  captureLogs();
  test = await testStore();
  await test.store.live.home.load();
  alice = addClient(test, 'Alice phone', 'owner');
  bob = addClient(test, 'Bob phone', 'member');
  const { members, ...input } = TALK_NEW_CHANNEL.parse({ name: 'Garage', ai_listens: false });
  expect(members).toStrictEqual([]);
  channelId = test.store.talk.createChannel(input).id;
  for (const client of [alice, bob]) {
    test.store.talk.setMember({ channelId, kind: 'client', memberId: client.id }, true, {
      label: 'Old label',
      detail: null,
    });
  }
  service = new TalkService({
    store: test.store,
    go2rtc: {
      play: (): Promise<void> => Promise.resolve(),
      backchannel: (): Promise<boolean> => Promise.resolve(true),
    },
    streamReady: (): Promise<void> => Promise.resolve(),
    rtspPort: 8554,
    directory: test.layout.home.talk,
    presence: (): void => undefined,
    now: (): Date => new Date(),
    log: testLogger('talk'),
  });
  await service.start();
  writes = vi.spyOn(test.store.host, 'write');
});

afterEach(async () => {
  service.stop();
  await test.close();
});

describe('talk member labels', () => {
  it('leave the members alone when a client is only seen', async () => {
    test.store.clients.seen(test.store.clients.byId(alice.id));
    await relabelled();
    expect(relabels()).toBe(0);
    expect(labelOf(alice.id)).toBe('Old label');
  });

  it('follow a renamed client', async () => {
    test.store.clients.update(alice.id, { name: 'Kitchen tablet' });
    await relabelled();
    expect(relabels()).toBe(1);
    expect(test.store.talk.member({ channelId, kind: 'client', memberId: alice.id })?.detail).toBe(
      'Kitchen tablet',
    );
    expect(labelOf(bob.id)).toBe('Old label');
  });

  it('follow the profile a client switches to', async () => {
    const other = test.store.profiles.create({ name: 'Sam' });
    test.store.clients.useProfile(bob.id, other.id);
    await relabelled();
    expect(relabels()).toBe(1);
    expect(labelOf(bob.id)).toBe('Sam');
  });

  it('follow a renamed profile but not a recoloured one', async () => {
    const profile = test.store.profiles.activeOf(alice.id);
    test.store.profiles.update(profile.id, { colour: 'rose' });
    await relabelled();
    expect(relabels()).toBe(0);
    test.store.profiles.update(profile.id, { name: 'Renamed' });
    await relabelled();
    expect(relabels()).toBeGreaterThan(0);
    expect(labelOf(alice.id)).toBe('Renamed');
  });
});
