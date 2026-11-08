import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AssistantMessageRow, CallTurn } from '@smarteverything/domain';
import { MemoryLearner, callExchanges } from '../../src/memory/learner';
import type { ManagerResult } from '../../src/memory/manager';
import type { MemoryPrincipal } from '../../src/memory/principal';
import { ManagerFailedError } from '../../src/memory/manager-model';
import { MemoryService } from '../../src/memory/service';
import { trivial } from '../../src/memory/trivial';
import type { StoredEvent } from '../../src/store/repositories/assistant-events';
import { TEST_ENGINE } from '../support/engine';
import { captureLogs } from '../support/logs';
import { FakeMemoryEmbedder } from '../support/memory-embedder';
import { testStore, type TestStore } from '../support/store';

interface Call {
  readonly profileId: string;
  readonly role: string;
  readonly chatId: string | null;
  readonly messageId: string | null;
  readonly person: string;
  readonly reply: string;
}

class FakeManager {
  readonly calls: Call[] = [];
  readonly failures: Error[] = [];
  active = 0;
  mostActive = 0;
  release: (() => void) | null = null;
  hold = false;

  async exchange(
    who: MemoryPrincipal,
    _chatId: string,
    person: string,
    reply: string,
  ): Promise<ManagerResult> {
    this.active += 1;
    this.mostActive = Math.max(this.mostActive, this.active);
    if (this.hold) await new Promise<void>((resolve) => (this.release = resolve));
    this.active -= 1;
    const failure = this.failures.shift();
    if (failure !== undefined) throw failure;
    this.calls.push({
      profileId: who.profileId,
      role: who.role,
      chatId: who.chatId,
      messageId: who.messageId,
      person,
      reply,
    });
    return { applied: [] };
  }
}

let opened: TestStore;
let clock: Date;
let manager: FakeManager;
let learner: MemoryLearner;
let service: MemoryService;
let profileId: string;
let chatId: string;

function tick(): void {
  clock = new Date(clock.getTime() + 60_000);
}

function chat(kind: 'chat' | 'subagent' = 'chat', parentId: string | null = null): string {
  return opened.store.aiChats.create({
    profileId,
    kind,
    title: 'Chat',
    icon: null,
    parentId,
    sourceKey: null,
    engine: TEST_ENGINE,
    titleAuto: false,
  }).id;
}

function add(
  target: string,
  role: 'person' | 'responder' | 'system',
  text: string,
  extra: Partial<Pick<AssistantMessageRow, 'reply_to' | 'kind' | 'embeds' | 'state'>> = {},
): AssistantMessageRow {
  tick();
  return opened.store.assistantChat.addMessage({
    profile_id: profileId,
    client_id: null,
    role,
    kind: extra.kind ?? 'text',
    author: role === 'person' ? 'Dan' : 'Helper',
    text,
    attachments: [],
    state: extra.state ?? (role === 'responder' ? 'answered' : null),
    reason: null,
    steps: [],
    step_states: [],
    reply_to: extra.reply_to ?? null,
    quote: null,
    chat_id: target,
    origin: null,
    embeds: extra.embeds ?? [],
    cost_micros: 0,
    model: null,
  });
}

function turn(
  text: string,
  reply: string,
  target = chatId,
): { event: StoredEvent; person: AssistantMessageRow } {
  const person = add(target, 'person', text);
  add(target, 'responder', reply, { reply_to: person.id });
  const event: StoredEvent = {
    cursor: 1,
    id: randomUUID(),
    kind: 'chat',
    chat_id: target,
    message_id: person.id,
    profile_id: profileId,
    client_id: null,
    text,
    received_at: clock.toISOString(),
    delivered_at: null,
    answered_at: null,
    report_to: null,
    hops: 0,
  };
  return { event, person };
}

async function finish(made: { event: StoredEvent }, reply: string, ok = true): Promise<void> {
  learner.afterTurn(made.event, reply, ok);
  await learner.settled();
}

beforeEach(async () => {
  captureLogs();
  clock = new Date('2026-11-05T08:00:00.000Z');
  opened = await testStore(() => clock);
  profileId = opened.store.profiles.first().id;
  chatId = chat();
  manager = new FakeManager();
  service = new MemoryService(
    opened.store.aiMemories,
    opened.store.aiChats,
    new FakeMemoryEmbedder(),
  );
  learner = new MemoryLearner({ store: opened.store, memory: service, manager });
});

afterEach(async () => {
  await opened.close();
});

describe('the learner gates', () => {
  it('learns a finished turn and moves the watermark to that message', async () => {
    const made = turn('My sister Mia is a nurse in Leeds', 'Nice, I will remember that.');
    await finish(made, 'Nice, I will remember that.');
    expect(manager.calls).toEqual([
      {
        profileId,
        role: 'owner',
        chatId,
        messageId: made.person.id,
        person: 'My sister Mia is a nurse in Leeds',
        reply: 'Nice, I will remember that.',
      },
    ]);
    expect(opened.store.aiMemories.learnedThrough(chatId)).toBe(made.person.created_at);
  });

  it('skips failed turns and events without a person message', async () => {
    const failed = turn('My sister Mia is a nurse in Leeds', 'oops');
    await finish(failed, 'oops', false);
    const note = add(chatId, 'system', 'Machine changed');
    const system = { ...turn('x', 'y').event, message_id: note.id };
    await finish({ event: system }, 'y');
    await finish({ event: { ...system, message_id: null } }, 'y');
    expect(manager.calls).toEqual([]);
    expect(opened.store.aiMemories.learnedThrough(chatId)).toBeUndefined();
  });

  it('skips subagent chats', async () => {
    const child = chat('subagent', chatId);
    await finish(turn('My sister Mia is a nurse in Leeds', 'ok', child), 'ok');
    expect(manager.calls).toEqual([]);
  });

  it('skips when the person switch is off and marks it seen so nothing is back-filled', async () => {
    opened.store.aiMemories.changeSettings(profileId, { enabled: false });
    const first = turn('My sister Mia is a nurse in Leeds', 'Noted');
    await finish(first, 'Noted');
    expect(manager.calls).toEqual([]);
    opened.store.aiMemories.changeSettings(profileId, { enabled: true });
    const second = turn('Dan plays Zelda every weekend', 'Fun');
    await finish(second, 'Fun');
    expect(manager.calls.map((call) => call.person)).toEqual(['Dan plays Zelda every weekend']);
  });

  it('skips when the chat memory flag is off', async () => {
    opened.store.aiChats.update(chatId, { memory: false });
    await finish(turn('My sister Mia is a nurse in Leeds', 'Noted'), 'Noted');
    expect(manager.calls).toEqual([]);
  });

  it('skips trivial messages without a model call', async () => {
    for (const text of [
      'ok',
      'Thanks!',
      'hi',
      '/compact',
      'turn off the lights',
      'no',
      'good night',
    ]) {
      await finish(turn(text, 'Done'), 'Done');
    }
    expect(manager.calls).toEqual([]);
  });

  it('keeps short messages that hold a name or a quote', async () => {
    await finish(turn('Call Mia', 'Calling'), 'Calling');
    await finish(turn('I said "bonkers"', 'Got it'), 'Got it');
    expect(manager.calls.map((call) => call.person)).toEqual(['Call Mia', 'I said "bonkers"']);
  });
});

describe('the trivial filter', () => {
  it('separates talk worth learning from filler', () => {
    expect(trivial('How are you doing today')).toBe(false);
    expect(trivial('I like jazz')).toBe(true);
    expect(trivial('I really like jazz music')).toBe(false);
    expect(trivial('Set a timer for ten minutes')).toBe(true);
    expect(trivial('Play Zelda with me tonight')).toBe(false);
    expect(trivial('yes')).toBe(true);
    expect(trivial('Thank you')).toBe(true);
  });
});

describe('the watermark', () => {
  it('starts from the first turn it sees and does not back-fill old chats', async () => {
    turn('Old news about my cousin Sam in Perth', 'Okay');
    const fresh = turn('My dog Rex turned five this week', 'Happy birthday Rex');
    await finish(fresh, 'Happy birthday Rex');
    expect(manager.calls.map((call) => call.person)).toEqual(['My dog Rex turned five this week']);
  });

  it('does not move on a model failure and takes both pairs on the next run', async () => {
    manager.failures.push(new ManagerFailedError('down'));
    const first = turn('My sister Mia is a nurse in Leeds', 'Noted');
    await finish(first, 'Noted');
    expect(manager.calls).toEqual([]);
    expect(opened.store.aiMemories.learnedThrough(chatId)).toBeUndefined();

    const second = turn('Dan plays Zelda every weekend', 'Fun');
    await finish(second, 'Fun');
    expect(manager.calls.map((call) => [call.person, call.reply])).toEqual([
      ['Dan plays Zelda every weekend', 'Fun'],
    ]);
  });

  it('retries the failed pair together with the next one once it has a row', async () => {
    const seed = turn('My dog Rex turned five this week', 'Happy birthday');
    await finish(seed, 'Happy birthday');
    manager.failures.push(new ManagerFailedError('down'));
    const failing = turn('My sister Mia is a nurse in Leeds', 'Noted');
    await finish(failing, 'Noted');
    expect(opened.store.aiMemories.learnedThrough(chatId)).toBe(seed.person.created_at);

    const next = turn('Dan plays Zelda every weekend', 'Fun');
    await finish(next, 'Fun');
    expect(manager.calls.map((call) => call.person).slice(1)).toEqual([
      'My sister Mia is a nurse in Leeds',
      'Dan plays Zelda every weekend',
    ]);
    expect(opened.store.aiMemories.learnedThrough(chatId)).toBe(next.person.created_at);
  });

  it('never learns the same turn twice', async () => {
    const made = turn('My sister Mia is a nurse in Leeds', 'Noted');
    await finish(made, 'Noted');
    await finish(made, 'Noted');
    expect(manager.calls).toHaveLength(1);
  });

  it('runs one turn at a time per chat', async () => {
    manager.hold = true;
    const first = turn('My sister Mia is a nurse in Leeds', 'Noted');
    const second = turn('Dan plays Zelda every weekend', 'Fun');
    learner.afterTurn(first.event, 'Noted', true);
    learner.afterTurn(second.event, 'Fun', true);
    await new Promise((resolve) => setTimeout(resolve, 5));
    manager.hold = false;
    manager.release?.();
    await learner.settled();
    expect(manager.mostActive).toBe(1);
    expect(manager.calls.map((call) => call.person)).toEqual([
      'My sister Mia is a nurse in Leeds',
      'Dan plays Zelda every weekend',
    ]);
  });
});

describe('voice calls', () => {
  const TURNS: CallTurn[] = [
    { who: 'person', text: 'I finished the Water Temple today', ok: true, detail: null },
    { who: 'person', text: 'Finally after weeks', ok: true, detail: null },
    { who: 'assistant', text: 'Congratulations!', ok: true, detail: null },
    { who: 'tool', text: 'lights', ok: true, detail: null },
    { who: 'assistant', text: 'That was a long fight.', ok: true, detail: null },
    { who: 'person', text: 'Mia is coming over on Friday', ok: true, detail: null },
    { who: 'assistant', text: 'Lovely.', ok: true, detail: null },
  ];

  function call(turns: readonly CallTurn[] = TURNS): AssistantMessageRow {
    return add(chatId, 'system', 'transcript', {
      kind: 'call',
      embeds: [{ kind: 'call_transcript', turns: [...turns] }],
    });
  }

  it('pairs person and assistant turns in order and ignores tool lines', () => {
    expect(callExchanges(TURNS)).toEqual([
      {
        person: 'I finished the Water Temple today\nFinally after weeks',
        reply: 'Congratulations!\nThat was a long fight.',
      },
      { person: 'Mia is coming over on Friday', reply: 'Lovely.' },
    ]);
  });

  it('runs one pass per pair and moves the watermark to the call', async () => {
    const record = call();
    learner.afterCall(chatId, record.id);
    await learner.settled();
    expect(manager.calls.map((entry) => entry.person)).toEqual([
      'I finished the Water Temple today\nFinally after weeks',
      'Mia is coming over on Friday',
    ]);
    expect(manager.calls.every((entry) => entry.messageId === record.id)).toBe(true);
    expect(opened.store.aiMemories.learnedThrough(chatId)).toBe(record.created_at);
  });

  it('stops without moving the watermark when a pair fails', async () => {
    const record = call();
    manager.failures.push(new ManagerFailedError('down'));
    learner.afterCall(chatId, record.id);
    await learner.settled();
    expect(manager.calls).toEqual([]);
    expect(opened.store.aiMemories.learnedThrough(chatId)).toBeUndefined();
  });

  it('respects the memory switch', async () => {
    opened.store.aiMemories.changeSettings(profileId, { enabled: false });
    const record = call();
    learner.afterCall(chatId, record.id);
    await learner.settled();
    expect(manager.calls).toEqual([]);
  });

  it('learns each queued transcript by its own message id', async () => {
    const first = call(TURNS.slice(0, 4));
    learner.afterCall(chatId, first.id);
    const second = call(TURNS.slice(-2));
    learner.afterCall(chatId, second.id);
    await learner.settled();
    expect(manager.calls.map((entry) => entry.messageId)).toEqual([first.id, second.id]);
  });
});
