import { ApiError, DEFAULT_ENGINE, type AiChatRow, type Engine } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ChatBranches } from '../../src/assistant/chat-branch';
import { ChatDirectory, type ChatOwner } from '../../src/assistant/chat-directory';
import { AssistantFiles } from '../../src/assistant/files';
import { captureLogs } from '../support/logs';
import { testStore, type TestStore } from '../support/store';

const ROUTED: Engine = { kind: 'openrouter', model: 'anthropic/claude-sonnet', effort: 'high' };

let opened: TestStore;
let branches: ChatBranches;
let owner: ChatOwner;
let source: AiChatRow;
let messageId: string;
let validated: Engine[];
let refusing: boolean;

beforeEach(async () => {
  captureLogs();
  validated = [];
  refusing = false;
  opened = await testStore(() => new Date('2026-10-09T10:00:00.000Z'));
  const { store } = opened;
  const client = store.clients.create(
    { name: 'This computer', platform: 'desktop', role: 'owner', tokenHash: 'a'.repeat(64) },
    true,
  );
  const profileId = store.profiles.activeOf(client.id).id;
  owner = { profileId, role: 'owner' };
  const now = (): Date => new Date('2026-10-09T10:00:00.000Z');
  const files = new AssistantFiles({
    dataDirectory: opened.directory,
    chat: store.assistantChat,
    now,
  });
  const chats = new ChatDirectory(store, files, now, {
    validate: (engine): void => {
      if (refusing) throw new ApiError('forbidden', 'That engine is not available to you.');
      validated.push(engine);
    },
  });
  branches = new ChatBranches(store, files, chats);
  source = store.aiChats.create({
    profileId,
    kind: 'chat',
    title: 'Plan the trip',
    icon: null,
    parentId: null,
    sourceKey: null,
    engine: DEFAULT_ENGINE,
    titleAuto: false,
  });
  messageId = store.assistantChat.addMessage({
    profile_id: profileId,
    client_id: null,
    role: 'person',
    kind: 'text',
    author: 'Sam',
    text: 'Where should we go?',
    attachments: [],
    state: null,
    reason: null,
    steps: [],
    step_states: [],
    reply_to: null,
    chat_id: source.id,
    origin: null,
    embeds: [],
    cost_micros: 0,
    model: null,
  }).id;
});

afterEach(async () => {
  await opened.close();
});

describe('branching a chat with another engine', () => {
  it('continues on the engine, model and thinking the branch names', async () => {
    const branch = await branches.branch(owner, source.id, { messageId, engine: ROUTED });
    expect(branch.engine).toEqual(ROUTED);
    expect(branch.parent_id).toBe(source.id);
    expect(validated).toEqual([ROUTED]);
    expect(opened.store.aiChats.chat(source.id).engine).toEqual(DEFAULT_ENGINE);
  });

  it('keeps the original engine when none is named', async () => {
    const branch = await branches.branch(owner, source.id, { messageId });
    expect(branch.engine).toEqual(DEFAULT_ENGINE);
    expect(validated).toEqual([]);
  });

  it('copies the messages up to the branch point whichever engine it continues on', async () => {
    const branch = await branches.branch(owner, source.id, { messageId, engine: ROUTED });
    const copied = opened.store.assistantChat.messages({ chatId: branch.id, limit: 10 });
    expect(copied.map((row) => row.text)).toEqual(['Where should we go?']);
  });

  it('refuses an engine the person may not use and leaves no branch behind', async () => {
    refusing = true;
    await expect(branches.branch(owner, source.id, { messageId, engine: ROUTED })).rejects.toThrow(
      'not available',
    );
    expect(
      opened.store.aiChats.chats({ profileId: owner.profileId, archived: false }),
    ).toHaveLength(1);
  });
});
