import { DEFAULT_ENGINE, type AiChatRow, type ChatActivityNotice } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HubTool, HubToolResult, ToolCaller } from '../../src/ai-tools/hub-tool';
import { ToolHub } from '../../src/ai-tools/tool-hub';
import { ChatDirectory, type ChatOwner } from '../../src/assistant/chat-directory';
import { Coordination, type AskSender } from '../../src/assistant/coordination/asks';
import { DEADLOCK_TEXT, LOOP_LIMIT, PAUSED_TEXT } from '../../src/assistant/coordination/limits';
import { scopedHub } from '../../src/assistant/coordination/scoped-tools';
import { ConversationLog } from '../../src/assistant/conversation-log';
import { AssistantFiles } from '../../src/assistant/files';
import type { StoredEvent } from '../../src/store/repositories/assistant-events';
import { captureLogs } from '../support/logs';
import { testStore, type TestStore } from '../support/store';

let opened: TestStore;
let clock: number;
let notices: ChatActivityNotice[];
let chats: ChatDirectory;
let coordination: Coordination;
let owner: ChatOwner;
let sender: (chatId: string | null) => AskSender;

beforeEach(async () => {
  captureLogs();
  clock = Date.parse('2026-10-09T10:00:00.000Z');
  notices = [];
  opened = await testStore(() => new Date(clock));
  const { store } = opened;
  const client = store.clients.create(
    { name: 'This computer', platform: 'desktop', role: 'owner', tokenHash: 'a' },
    true,
  );
  owner = { profileId: store.profiles.activeOf(client.id).id, role: 'owner' };
  sender = (chatId): AskSender => ({ owner, clientId: client.id, chatId });
  const now = (): Date => new Date(clock);
  chats = new ChatDirectory(
    store,
    new AssistantFiles({ dataDirectory: opened.directory, chat: store.assistantChat, now }),
    now,
  );
  coordination = new Coordination({
    store,
    chats,
    conversation: new ConversationLog(store),
    emit: (notice): void => {
      if (notice.type === 'chat_activity') {
        notices.push(notice);
      }
    },
    added: (): void => undefined,
    now,
  });
});

afterEach(async () => {
  vi.useRealTimers();
  await opened.close();
});

function chat(title: string): AiChatRow {
  return chats.create(owner, { title, engine: DEFAULT_ENGINE });
}

function pendingIn(chatId: string): StoredEvent[] {
  return opened.store.assistantEvents.pending().filter((event) => event.chat_id === chatId);
}

function finish(event: StoredEvent, text: string, ok = true): void {
  opened.store.assistantEvents.mark(event.id, 'answered_at');
  coordination.finished(event, text, ok);
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
    const result = await coordination.ask(sender(a.id), b.id, {
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

  it('returns the reply to a waiting sender instead of reporting it', async () => {
    const a = chat('Planner');
    const b = chat('Research');
    const waiting = coordination.ask(sender(a.id), b.id, {
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
    const waiting = coordination.ask(sender(a.id), b.id, {
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

  it('refuses to wait on a chat that is waiting for the sender', async () => {
    const a = chat('Planner');
    const b = chat('Research');
    const first = coordination.ask(sender(a.id), b.id, {
      text: 'x',
      wait: true,
      timeoutSeconds: 60,
    });
    await expect(
      coordination.ask(sender(b.id), a.id, { text: 'y', wait: true, timeoutSeconds: 60 }),
    ).rejects.toThrow(DEADLOCK_TEXT);
    finish(only(pendingIn(b.id)), 'done');
    await first;
  });

  it('refuses a chat messaging itself and other people’s chats', async () => {
    const a = chat('Planner');
    await expect(
      coordination.ask(sender(a.id), a.id, { text: 'x', wait: false, timeoutSeconds: 60 }),
    ).rejects.toThrow('cannot message itself');
    const other = opened.store.profiles.create({ name: 'Sam' });
    const theirs = chats.create({ profileId: other.id, role: 'member' }, { title: 'Theirs' });
    await expect(
      coordination.ask(sender(a.id), theirs.id, { text: 'x', wait: false, timeoutSeconds: 60 }),
    ).rejects.toThrow('belongs to someone else');
  });
});

describe('loop guard and hand-offs', () => {
  it('pauses a chat after too many AI messages until the person writes', async () => {
    const a = chat('Planner');
    const b = chat('Research');
    const ask = (): Promise<unknown> =>
      coordination.ask(sender(a.id), b.id, { text: 'again', wait: false, timeoutSeconds: 60 });
    for (let count = 0; count < LOOP_LIMIT; count += 1) {
      await ask();
    }
    await expect(ask()).rejects.toThrow(PAUSED_TEXT);
    await expect(ask()).rejects.toThrow(PAUSED_TEXT);
    const paused = opened.store.assistantChat
      .messages({ chatId: b.id, limit: 50 })
      .filter((row) => row.text === PAUSED_TEXT);
    expect(paused).toHaveLength(1);
    expect(notices.map((notice) => notice.state)).toStrictEqual(['failed']);
    clock += 1000;
    opened.store.assistantEvents.add({
      id: crypto.randomUUID(),
      kind: 'chat',
      chat_id: b.id,
      message_id: null,
      profile_id: owner.profileId,
      client_id: null,
      text: 'go on',
    });
    clock += 1000;
    await expect(ask()).resolves.toMatchObject({ state: 'queued' });
  });

  it('refuses a message past the hand-off limit', async () => {
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
      hops: 8,
    });
    opened.store.assistantEvents.mark(current.id, 'delivered_at');
    await expect(
      coordination.ask(sender(a.id), b.id, { text: 'x', wait: false, timeoutSeconds: 60 }),
    ).rejects.toThrow('Too many hand-offs');
  });
});

describe('subagents', () => {
  it('starts a child chat with its tool list and keeps members off owner engines', async () => {
    const parent = chat('Planner');
    const result = await coordination.subagent(sender(parent.id), parent.id, {
      task: 'Compare two kettles\nwith details',
      tools: ['search_everything'],
      wait: false,
      timeoutSeconds: 60,
    });
    const child = opened.store.aiChats.chat(result.chatId);
    expect(child).toMatchObject({
      kind: 'subagent',
      parent_id: parent.id,
      title: 'Compare two kettles',
      tools: ['search_everything'],
    });
    await expect(
      coordination.subagent(sender(parent.id), parent.id, {
        task: 'x',
        engine: { ...DEFAULT_ENGINE, kind: 'claude-session' },
        tools: ['search_everything'],
        wait: false,
        timeoutSeconds: 60,
      }),
    ).rejects.toThrow('only for OpenRouter subagents');
    const member = { ...sender(parent.id), owner: { ...owner, role: 'member' as const } };
    await expect(
      coordination.subagent(member, parent.id, {
        task: 'x',
        engine: { ...DEFAULT_ENGINE, kind: 'claude-session' },
        wait: false,
        timeoutSeconds: 60,
      }),
    ).rejects.toThrow('Only the owner');
  });

  it('limits a subagent to the tools on its list', async () => {
    const tool = (name: string): HubTool => ({
      name,
      title: name,
      description: name,
      inputSchema: { type: 'object' },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
      origin: { kind: 'se' },
      humanOnly: false,
      confirms: (): boolean => false,
    });
    const hub = new ToolHub([
      {
        tools: (): HubTool[] => [tool('allowed'), tool('hidden')],
        call: (called): Promise<HubToolResult> =>
          Promise.resolve({ response: { ran: called.name }, line: '', pictures: [] }),
        validate: (): null => null,
        changes: (): (() => void) => (): void => undefined,
      },
    ]);
    const scoped = scopedHub(hub, ['allowed']);
    if (scoped === null) {
      throw new Error('no hub');
    }
    const caller: ToolCaller = {
      profileId: owner.profileId,
      role: 'owner',
      chatId: null,
      via: 'chat',
      confirmed: false,
      clientId: null,
    };
    expect(scoped.list().map((entry) => entry.name)).toStrictEqual(['allowed']);
    const hidden = await scoped.call('call_tool', { name: 'hidden', arguments: {} }, caller);
    expect(String(hidden.response['error'])).toContain('no tool named hidden');
    await expect(scoped.call('allowed', {}, caller)).resolves.toMatchObject({
      response: { ran: 'allowed' },
    });
  });
});
