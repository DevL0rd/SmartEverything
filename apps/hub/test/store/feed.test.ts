import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { CommittedSpeech } from '../../src/transcripts/speech';
import { ChangeFeed } from '../../src/store/feed';
import { captureLogs, testLogger, type CapturedLogs } from '../support/logs';
import { testStore, type TestStore } from '../support/store';

let logs: CapturedLogs;
let opened: TestStore;

beforeEach(async () => {
  logs = captureLogs();
  opened = await testStore();
});

afterEach(async () => {
  await opened.close();
});

function speech(commitId: number): CommittedSpeech {
  return {
    kind: 'attachment',
    commitId,
    attachmentId: 'a',
    chatId: null,
    profileId: 'p',
    text: 'hello',
    bot: false,
  };
}

describe('the change feed', () => {
  it('holds speech until release in order, drops it on discard and survives a throwing listener', () => {
    const feed = new ChangeFeed(testLogger());
    const seen: number[] = [];
    feed.subscribeSpeech(() => {
      throw new Error('listener broke');
    });
    const stop = feed.subscribeSpeech((delivered) => seen.push(delivered.commitId));
    feed.hold();
    feed.speech(speech(1));
    feed.speech(speech(2));
    expect(seen).toStrictEqual([]);
    feed.release();
    expect(seen).toStrictEqual([1, 2]);
    feed.hold();
    feed.speech(speech(3));
    feed.discard();
    feed.speech(speech(4));
    stop();
    feed.speech(speech(5));
    expect(seen).toStrictEqual([1, 2, 4]);
    expect(logs.events().filter((event) => event === 'change.listener_failed')).toHaveLength(4);
  });

  it('reports each committed row with its own sequence number', () => {
    const { store } = opened;
    const seen: number[] = [];
    store.feed.subscribe((change) => seen.push(change.seq));
    const reported: number[] = [];
    store.write(() => {
      store.rooms.create('Hall', 0);
      store.rooms.create('Study', 1);
    });
    store.feed.emit(
      {
        type: 'change',
        table: 'rooms',
        operation: 'DELETE',
        record: null,
        oldRecord: store.rooms.list()[0],
      },
      (seq) => reported.push(seq),
    );
    expect(seen).toStrictEqual([1, 2, 3]);
    expect(reported).toStrictEqual([3]);
    expect(store.feed.seq).toBe(3);
  });

  it('announces a commit only for writes that changed rows', () => {
    const { store } = opened;
    let commits = 0;
    store.feed.subscribeCommitted(() => {
      commits += 1;
    });
    store.write(() => store.rooms.list());
    expect(commits).toBe(0);
    store.write(() => {
      store.rooms.create('Hall', 0);
      store.write(() => store.rooms.create('Study', 1));
    });
    expect(commits).toBe(1);
    expect(() =>
      store.write(() => {
        store.rooms.create('Attic', 2);
        throw new Error('changed my mind');
      }),
    ).toThrow('changed my mind');
    expect(commits).toBe(1);
    store.rooms.create('Cellar', 3);
    expect(commits).toBe(2);
  });
});
