import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
let relabel: ReturnType<typeof vi.spyOn>;

function labelOf(clientId: string): string | undefined {
  return test.store.talk.member({ channelId, kind: 'client', memberId: clientId })?.label;
}

beforeEach(async () => {
  captureLogs();
  test = await testStore();
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
    dataDirectory: test.directory,
    presence: (): void => undefined,
    now: (): Date => new Date(),
    log: testLogger('talk'),
  });
  await service.start();
  relabel = vi.spyOn(test.store.talk, 'relabel');
});

afterEach(async () => {
  service.stop();
  await test.close();
});

describe('talk member labels', () => {
  it('leave the members alone when a client is only seen', () => {
    test.store.clients.seen(test.store.clients.byId(alice.id));
    expect(relabel).not.toHaveBeenCalled();
    expect(labelOf(alice.id)).toBe('Old label');
  });

  it('follow a renamed client', () => {
    test.store.clients.update(alice.id, { name: 'Kitchen tablet' });
    expect(relabel).toHaveBeenCalledTimes(1);
    expect(test.store.talk.member({ channelId, kind: 'client', memberId: alice.id })?.detail).toBe(
      'Kitchen tablet',
    );
    expect(labelOf(bob.id)).toBe('Old label');
  });

  it('follow the profile a client switches to', () => {
    const other = test.store.profiles.create({ name: 'Sam' });
    test.store.clients.useProfile(bob.id, other.id);
    expect(relabel).toHaveBeenCalledTimes(1);
    expect(labelOf(bob.id)).toBe('Sam');
  });

  it('follow a renamed profile but not a recoloured one', () => {
    const profile = test.store.profiles.activeOf(alice.id);
    test.store.profiles.update(profile.id, { colour: 'rose' });
    expect(relabel).not.toHaveBeenCalled();
    test.store.profiles.update(profile.id, { name: 'Renamed' });
    expect(relabel).toHaveBeenCalled();
    expect(labelOf(alice.id)).toBe('Renamed');
  });
});
