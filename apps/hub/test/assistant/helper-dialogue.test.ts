import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  helperDialogueOf,
  type AiChatRow,
  type AssistantMessageRow,
  type AssistantNewMessage,
  type Engine,
} from '@smarteverything/domain';
import { ChatDirectory } from '../../src/assistant/chat-directory';
import { ConversationLog } from '../../src/assistant/conversation-log';
import { chatContext } from '../../src/assistant/conversation/history';
import { Delegation } from '../../src/assistant/delegation/delegation';
import { providerMessages } from '../../src/assistant/engines/computer/content';
import { EngineRegistry } from '../../src/assistant/engines/registry';
import { AssistantFiles } from '../../src/assistant/files';
import type { Sender } from '../../src/assistant/requests';
import type { StoredEvent } from '../../src/store/repositories/assistant-events';
import { captureLogs } from '../support/logs';
import { CLAUDE_TEST_ENGINE, TEST_ENGINE } from '../support/engine';
import { testStore, type TestStore } from '../support/store';
import { hubLayout } from '../../src/data-layout';

const NOW = '2026-11-05T15:00:00.000Z';
let opened: TestStore;
let chats: ChatDirectory;
let conversation: ConversationLog;
let files: AssistantFiles;
let delegation: Delegation;
let engines: EngineRegistry;
let sender: Sender;
const added = vi.fn();

beforeEach(async () => {
  captureLogs();
  added.mockClear();
  const now = (): Date => new Date(NOW);
  opened = await testStore(now);
  const { store } = opened;
  const client = store.clients.create(
    { name: 'Desktop', platform: 'desktop', role: 'owner', tokenHash: 'fixture' },
    true,
  );
  sender = { clientId: client.id, profileId: store.profiles.activeOf(client.id).id };
  files = new AssistantFiles({
    layout: hubLayout(opened.directory, {}),
    chat: store.assistantChat,
    now,
  });
  chats = new ChatDirectory(store, files);
  conversation = new ConversationLog(store);
  delegation = new Delegation({ store, chats, conversation, added, now });
  engines = new EngineRegistry(store);
  engines.attach({
    kind: 'claude',
    ownerOnly: true,
    status: () => ({ state: 'ready', reason: null }),
    deliver: () => Promise.resolve(),
    preflightHelperInput: () => Promise.resolve(),
    historyChanged: () => Promise.resolve(),
    compact: () => Promise.resolve(false),
    interrupt: () => Promise.resolve(),
  });
});

afterEach(async () => {
  await opened.close();
});

function coordinator(title: string): AiChatRow {
  return chats.create(
    { profileId: sender.profileId, role: 'owner' },
    { title, engine: TEST_ENGINE },
  );
}

function helper(parent: AiChatRow, engine: Engine = CLAUDE_TEST_ENGINE): AiChatRow {
  return chats.create(
    { profileId: parent.profile_id, role: 'owner' },
    { title: 'Keyboard review', engine, parent_id: parent.id },
  );
}

function sendBody(target: AiChatRow): AssistantNewMessage {
  return {
    text: 'Does the keyboard overlap?',
    attachments: [],
    client_message_id: randomUUID(),
    helper_target: { chat_id: target.id },
  };
}

function send(parent: AiChatRow, body: AssistantNewMessage): Promise<AssistantMessageRow> {
  return delegation.sendToHelper(sender, parent, body, { engines, files });
}

async function upload(
  name: string,
  content: string,
  profileId = sender.profileId,
): Promise<string> {
  const bytes = Buffer.from(content);
  const started = await files.start({ profileId, name, mime: 'text/plain', bytes: bytes.length });
  await files.chunk(profileId, started.uploadId, 0, bytes.toString('base64'));
  return (await files.finish(profileId, started.uploadId)).id;
}

function latch(): { readonly promise: Promise<void>; readonly resolve: () => void } {
  let resolve = (): void => undefined;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function onlyPending(): StoredEvent {
  const pending = opened.store.assistantEvents.pending();
  expect(pending).toHaveLength(1);
  const [event] = pending;
  if (event === undefined) throw new Error('The helper input was not queued.');
  return event;
}

describe('parent conversation helper messages', () => {
  it('queues one child input across identical retries and keeps group speech out of parent model history', async () => {
    const parent = coordinator('Planner');
    const target = helper(parent);
    const body = sendBody(target);
    const row = await send(parent, body);
    expect(helperDialogueOf(row)).toEqual({
      kind: 'helper_dialogue',
      direction: 'to_helper',
      helper_chat_id: target.id,
      helper_name: target.helper_name,
    });
    expect(row.quote).toBeNull();
    expect((await send(parent, body)).id).toBe(row.id);
    await expect(send(parent, { ...body, text: 'Different' })).rejects.toThrow(
      'different submission',
    );
    expect(added).toHaveBeenCalledTimes(1);
    const event = onlyPending();
    expect(event).toMatchObject({
      chat_id: target.id,
      helper_parent_message_id: row.id,
      report_to: null,
      text: body.text,
    });
    expect(event.message_id).not.toBe(row.id);
    expect(engines.route(event).kind).toBe('engine');
    expect(chatContext(opened.store, parent.id).rows).toEqual([]);
  });

  it('projects one terminal answer under the stable helper name and supplies a reply quote to the helper', async () => {
    const parent = coordinator('Planner');
    const target = helper(parent);
    const first = await send(parent, sendBody(target));
    const event = onlyPending();
    const { store } = opened;
    store.assistantEvents.mark(event.id, 'answered_at');
    delegation.finished(event, 'Only in landscape.', true);
    delegation.finished(event, 'Only in landscape.', true);
    const response = store.assistantChat.message(event.id);
    expect(response).toMatchObject({
      chat_id: parent.id,
      role: 'responder',
      author: target.helper_name,
      reply_to: null,
      quote: { message_id: first.id, author: first.author, excerpt: first.text, media_kind: null },
    });
    expect(helperDialogueOf(response)).toMatchObject({ direction: 'from_helper' });
    expect(store.assistantChat.messages({ chatId: parent.id, limit: 10 })).toHaveLength(2);
    expect(store.assistantEvents.pending()).toEqual([]);
    const next = await send(parent, {
      ...sendBody(target),
      quote_message_id: response.id,
    });
    expect(next.quote).toEqual({
      message_id: response.id,
      author: target.helper_name,
      excerpt: response.text,
      media_kind: null,
    });
    const replied = onlyPending();
    expect(replied.chat_id).toBe(target.id);
    expect(replied.helper_quote_text).toBe(response.text);
    expect(replied.text).toBe(next.text);
    await expect(providerMessages({ store, files }, target, replied, true)).resolves.toEqual([
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Earlier reply you were asked about:\nOnly in landscape.' },
          { type: 'text', text: next.text },
        ],
      },
    ]);
  });

  it('refuses a helper or quote outside the selected conversation and blocks removed delivery sources', async () => {
    const parent = coordinator('Planner');
    const foreign = helper(coordinator('Other'));
    const target = helper(parent);
    await expect(send(parent, sendBody(foreign))).rejects.toThrow('direct helper');
    await expect(
      send(parent, {
        ...sendBody(target),
        quote_message_id: randomUUID(),
      }),
    ).rejects.toThrow('message from this helper');
    expect(opened.store.assistantEvents.pending()).toEqual([]);
    const row = await send(parent, sendBody(target));
    const event = onlyPending();
    opened.store.assistantChat.removeMessages([row.id]);
    const route = engines.route(event);
    if (route.kind !== 'blocked') throw new Error('Expected removed delivery to be blocked.');
    expect(route.reason).toContain('removed');
  });

  it('keeps later accepted child messages out of the first provider turn', async () => {
    const parent = coordinator('Planner');
    const target = helper(parent);
    const first = sendBody(target);
    await send(parent, first);
    const event = onlyPending();
    await send(parent, { ...sendBody(target), text: 'A later question' });
    const messages = await providerMessages({ store: opened.store, files }, target, event, false);
    expect(messages).toEqual([{ role: 'user', content: [{ type: 'text', text: first.text }] }]);
  });

  it('retains the original key after parent deletion without re-enqueuing the work', async () => {
    const parent = coordinator('Planner');
    const target = helper(parent);
    const body = sendBody(target);
    const row = await send(parent, body);
    opened.store.assistantChat.removeMessages([row.id]);
    await expect(send(parent, body)).rejects.toThrow('already accepted');
    await expect(send(parent, { ...body, text: 'Changed' })).rejects.toThrow(
      'different submission',
    );
    expect(onlyPending().chat_id).toBe(target.id);
    expect((await send(parent, sendBody(target))).id).not.toBe(row.id);
    expect(opened.store.assistantEvents.pending()).toHaveLength(2);
  });

  it.each(['claude', 'codex'] as const)(
    'includes a late earlier answer in cold %s history',
    async (runtime) => {
      const parent = coordinator('Planner');
      const target = helper(parent);
      const { store } = opened;
      const first = sendBody(target);
      await send(parent, first);
      const previous = onlyPending();
      store.assistantEvents.mark(previous.id, 'delivered_at');
      const second = { ...sendBody(target), text: 'Second question' };
      await send(parent, second);
      const current = onlyPending();
      const reply = conversation.startReply(target, previous.message_id, 'opus');
      conversation.finishReply(reply.id, 'First answer', { model: 'opus', steps: [], sources: [] });
      await send(parent, { ...sendBody(target), text: 'Later question' });
      const messages = await providerMessages({ store, files, runtime }, target, current, false);
      expect(messages).toEqual([
        { role: 'user', content: [{ type: 'text', text: first.text }] },
        { role: 'assistant', content: [{ type: 'text', text: 'First answer' }] },
        { role: 'user', content: [{ type: 'text', text: second.text }] },
      ]);
    },
  );

  it('fails unresolved parent messages if the addressed helper is deleted', async () => {
    const parent = coordinator('Planner');
    const target = helper(parent);
    const row = await send(parent, sendBody(target));
    const { store } = opened;
    store.aiChats.remove(target.id);
    expect(store.assistantChat.message(row.id)).toMatchObject({
      state: 'failed',
      reason: 'The addressed helper was removed.',
    });
    expect(store.assistantEvents.pending()).toEqual([]);
  });

  it('refuses adopted harness helpers before accepting a message', async () => {
    const parent = coordinator('Planner');
    const target = helper(parent, TEST_ENGINE);
    await expect(send(parent, sendBody(target))).rejects.toThrow('cannot receive a separate turn');
    expect(opened.store.assistantChat.messages({ chatId: parent.id, limit: 10 })).toEqual([]);
    expect(opened.store.assistantEvents.pending()).toEqual([]);
  });

  it('reconciles the persisted child answer when the hub missed the completion callback', async () => {
    const parent = coordinator('Planner');
    const target = helper(parent);
    const first = await send(parent, sendBody(target));
    const event = onlyPending();
    const reply = conversation.startReply(target, event.message_id, 'opus');
    conversation.finishReply(reply.id, 'The saved answer.', {
      model: 'opus',
      steps: [],
      sources: [],
    });
    conversation.stateOf(event.message_id, 'working');
    opened.store.assistantEvents.mark(event.id, 'delivered_at');
    delegation.restart();
    delegation.restart();
    expect(opened.store.assistantChat.message(first.id).state).toBe('answered');
    expect(opened.store.assistantChat.message(event.id).text).toBe('The saved answer.');
  });

  it.each(['parent', 'child'] as const)(
    'retains the other attachment after deleting the %s row',
    async (removed) => {
      const parent = coordinator('Planner');
      const target = helper(parent);
      const id = await upload('context.txt', 'Useful context.');
      const body = { ...sendBody(target), text: '', attachments: [id] };
      const [row, retried] = await Promise.all([send(parent, body), send(parent, body)]);
      expect(retried.id).toBe(row.id);
      expect(added).toHaveBeenCalledTimes(1);
      const event = onlyPending();
      const { store } = opened;
      if (event.message_id === null) throw new Error('The helper row was not written.');
      const original = store.assistantChat.attachment(id);
      const [copied] = store.assistantChat.attachmentsOf(event.message_id);
      if (copied === undefined) throw new Error('The child attachment was not written.');
      expect(original.message_id).toBe(row.id);
      expect(copied.id).not.toBe(original.id);
      expect(copied.storage_path).not.toBe(original.storage_path);
      expect(copied.sha256).toBe(original.sha256);
      expect(store.assistantChat.unattachedBefore('2099-11-05T15:00:00.000Z')).toEqual([]);
      expect(() =>
        chats.attachment({ profileId: sender.profileId, role: 'owner', confinedTo: target.id }, id),
      ).toThrow('belongs to someone else');
      await expect(providerMessages({ store, files }, target, event, true)).resolves.toEqual([
        {
          role: 'user',
          content: [{ type: 'text', text: '[Attached file: context.txt]\nUseful context.' }],
        },
      ]);
      expect(chatContext(store, parent.id).rows).toEqual([]);
      const removedRow = removed === 'parent' ? row.id : event.message_id;
      const remaining = removed === 'parent' ? copied : original;
      await files.remove(store.assistantChat.removeMessages([removedRow]));
      expect(store.assistantChat.attachment(remaining.id)).toEqual(remaining);
      await expect(readFile(files.pathOf(remaining), 'utf8')).resolves.toBe('Useful context.');
    },
  );

  it('retains uploads when a partial copy attempt fails and accepts the same draft on retry', async () => {
    const parent = coordinator('Planner');
    const target = helper(parent);
    const first = await upload('first.txt', 'First.');
    const second = await upload('second.txt', 'Second.');
    const body = { ...sendBody(target), attachments: [first, second] };
    const copy = files.prepareCopy.bind(files);
    const failure = new Error('Copy failed.');
    vi.spyOn(files, 'prepareCopy').mockImplementationOnce(copy).mockRejectedValueOnce(failure);
    await expect(send(parent, body)).rejects.toBe(failure);
    const { store } = opened;
    expect(store.assistantEvents.pending()).toEqual([]);
    expect(store.assistantChat.messages({ chatId: parent.id, limit: 10 })).toEqual([]);
    expect(
      new Set(
        store.assistantChat.unattachedBefore('2099-11-05T15:00:00.000Z').map((file) => file.id),
      ),
    ).toEqual(new Set([first, second]));
    await expect(send(parent, body)).resolves.toMatchObject({
      attachments: [{ id: first }, { id: second }],
    });
    await expect(send(parent, { ...body, attachments: [second, first] })).rejects.toThrow(
      'different submission',
    );
  });

  it('reauthorizes a raced receipt after the initiating app switches profiles', async () => {
    const parent = coordinator('Planner');
    const target = helper(parent);
    const id = await upload('context.txt', 'Useful context.');
    const body = { ...sendBody(target), attachments: [id] };
    const reached = latch();
    const release = latch();
    const copy = files.prepareCopy.bind(files);
    vi.spyOn(files, 'prepareCopy').mockImplementationOnce(async (file) => {
      reached.resolve();
      await release.promise;
      return copy(file);
    });
    const pending = send(parent, body);
    const refused = expect(pending).rejects.toThrow('initiating profile active');
    await reached.promise;
    const { store } = opened;
    try {
      const accepted = await send(parent, body);
      const other = store.profiles.create({ name: 'Other' });
      store.clients.useProfile(sender.clientId, other.id);
      expect(store.assistantChat.attachmentsOf(accepted.id)).toHaveLength(1);
    } finally {
      release.resolve();
      await refused;
    }
    const event = onlyPending();
    if (event.message_id === null) throw new Error('The child row was not written.');
    expect(store.assistantChat.attachmentsOf(event.message_id)).toHaveLength(1);
    expect(store.assistantChat.unattachedBefore('2099-11-05T15:00:00.000Z')).toEqual([]);
    expect(added).toHaveBeenCalledTimes(1);
  });

  it('rejects foreign, duplicate and already-bound uploads without creating a second helper row', async () => {
    const parent = coordinator('Planner');
    const target = helper(parent);
    const id = await upload('context.txt', 'Useful context.');
    const body = { ...sendBody(target), attachments: [id] };
    const other = opened.store.profiles.create({ name: 'Other' }).id;
    const foreign = await upload('private.txt', 'Other context.', other);
    await expect(send(parent, { ...body, attachments: [foreign] })).rejects.toThrow(
      'unsent upload',
    );
    await expect(send(parent, { ...body, attachments: [id, id] })).rejects.toThrow('only once');
    expect(opened.store.assistantEvents.pending()).toEqual([]);
    await send(parent, body);
    await expect(send(parent, { ...body, client_message_id: randomUUID() })).rejects.toThrow(
      'unsent upload',
    );
    expect(onlyPending().chat_id).toBe(target.id);
  });
});
