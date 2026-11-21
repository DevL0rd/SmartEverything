import { testStore, type TestStore, type SeededStore } from '../support/store';
import { type CallTurn } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { CallRecord } from '../../src/assistant-voice/call-record';
import { FakeClock } from '../support/fake-clock';
import { TEST_ENGINE } from '../support/engine';

const START = '2026-10-08T10:00:00.000Z';

let opened: TestStore;
let clock: FakeClock;
let saves: MockInstance<SeededStore['host']['write']>;
let chatId: string;
let profileId: string;

function recordFor(): CallRecord {
  return new CallRecord(
    opened.store,
    { chatId, profileId, clientId: null, author: 'Jarvis', person: 'Sam' },
    clock,
  );
}

function turn(index: number, who: CallTurn['who'], text: string): CallTurn {
  return { who, text: `${text} ${String(index)}`, ok: true, detail: null };
}

function legacyText(turns: readonly CallTurn[]): string {
  const lines = turns.map((entry) => {
    const label = entry.who === 'person' ? 'Sam: ' : entry.who === 'assistant' ? 'Jarvis: ' : '· ';
    return `${label}${entry.text}`;
  });
  return lines.join('\n');
}

beforeEach(async () => {
  opened = await testStore();
  await opened.store.live.home.load();
  clock = new FakeClock(START);
  profileId = opened.store.profiles.first().id;
  chatId = opened.store.aiChats.create({
    profileId,
    kind: 'chat',
    title: 'Home',
    icon: null,
    parentId: null,
    sourceKey: null,
    engine: TEST_ENGINE,
  }).id;
  saves = vi.spyOn(opened.store.host, 'write');
});

afterEach(async () => {
  await opened.close();
});

describe('call record', () => {
  it('writes the same final message as rebuilding it on every turn', async () => {
    const record = recordFor();
    const who = ['person', 'assistant', 'tool'] as const;
    const turns = Array.from({ length: 12 }, (_, index) =>
      turn(index, who[index % 3] ?? 'tool', 'said'),
    );
    turns.forEach((entry) => {
      record.add(entry);
    });
    record.close();
    await record.settled();
    const message = opened.store.assistantChat.message(record.messageId);
    expect(message.text).toBe(legacyText(turns));
    expect(record.transcript()).toBe(legacyText(turns));
    expect(message.embeds).toEqual([{ kind: 'call_transcript', turns }]);
  });

  it('keeps every turn and the whole text however long the call', async () => {
    const record = recordFor();
    const long = 'x'.repeat(5000);
    const turns = Array.from({ length: 450 }, (_, index) => turn(index, 'person', long));
    turns.forEach((entry) => {
      record.add(entry);
    });
    record.close();
    await record.settled();
    const message = opened.store.assistantChat.message(record.messageId);
    expect(message.text).toBe(legacyText(turns));
    expect(message.text.length).toBeGreaterThan(450 * 5000);
    expect(message.embeds).toEqual([{ kind: 'call_transcript', turns }]);
  });

  it('saves at most once per few seconds during the call', async () => {
    const record = recordFor();
    saves.mockClear();
    for (let index = 0; index < 100; index += 1) {
      record.add(turn(index, 'person', 'line'));
      clock.advanceTo(new Date(clock.now().getTime() + 50).toISOString());
    }
    const saved = saves.mock.calls.filter(([unit]) => unit === 'callRecordSave').length;
    expect(saved).toBeLessThanOrEqual(3);
    expect(saved).toBeGreaterThan(0);
    record.close();
    await record.settled();
    expect(opened.store.assistantChat.message(record.messageId).embeds).toHaveLength(1);
  });

  it('writes nothing after close', () => {
    const record = recordFor();
    record.add(turn(0, 'person', 'last'));
    record.close();
    saves.mockClear();
    clock.advanceTo(new Date(clock.now().getTime() + 60_000).toISOString());
    expect(saves.mock.calls.length).toBe(0);
  });
});
