import { TALK_NEW_CHANNEL } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { recentTalkMessages } from '../src/talk/recent-messages';
import { testStore, type TestStore } from './support/store';

let test: TestStore;

beforeEach(async () => {
  test = await testStore();
});

afterEach(async () => {
  await test.close();
});

function channelWith(name: string, count: number): string {
  const { members: _members, ...input } = TALK_NEW_CHANNEL.parse({ name });
  const channel = test.store.talk.createChannel(input);
  Array.from({ length: count }, (_, index) => index).forEach((index) => {
    const id = crypto.randomUUID();
    test.store.talk.startMessage({
      id,
      channel_id: channel.id,
      speaker_kind: 'client',
      speaker_id: crypto.randomUUID(),
      speaker_label: 'Pixel',
      speaker_detail: null,
      kind: 'talk',
      started_at: `2026-10-08T10:00:0${String(index)}.000Z`,
    });
    test.store.talk.setTranscript(id, `${name} ${String(index)}`);
  });
  return channel.id;
}

describe('recentTalkMessages', () => {
  it('returns the newest transcripts of every channel up to the limit', () => {
    const garage = channelWith('Garage', 4);
    const kitchen = channelWith('Kitchen', 1);
    const messages = recentTalkMessages(test.store.talk, test.store.talk.channels(), 2);
    expect(
      messages.filter((row) => row.channel_id === garage).map((row) => row.transcript),
    ).toEqual(['Garage 3', 'Garage 2']);
    expect(
      messages.filter((row) => row.channel_id === kitchen).map((row) => row.transcript),
    ).toEqual(['Kitchen 0']);
  });

  it('returns nothing when the limit is 0', () => {
    channelWith('Garage', 2);
    expect(recentTalkMessages(test.store.talk, test.store.talk.channels(), 0)).toEqual([]);
  });
});
