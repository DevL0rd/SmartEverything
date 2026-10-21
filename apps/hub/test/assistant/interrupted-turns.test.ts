import { DEFAULT_ENGINE } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ChatDirectory } from '../../src/assistant/chat-directory';
import { ConversationLog } from '../../src/assistant/conversation-log';
import { AssistantDelivery, type Routing } from '../../src/assistant/delivery';
import { AssistantFiles } from '../../src/assistant/files';
import { completionFailure } from '../../src/assistant/engines/dsh/completion';
import {
  CONNECTION_LOST,
  CONTINUE_NOTE,
  HUB_RESTARTED,
  STOPPED_BY_USER,
  interruptionNote,
} from '../../src/assistant/interruption';
import { AssistantRequests } from '../../src/assistant/requests';
import { captureLogs, testLogger } from '../support/logs';
import { testStore, type TestStore } from '../support/store';

const MODEL = 'google/gemini-3.8-flash';

class CountingDelivery extends AssistantDelivery {
  added_count = 0;
  override added(): void {
    this.added_count += 1;
  }
}

let opened: TestStore;
let delivery: CountingDelivery;
let log: ConversationLog;
let requests: AssistantRequests;
let chatId: string;
let sender: { readonly profileId: string; readonly clientId: string };

beforeEach(async () => {
  captureLogs();
  opened = await testStore(() => new Date());
  const { store } = opened;
  const client = store.clients.create(
    { name: 'This computer', platform: 'desktop', role: 'owner', tokenHash: 'a' },
    true,
  );
  const profileId = store.profiles.activeOf(client.id).id;
  sender = { profileId, clientId: client.id };
  const now = (): Date => new Date();
  const files = new AssistantFiles({
    dataDirectory: opened.directory,
    chat: store.assistantChat,
    now,
  });
  const chats = new ChatDirectory(store, files, now);
  chatId = chats.create({ profileId, role: 'owner' }, { engine: DEFAULT_ENGINE }).id;
  log = new ConversationLog(store);
  delivery = new CountingDelivery({
    events: store.assistantEvents,
    route: (): Routing => ({ kind: 'blocked', reason: 'not routed in this test' }),
    delivered: (): void => undefined,
    failed: (): void => undefined,
    retrying: (): void => undefined,
    stopped: (): void => undefined,
    log: testLogger(),
  });
  requests = new AssistantRequests({
    store,
    files,
    chats,
    conversation: log,
    delivery: (): AssistantDelivery => delivery,
    voiceResult: (): null => null,
    done: (): void => undefined,
  });
});

afterEach(async () => {
  await opened.close();
});

function interruptedTurn(code: 'stopped' | 'interrupted' | 'unknown', reason: string): string {
  const { store } = opened;
  const asked = requests.send(
    sender,
    { text: 'Tidy the lights', attachments: [] },
    store.aiChats.chat(chatId),
  );
  const reply = log.startReply(store.aiChats.chat(chatId), asked.id, MODEL);
  log.failReply(reply.id, { text: 'Starting with the lounge.', reason, code }, [
    { title: 'Read devices', outcome: 'done' },
    { title: 'Control devices', outcome: 'done' },
  ]);
  log.failedMessage(asked.id, reason, code);
  return asked.id;
}

describe('how a native turn ending is classed', () => {
  it('shows a user stop as stopped and a lost connection as interrupted, not as errors', () => {
    expect(completionFailure({ kind: 'completed', interrupted: true }, false)).toEqual({
      reason: STOPPED_BY_USER,
      code: 'stopped',
    });
    const lost = {
      kind: 'failed',
      failure: { code: 'source_outcome_unknown', message: 'x', retry_at: null },
    } as const;
    expect(completionFailure(lost, false)).toEqual({
      reason: CONNECTION_LOST,
      code: 'interrupted',
    });
    expect(completionFailure(lost, true).code).toBe('unknown');
  });

  it('classes an out-of-credit failure as credits and any other failure as unknown', () => {
    const failed = (message: string) =>
      ({
        kind: 'failed',
        failure: { code: 'operation_failed', message, retry_at: null },
      }) as const;
    expect(completionFailure(failed('402 Insufficient credits'), false).code).toBe('credits');
    expect(completionFailure(failed('The turn failed.'), false).code).toBe('unknown');
  });
});

describe('the interruption note', () => {
  it('names how the last turn ended and what it had finished', () => {
    interruptedTurn('stopped', STOPPED_BY_USER);
    const note = interruptionNote(opened.store, chatId);
    expect(note).toContain('Your previous turn was interrupted (stopped by the user).');
    expect(note).toContain('Carry on with the work from where you left off.');
    expect(note).toContain('Read devices; Control devices');
  });

  it('keeps telling the AI while the continuing reply is still working', () => {
    interruptedTurn('interrupted', HUB_RESTARTED);
    log.startReply(opened.store.aiChats.chat(chatId), null, MODEL);
    expect(interruptionNote(opened.store, chatId)).toContain('the hub restarted');
  });

  it('is gone once the person writes something new', () => {
    interruptedTurn('stopped', STOPPED_BY_USER);
    requests.send(
      sender,
      { text: 'Never mind', attachments: [] },
      opened.store.aiChats.chat(chatId),
    );
    expect(interruptionNote(opened.store, chatId)).toBeNull();
  });

  it('is gone once a later reply was answered', () => {
    interruptedTurn('stopped', STOPPED_BY_USER);
    const next = log.startReply(opened.store.aiChats.chat(chatId), null, MODEL);
    log.finishReply(next.id, 'Done.', { model: MODEL, steps: [], sources: [] });
    expect(interruptionNote(opened.store, chatId)).toBeNull();
  });

  it('stays out of the way of an ordinary failure', () => {
    interruptedTurn('unknown', 'The model failed.');
    expect(interruptionNote(opened.store, chatId)).toBeNull();
  });
});

describe('continuing an interrupted turn', () => {
  it('queues a hidden directive without adding a message and keeps the partial reply', async () => {
    const askedId = interruptedTurn('stopped', STOPPED_BY_USER);
    const { store } = opened;
    const replies = store.assistantChat.repliesTo(askedId).map((row) => row.id);
    const messages = store.assistantChat.since(chatId, null).length;
    const before = delivery.added_count;
    const row = await requests.retry(
      store.aiChats.chat(chatId),
      askedId,
      'failed',
      sender.clientId,
    );
    expect(row).toMatchObject({ id: askedId, state: 'answered', reason_code: null });
    expect(store.assistantChat.since(chatId, null)).toHaveLength(messages);
    expect(store.assistantChat.repliesTo(askedId).map((reply) => reply.id)).toEqual(replies);
    const queued = store.assistantEvents.pending().filter((event) => event.chat_id === chatId);
    expect(queued.at(-1)).toMatchObject({ message_id: null, text: CONTINUE_NOTE });
    expect(delivery.added_count).toBe(before + 1);
  });

  it('does nothing the second time it is pressed', async () => {
    const askedId = interruptedTurn('interrupted', HUB_RESTARTED);
    const { store } = opened;
    await requests.retry(store.aiChats.chat(chatId), askedId, 'failed', sender.clientId);
    const before = delivery.added_count;
    const pending = store.assistantEvents.pending().length;
    await requests.retry(store.aiChats.chat(chatId), askedId, 'failed', sender.clientId);
    expect(delivery.added_count).toBe(before);
    expect(store.assistantEvents.pending()).toHaveLength(pending);
  });

  it('still tells the AI what was done once the continuation is under way', async () => {
    const askedId = interruptedTurn('interrupted', HUB_RESTARTED);
    const { store } = opened;
    await requests.retry(store.aiChats.chat(chatId), askedId, 'failed', sender.clientId);
    expect(interruptionNote(store, chatId)).toContain('Read devices; Control devices');
  });
});

describe('retrying a failed turn', () => {
  it('deletes nothing, does not re-queue the request and adds exactly one short note', async () => {
    const askedId = interruptedTurn('unknown', 'The model failed.');
    const { store } = opened;
    const empty = log.startReply(store.aiChats.chat(chatId), askedId, MODEL);
    log.failReply(empty.id, { text: '', reason: 'x', code: 'unknown' }, []);
    const replies = store.assistantChat.repliesTo(askedId).map((row) => row.id);
    const messages = store.assistantChat.since(chatId, null).length;
    await requests.retry(store.aiChats.chat(chatId), askedId, 'failed', sender.clientId);
    await requests.retry(store.aiChats.chat(chatId), askedId, 'failed', sender.clientId);
    expect(store.assistantChat.repliesTo(askedId).map((row) => row.id)).toEqual(replies);
    expect(store.assistantChat.since(chatId, null)).toHaveLength(messages);
    const queued = store.assistantEvents.pending().filter((event) => event.chat_id === chatId);
    expect(queued.filter((event) => event.text === CONTINUE_NOTE)).toHaveLength(1);
    expect(queued.find((event) => event.text === CONTINUE_NOTE)?.message_id).toBeNull();
    expect(store.assistantChat.message(askedId).state).toBe('answered');
  });
});

describe('a hub restart', () => {
  it('fails the working reply and the delivered request as interrupted and leaves settled ones', () => {
    const { store } = opened;
    const logs = captureLogs();
    const asked = requests.send(
      sender,
      { text: 'Tidy the lights', attachments: [] },
      store.aiChats.chat(chatId),
    );
    const event = store.assistantEvents.pending().find((row) => row.message_id === asked.id);
    if (event === undefined) throw new Error('the request has no event');
    store.assistantEvents.mark(event.id, 'delivered_at');
    const working = log.startReply(store.aiChats.chat(chatId), asked.id, MODEL);
    const settled = log.startReply(store.aiChats.chat(chatId), null, MODEL);
    log.finishReply(settled.id, 'Done.', { model: MODEL, steps: [], sources: [] });
    log.interrupted(HUB_RESTARTED);
    expect(store.assistantChat.message(working.id)).toMatchObject({
      state: 'failed',
      reason: HUB_RESTARTED,
      reason_code: 'interrupted',
    });
    expect(store.assistantChat.message(asked.id)).toMatchObject({
      state: 'failed',
      reason: HUB_RESTARTED,
      reason_code: 'interrupted',
    });
    expect(store.assistantChat.message(settled.id).state).toBe('answered');
    expect(logs.events()).toContain('turns.interrupted');
  });
});
