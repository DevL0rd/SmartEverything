import { randomUUID } from 'node:crypto';
import type { AiChatRow } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HubTool, HubToolResult, ToolCaller } from '../../src/ai-tools/hub-tool';
import { ToolHub } from '../../src/ai-tools/tool-hub';
import { ChatDirectory, type ChatOwner } from '../../src/assistant/chat-directory';
import { Delegation, type AskSender } from '../../src/assistant/delegation/delegation';
import { scopedHub } from '../../src/assistant/tool-scope';
import { ConversationLog } from '../../src/assistant/conversation-log';
import { withExecutionAuthority } from '../../src/assistant/turn-authority';
import { AssistantFiles } from '../../src/assistant/files';
import type { StoredEvent } from '../../src/store/repositories/assistant-events';
import { captureLogs } from '../support/logs';
import { testStore, type TestStore } from '../support/store';
import { CLAUDE_TEST_ENGINE, TEST_ENGINE } from '../support/engine';
import { hubLayout } from '../../src/data-layout';

function hubTool(name: string): HubTool {
  return {
    name,
    title: name,
    description: name,
    inputSchema: { type: 'object' },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    origin: { kind: 'se' },
    humanOnly: false,
  };
}

function toolHub(names: readonly string[]): ToolHub {
  return new ToolHub([
    {
      tools: (): HubTool[] => names.map(hubTool),
      call: (called): Promise<HubToolResult> =>
        Promise.resolve({ response: { ran: called.name }, line: '', pictures: [] }),
      validate: (): null => null,
      changes: (): (() => void) => (): void => undefined,
    },
  ]);
}

let opened: TestStore;
let clock: number;
let chats: ChatDirectory;
let delegation: Delegation;
let owner: ChatOwner;
let sender: (chatId: string | null) => AskSender;

beforeEach(async () => {
  captureLogs();
  clock = Date.parse('2026-10-09T10:00:00.000Z');
  opened = await testStore(() => new Date(clock));
  const { store } = opened;
  const client = store.clients.create(
    { name: 'This computer', platform: 'desktop', role: 'owner', tokenHash: 'a' },
    true,
  );
  owner = { profileId: store.profiles.activeOf(client.id).id, role: 'owner' };
  sender = (chatId): AskSender => ({ owner, clientId: client.id, chatId, plugin: null });
  const now = (): Date => new Date(clock);
  chats = new ChatDirectory(
    store,
    new AssistantFiles({ layout: hubLayout(opened.directory, {}), chat: store.assistantChat, now }),
  );
  delegation = new Delegation({
    store,
    chats,
    conversation: new ConversationLog(store),
    added: (): void => undefined,
    now,
    tools: (): ToolHub => toolHub(['home_search']),
  });
});

afterEach(async () => {
  vi.useRealTimers();
  await opened.close();
});

function chat(title: string): AiChatRow {
  return chats.create(owner, { title, engine: TEST_ENGINE });
}

function claudeChat(title: string): AiChatRow {
  return chats.create(owner, {
    title,
    engine: CLAUDE_TEST_ENGINE,
    parent_id: chat('Coordinator').id,
  });
}

function pendingIn(chatId: string): StoredEvent[] {
  return opened.store.assistantEvents.pending().filter((event) => event.chat_id === chatId);
}

function finish(event: StoredEvent, text: string, ok = true): void {
  opened.store.assistantEvents.mark(event.id, 'answered_at');
  delegation.finished(event, text, ok);
}

function only(events: readonly StoredEvent[]): StoredEvent {
  expect(events).toHaveLength(1);
  const [event] = events;
  if (event === undefined) {
    throw new Error('no event');
  }
  return event;
}

describe('chat to chat messages', () => {
  it('queues an AI message and reports the answer back to the asking chat', async () => {
    const a = chat('Planner');
    const b = chat('Research');
    const result = await delegation.ask(sender(a.id), b.id, {
      text: 'Find the cheapest flight',
      wait: false,
      timeoutSeconds: 60,
    });
    expect(result).toMatchObject({ chatId: b.id, state: 'queued', text: null });
    const asked = only(pendingIn(b.id));
    expect(asked).toMatchObject({ kind: 'chat', report_to: a.id, hops: 1 });
    const row = opened.store.assistantChat.message(asked.message_id ?? '');
    expect(row.origin).toMatchObject({ source: 'chat', name: 'Planner', hops: 1 });
    finish(asked, 'Tuesday, 80 EUR');
    const report = only(pendingIn(a.id));
    expect(report).toMatchObject({ kind: 'report', hops: 2, report_to: null });
    expect(opened.store.assistantChat.message(report.message_id ?? '').text).toBe(
      'Tuesday, 80 EUR',
    );
  });

  it('reports a long answer whole', async () => {
    const a = chat('Planner');
    const b = chat('Research');
    await delegation.ask(sender(a.id), b.id, { text: 'Go', wait: false, timeoutSeconds: 60 });
    const answer = 'x'.repeat(40_000);
    finish(only(pendingIn(b.id)), answer);
    const report = only(pendingIn(a.id));
    expect(opened.store.assistantChat.message(report.message_id ?? '').text).toBe(answer);
  });

  it('returns the reply to a waiting sender instead of reporting it', async () => {
    const a = chat('Planner');
    const b = chat('Research');
    const waiting = delegation.ask(sender(a.id), b.id, {
      text: 'Hi',
      wait: true,
      timeoutSeconds: 60,
    });
    finish(only(pendingIn(b.id)), 'Hello');
    await expect(waiting).resolves.toMatchObject({ state: 'answered', text: 'Hello' });
    expect(pendingIn(a.id)).toHaveLength(0);
  });

  it('answers working after the timeout and reports the late result', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const a = chat('Planner');
    const b = chat('Research');
    const waiting = delegation.ask(sender(a.id), b.id, {
      text: 'Slow job',
      wait: true,
      timeoutSeconds: 5,
    });
    await vi.advanceTimersByTimeAsync(5000);
    await expect(waiting).resolves.toMatchObject({ state: 'working', text: null });
    finish(only(pendingIn(b.id)), 'boom', false);
    const report = only(pendingIn(a.id));
    expect(opened.store.assistantChat.message(report.message_id ?? '').text).toBe(
      'It could not finish: boom',
    );
  });

  it('refuses a chat messaging itself and other people’s chats', async () => {
    const a = chat('Planner');
    await expect(
      delegation.ask(sender(a.id), a.id, { text: 'x', wait: false, timeoutSeconds: 60 }),
    ).rejects.toThrow('cannot message itself');
    const other = opened.store.profiles.create({ name: 'Sam' });
    const theirs = chats.create({ profileId: other.id, role: 'member' }, { title: 'Theirs' });
    await expect(
      delegation.ask(sender(a.id), theirs.id, { text: 'x', wait: false, timeoutSeconds: 60 }),
    ).rejects.toThrow('belongs to someone else');
  });
});

describe('hand-offs', () => {
  it('keeps handing work on and counts every hand-off', async () => {
    const a = chat('Planner');
    const b = chat('Research');
    const current = opened.store.assistantEvents.add({
      id: crypto.randomUUID(),
      kind: 'report',
      chat_id: a.id,
      message_id: null,
      profile_id: owner.profileId,
      client_id: null,
      text: 'deep',
      hops: 40,
    });
    opened.store.assistantEvents.mark(current.id, 'delivered_at');
    await expect(
      delegation.ask(sender(a.id), b.id, { text: 'x', wait: false, timeoutSeconds: 60 }),
    ).resolves.toMatchObject({ state: 'queued' });
    expect(only(pendingIn(b.id))).toMatchObject({ hops: 41 });
  });
});

describe('subagents', () => {
  it('queues an explicitly selected Claude helper without moving the SmartEverything parent', async () => {
    const parent = chat('Coordinator');
    const request = {
      task: 'Review the change',
      engine: CLAUDE_TEST_ENGINE,
      wait: false,
      timeoutSeconds: 60,
    };
    const actor = sender(parent.id);
    const result = await delegation.subagent(actor, parent.id, request);
    const { store } = opened;
    expect(store.aiChats.chat(result.chatId)).toMatchObject({
      kind: 'subagent',
      parent_id: parent.id,
      engine: { kind: 'claude', device_id: request.engine.device_id },
    });
    expect(store.aiChats.chat(parent.id).engine).toEqual(parent.engine);
    expect(only(pendingIn(result.chatId))).toMatchObject({ report_to: parent.id });

    store.computerAi.bindLocal(request.engine.device_id);
    await expect(
      withExecutionAuthority(
        {
          event_id: randomUUID(),
          profile_id: owner.profileId,
          client_id: actor.clientId,
          kind: 'client',
          role: 'owner',
          hub_os_ban: true,
          tools: null,
          plugin_id: null,
          requester: null,
        },
        () => delegation.subagent(actor, parent.id, request),
      ),
    ).rejects.toThrow(/hub-local OS access/);
    expect(store.aiChats.usingEngine('claude')).toHaveLength(1);
  });

  it('keeps retired native history readable while excluding it from ordinary lists and defaults', () => {
    const current = chat('Current coordinator');
    clock += 1_000;
    const { store } = opened;
    const retired = store.aiChats.create({
      profileId: owner.profileId,
      kind: 'chat',
      title: 'Retired native history',
      nativeAdmission: 'retired',
      icon: null,
      parentId: null,
      sourceKey: null,
      engine: CLAUDE_TEST_ENGINE,
    });
    expect(chats.own(owner, retired.id)).toEqual(retired);
    expect(chats.defaultChat(owner.profileId).id).toBe(current.id);
    expect(store.aiChats.chats({ profileId: owner.profileId, archived: false })).toEqual([current]);
    expect(chats.search(owner, { q: 'Retired', archived: true, limit: 10 })).toEqual([]);
    expect(() => chats.create(owner, { engine: CLAUDE_TEST_ENGINE })).toThrow(
      /when creating a new chat or starting a helper/,
    );
  });

  it('starts a child chat with its tool list and keeps members off owner engines', async () => {
    const parent = claudeChat('Planner');
    const result = await delegation.subagent(sender(parent.id), parent.id, {
      task: 'Compare two kettles\nwith details',
      tools: ['home_search'],
      wait: false,
      timeoutSeconds: 60,
    });
    const child = opened.store.aiChats.chat(result.chatId);
    expect(child).toMatchObject({
      kind: 'subagent',
      parent_id: parent.id,
      title: 'Compare two kettles',
      tools: ['home_search'],
    });
  });

  it('follows the helper through its run row from queued to completed', async () => {
    const parent = claudeChat('Planner');
    const started = await delegation.subagent(sender(parent.id), parent.id, {
      task: 'Compare two kettles',
      wait: false,
      timeoutSeconds: 60,
    });
    const { aiAgentRuns } = opened.store;
    expect(aiAgentRuns.read(started.eventId)).toMatchObject({
      state: 'queued',
      parent_chat_id: parent.id,
      child_chat_id: started.chatId,
      supported_actions: ['open_chat'],
    });
    const event = only(pendingIn(started.chatId));
    expect(delegation.admit(event)).toBe(true);
    expect(aiAgentRuns.read(started.eventId)).toMatchObject({
      state: 'running',
      supported_actions: ['open_chat', 'interrupt'],
    });
    finish(event, 'Both are fine');
    expect(aiAgentRuns.read(started.eventId)).toMatchObject({
      state: 'completed',
      result: 'Both are fine',
      supported_actions: ['open_chat', 'delete'],
    });
    expect(only(pendingIn(parent.id))).toMatchObject({ kind: 'report' });
  });

  it('marks a helper that failed or was stopped', async () => {
    const parent = claudeChat('Planner');
    const failed = await delegation.subagent(sender(parent.id), parent.id, {
      task: 'First',
      wait: false,
      timeoutSeconds: 60,
    });
    const stopped = await delegation.subagent(sender(parent.id), parent.id, {
      task: 'Second',
      wait: false,
      timeoutSeconds: 60,
    });
    finish(only(pendingIn(failed.chatId)), 'boom', false);
    finish(only(pendingIn(stopped.chatId)), 'Stopped.', false);
    expect(opened.store.aiAgentRuns.read(failed.eventId)).toMatchObject({
      state: 'failed',
      error: 'boom',
    });
    expect(opened.store.aiAgentRuns.read(stopped.eventId).state).toBe('interrupted');
  });

  it('returns the helper answer to a waiting parent instead of reporting it', async () => {
    const parent = claudeChat('Planner');
    const waiting = delegation.subagent(sender(parent.id), parent.id, {
      task: 'Compare two kettles',
      wait: true,
      timeoutSeconds: 60,
    });
    finish(only(opened.store.assistantEvents.pending()), 'Kettle A');
    await expect(waiting).resolves.toMatchObject({ state: 'answered', text: 'Kettle A' });
    expect(pendingIn(parent.id)).toHaveLength(0);
  });

  it('refuses a child that would widen the tools of its parent', async () => {
    const parent = opened.store.aiChats.update(claudeChat('Planner').id, {
      tools: ['home_search'],
    });
    await expect(
      delegation.subagent(sender(parent.id), parent.id, {
        task: 'Anything',
        tools: ['home_search', 'device_set'],
        wait: false,
        timeoutSeconds: 60,
      }),
    ).rejects.toThrow('cannot widen its parent tool grant');
  });

  it('lets any chat of the person message an existing subagent whatever its tool list', async () => {
    const parent = claudeChat('Planner');
    const child = await delegation.subagent(sender(parent.id), parent.id, {
      task: 'Compare two kettles',
      tools: ['home_search'],
      wait: false,
      timeoutSeconds: 60,
    });
    const peer = opened.store.aiChats.update(chat('Reviewer').id, { tools: [] });

    const result = await delegation.ask(sender(peer.id), child.chatId, {
      text: 'Any update?',
      wait: false,
      timeoutSeconds: 60,
    });

    expect(result).toMatchObject({ chatId: child.chatId, state: 'queued' });
  });

  it('limits a subagent to the tools on its list', async () => {
    const hub = toolHub(['allowed', 'hidden']);
    const scoped = scopedHub(hub, ['allowed']);
    if (scoped === null) {
      throw new Error('no hub');
    }
    const caller: ToolCaller = {
      profileId: owner.profileId,
      role: 'owner',
      chatId: null,
      via: 'chat',
      clientId: null,
    };
    expect(scoped.list().map((entry) => entry.name)).toStrictEqual(['allowed']);
    const hidden = await scoped.call('tool_call', { name: 'hidden', arguments: {} }, caller);
    expect(String(hidden.response['error'])).toContain('no tool named hidden');
    await expect(scoped.call('allowed', {}, caller)).resolves.toMatchObject({
      response: { ran: 'allowed' },
    });
  });
});
