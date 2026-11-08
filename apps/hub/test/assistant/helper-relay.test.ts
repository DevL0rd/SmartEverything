import type { AiChatRow, AssistantMessageRow } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ChatBranches } from '../../src/assistant/chat-branch';
import { ChatDirectory, type ChatOwner } from '../../src/assistant/chat-directory';
import { ConversationLog } from '../../src/assistant/conversation-log';
import { chatContext } from '../../src/assistant/conversation/history';
import { Delegation, type AskSender } from '../../src/assistant/delegation/delegation';
import { providerMessages } from '../../src/assistant/engines/computer/content';
import { AssistantFiles } from '../../src/assistant/files';
import type { StoredEvent } from '../../src/store/repositories/assistant-events';
import { CLAUDE_TEST_ENGINE, TEST_ENGINE } from '../support/engine';
import { captureLogs } from '../support/logs';
import { testStore, type TestStore } from '../support/store';
import { hubLayout } from '../../src/data-layout';

const UNWAITED = { wait: false, timeoutSeconds: 60 } as const;

let opened: TestStore;
let chats: ChatDirectory;
let delegation: Delegation;
let files: AssistantFiles;
let owner: ChatOwner;
let clientId: string;

beforeEach(async () => {
  captureLogs();
  const now = (): Date => new Date('2026-11-06T10:00:00.000Z');
  opened = await testStore(now);
  const { store } = opened;
  const client = store.clients.create(
    { name: 'This computer', platform: 'desktop', role: 'owner', tokenHash: 'a' },
    true,
  );
  clientId = client.id;
  owner = { profileId: store.profiles.activeOf(clientId).id, role: 'owner' };
  files = new AssistantFiles({
    layout: hubLayout(opened.directory, {}),
    chat: store.assistantChat,
    now,
  });
  chats = new ChatDirectory(store, files);
  delegation = new Delegation({
    store,
    chats,
    conversation: new ConversationLog(store),
    added: (): void => undefined,
    now,
  });
});

afterEach(async () => {
  await opened.close();
});

function chat(title: string): AiChatRow {
  return chats.create(owner, { title, engine: TEST_ENGINE });
}

function sender(chatId: string): AskSender {
  return { owner, clientId, chatId, plugin: null };
}

function received(event: StoredEvent): AssistantMessageRow {
  if (event.message_id === null) throw new Error('No message attached to the event.');
  return opened.store.assistantChat.message(event.message_id);
}

function expectHelperMessage(event: StoredEvent, helper: AiChatRow, text: string): void {
  expect(helper.helper_name).not.toBe(helper.title);
  expect(received(event)).toMatchObject({
    role: 'person',
    kind: 'text',
    author: helper.helper_name,
    text,
    origin: {
      source: 'subagent',
      name: helper.title,
      chat_id: helper.id,
      hops: event.hops,
    },
    embeds: [
      {
        kind: 'helper_dialogue',
        direction: 'from_helper',
        helper_chat_id: helper.id,
        helper_name: helper.helper_name,
      },
    ],
  });
}

describe('helper messages in the parent thread', () => {
  it('shows an explicit chat_send from the parent to its helper without queuing a parent turn', async () => {
    const parent = chat('Coordinator');
    const helper = chats.create(owner, {
      title: 'Check the data',
      engine: CLAUDE_TEST_ENGINE,
      parent_id: parent.id,
    });
    const text = 'Please check the totals.';
    const sent = await delegation.ask(sender(parent.id), helper.id, { ...UNWAITED, text });
    const { store } = opened;
    const event = store.assistantEvents.event(sent.eventId);
    expect(event).toMatchObject({ kind: 'chat', chat_id: helper.id, report_to: parent.id });
    expect(received(event)).toMatchObject({ text, state: 'queued', embeds: [] });
    expect(store.assistantEvents.pending()).toEqual([event]);
    expect(store.assistantChat.since(parent.id, null)).toMatchObject([
      {
        role: 'person',
        author: 'Coordinator',
        origin: { source: 'chat', name: parent.title, chat_id: parent.id },
        text,
        state: null,
        embeds: [
          {
            kind: 'helper_dialogue',
            direction: 'to_helper',
            helper_chat_id: helper.id,
            helper_name: helper.helper_name,
          },
        ],
      },
    ]);
    expect(chatContext(store, parent.id).rows).toEqual([]);
  });

  it('shows a direct chat_send from the helper as a named participant and delivers it to the parent', async () => {
    const parent = chat('Coordinator');
    const helper = chats.create(owner, {
      title: 'Check the data',
      engine: CLAUDE_TEST_ENGINE,
      parent_id: parent.id,
    });
    const text = 'I found the discrepancy.';
    const sent = await delegation.ask(sender(helper.id), parent.id, { ...UNWAITED, text });
    const { store } = opened;
    const event = store.assistantEvents.event(sent.eventId);
    expect(event).toMatchObject({ kind: 'chat', chat_id: parent.id, report_to: helper.id });
    expectHelperMessage(event, helper, text);
    expect(received(event).state).toBe('queued');
    await expect(providerMessages({ store, files }, parent, event, true)).resolves.toEqual([
      { role: 'user', content: [{ type: 'text', text }] },
    ]);
  });

  it('delivers one named parent message for an unwaited helper completion', async () => {
    const parent = chat('Coordinator');
    const { store } = opened;
    const question = 'Please check the totals.';
    new ConversationLog(store).person({
      chat: parent,
      clientId,
      author: 'Pat',
      text: question,
      files: [],
      origin: { source: 'app', plugin_id: null, device_id: null, name: null },
    });
    const started = await delegation.subagent(sender(parent.id), parent.id, {
      ...UNWAITED,
      task: 'Check the data',
      engine: CLAUDE_TEST_ENGINE,
    });
    const helper = store.aiChats.chat(started.chatId);
    const task = store.assistantEvents.event(started.eventId);
    expect(received(task)).toMatchObject({ text: 'Check the data', embeds: [] });
    store.assistantEvents.mark(task.id, 'answered_at');
    const text = 'The totals match.';
    delegation.finished(task, text, true);
    delegation.finished(task, text, true);
    const pending = store.assistantEvents.pending();
    expect(pending).toHaveLength(1);
    const [report] = pending;
    if (report === undefined) throw new Error('Expected one completion event.');
    expect(report).toMatchObject({ kind: 'report', chat_id: parent.id, report_to: null });
    expectHelperMessage(report, helper, text);
    expect(store.assistantChat.since(parent.id, null).map((row) => row.text)).toEqual([
      question,
      text,
    ]);
    expect(chatContext(store, parent.id).rows.at(-1)).toEqual(received(report));
    await expect(providerMessages({ store, files }, parent, report, false)).resolves.toEqual([
      { role: 'user', content: [{ type: 'text', text: question }] },
      { role: 'user', content: [{ type: 'text', text }] },
    ]);
  });

  it('keeps a message to an unrelated chat attributed to the helper’s working chat', async () => {
    const parent = chat('Coordinator');
    const other = chat('Other chat');
    const helper = chats.create(owner, {
      title: 'Check the data',
      engine: CLAUDE_TEST_ENGINE,
      parent_id: parent.id,
    });
    const sent = await delegation.ask(sender(helper.id), other.id, {
      ...UNWAITED,
      text: 'Hello',
    });
    const event = opened.store.assistantEvents.event(sent.eventId);
    expect(received(event)).toMatchObject({
      role: 'person',
      author: helper.helper_name,
      embeds: [],
      origin: { source: 'subagent', name: helper.title, chat_id: helper.id },
    });
    await delegation.ask(sender(other.id), helper.id, { ...UNWAITED, text: 'Hello back' });
    expect(opened.store.assistantChat.since(other.id, null)).toEqual([received(event)]);
    expect(opened.store.assistantChat.since(parent.id, null)).toEqual([]);
  });

  it('branches through canonical helper history and skips its transcript-only projections', async () => {
    const parent = chat('Coordinator');
    const helper = chats.create(owner, {
      title: 'Check the data',
      engine: CLAUDE_TEST_ENGINE,
      parent_id: parent.id,
    });
    const { store } = opened;
    const conversation = new ConversationLog(store);
    const branches = new ChatBranches(store, files, chats);
    const outbound = await delegation.ask(sender(parent.id), helper.id, {
      ...UNWAITED,
      text: 'Check the totals.',
    });
    const delivery = store.assistantEvents.event(outbound.eventId);
    store.assistantEvents.mark(delivery.id, 'answered_at');
    delegation.finished(delivery, 'The totals match.', true);
    const [report] = store.assistantEvents.pending();
    if (report === undefined) throw new Error('Expected one completion event.');
    const incoming = received(report);
    conversation.responderInChat({
      chat: parent,
      replyTo: null,
      text: 'Supplemental transcript-only update.',
      helperDialogue: {
        kind: 'helper_dialogue',
        direction: 'from_helper',
        helper_chat_id: helper.id,
        helper_name: incoming.author,
      },
    });
    const reply = conversation.responderInChat({
      chat: parent,
      replyTo: incoming.id,
      text: 'The report is ready.',
    });
    await expect(branches.branch(owner, parent.id, { messageId: incoming.id })).rejects.toThrow(
      'Select a coordinator turn',
    );
    const branch = await branches.branch(owner, parent.id, { messageId: reply.id });
    const copied = store.assistantChat.since(branch.id, null);
    expect(copied).toMatchObject([
      { text: incoming.text, embeds: incoming.embeds, author: incoming.author },
      { text: reply.text, reply_to: copied[0]?.id },
    ]);
    expect(copied[0]?.id).not.toBe(incoming.id);
  });
});
