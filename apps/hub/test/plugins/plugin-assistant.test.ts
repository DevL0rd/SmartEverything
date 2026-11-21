import { hubLayout } from '../../src/data-layout';
import {
  ApiError,
  PLUGIN_MANIFEST,
  pluginChatKey,
  type AiChatRow,
  type AssistantSettings,
} from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { AssistantFiles } from '../../src/assistant/files';
import { ChatDirectory, type ChatOwner } from '../../src/assistant/chat-directory';
import type { EngineStatus } from '../../src/assistant/engines/engine';
import type { StoreHost } from '../../src/store/host/host';
import {
  PluginConversations,
  type PluginConversationsOptions,
} from '../../src/plugins/plugin-assistant';
import { PluginPeople } from '../../src/plugins/plugin-people';
import { testStore, type TestStore } from '../support/store';

const NOW = new Date('2026-10-18T09:00:00.000Z');
const FRIEND = '2';
const STRANGER = '99';
const KEY = 'channel';

interface Call {
  readonly profileId: string;
  readonly role: string;
  readonly chatId: string;
}

type Fake = PluginConversationsOptions['assistant'];

let opened: TestStore;
let calls: Call[];
let people: PluginPeople;
let conversations: ReturnType<PluginConversations['forPlugin']>;

function unused(): never {
  throw new Error('This test sets no model.');
}

function assistantFake(store: TestStore['store']): Fake {
  const note = (owner: ChatOwner, chatId: string): void => {
    calls.push({ profileId: owner.profileId, role: owner.role, chatId });
  };
  return {
    settings: (): AssistantSettings => store.assistantChat.settings(),
    compact: (owner: ChatOwner, chatId: string): Promise<boolean> => {
      note(owner, chatId);
      return Promise.resolve(true);
    },
    interrupt: (owner: ChatOwner, chatId: string): Promise<void> => {
      note(owner, chatId);
      return Promise.resolve();
    },
    updateChat: (owner: ChatOwner, chatId: string): Promise<AiChatRow> => {
      note(owner, chatId);
      return Promise.resolve(store.aiChats.chat(chatId));
    },
    engineStatus: (): EngineStatus => ({ state: 'working', reason: null }),
  };
}

beforeEach(async () => {
  opened = await testStore(() => NOW);
  const { store } = opened;
  await store.live.aiModels.load();
  const manifest = PLUGIN_MANIFEST.parse({
    id: 'discord',
    name: 'Discord',
    version: '1.0.0',
    description: 'A plugin for tests',
    publisher: 'Tests',
    permissions: { inbound: true },
  });
  store.plugins.create({ manifest, source: 'local', location: null, trusted: true });
  calls = [];
  conversations = new PluginConversations({
    store,
    assistant: assistantFake(store),
    catalogue: unused,
    now: (): Date => NOW,
  }).forPlugin('discord');
  people = new PluginPeople(store);
});

afterEach(async () => {
  await opened.close();
});

function chatOf(profileId: string): string {
  const { store } = opened;
  const files = new AssistantFiles({
    layout: hubLayout(opened.directory, {}),
    chat: store.assistantChat,
    attachments: store.live.attachments,
    now: (): Date => NOW,
  });
  return new ChatDirectory(store, files).chatForPlugin(
    profileId,
    pluginChatKey('discord', KEY),
    '#general',
  ).id;
}

describe('plugin conversation commands', () => {
  it('act on the chat of the person who asked, with that person’s role', async () => {
    const { store } = opened;
    const sam = store.profiles.create({ name: 'Sam' });
    await people.set('discord', FRIEND, { name: 'Sam', status: 'approved', profile_id: sam.id });
    const owners = chatOf(store.personAccess.homeOwner());
    const mine = chatOf(sam.id);
    await conversations.startOver(KEY, FRIEND);
    await conversations.compact(KEY, FRIEND);
    await conversations.stop(KEY, FRIEND);
    expect(calls).toStrictEqual([
      { profileId: sam.id, role: 'member', chatId: mine },
      { profileId: sam.id, role: 'member', chatId: mine },
      { profileId: sam.id, role: 'member', chatId: mine },
    ]);
    expect(owners).not.toBe(mine);
  });

  it('refuse a stranger every command and never touch the owner’s chat', async () => {
    chatOf(opened.store.personAccess.homeOwner());
    await expect(conversations.compact(KEY, STRANGER)).rejects.toBeInstanceOf(ApiError);
    await expect(conversations.startOver(KEY, STRANGER)).rejects.toBeInstanceOf(ApiError);
    await expect(conversations.stop(KEY, STRANGER)).rejects.toBeInstanceOf(ApiError);
    await expect(conversations.setModel(KEY, 'default', STRANGER)).rejects.toBeInstanceOf(ApiError);
    expect(calls).toStrictEqual([]);
  });

  it('do not show a stranger the owner’s conversation in the same channel', async () => {
    chatOf(opened.store.personAccess.homeOwner());
    expect(await conversations.conversation(KEY, STRANGER)).toBeNull();
  });

  it('refuse and record a linked guest whose time has ended', async () => {
    const { store } = opened;
    const lee = store.profiles.create({ name: 'Lee' });
    await people.set('discord', FRIEND, { name: 'Lee', status: 'approved', profile_id: lee.id });
    store.personAccess.change(lee.id, {
      role: 'guest',
      expires_at: new Date(NOW.getTime() - 1000).toISOString(),
    });
    await expect(conversations.compact(KEY, FRIEND)).rejects.toBeInstanceOf(ApiError);
    await expect(conversations.conversation(KEY, FRIEND)).rejects.toBeInstanceOf(ApiError);
    expect(calls).toStrictEqual([]);
    const audit = await store.host.call('accessAudit', 'list', 10, lee.id);
    expect(audit.map((entry) => entry.kind)).toStrictEqual(['refused_expired']);
  });

  it('act as the home owner when the plugin runs its own conversation', async () => {
    const home = opened.store.personAccess.homeOwner();
    const chat = chatOf(home);
    await conversations.compact(KEY);
    expect(calls).toStrictEqual([{ profileId: home, role: 'owner', chatId: chat }]);
  });

  it('do not find the owner’s chat for a person who has their own profile', async () => {
    const { store } = opened;
    const sam = store.profiles.create({ name: 'Sam' });
    await people.set('discord', FRIEND, { name: 'Sam', status: 'approved', profile_id: sam.id });
    chatOf(store.personAccess.homeOwner());
    expect(await conversations.conversation(KEY, FRIEND)).toBeNull();
    await expect(conversations.compact(KEY, FRIEND)).rejects.toBeInstanceOf(ApiError);
  });
});

describe('plugin spending command', () => {
  let reads: MockInstance<StoreHost['read']>;

  beforeEach(() => {
    reads = vi.spyOn(opened.store.host, 'read');
  });

  function totals(): unknown[] {
    return reads.mock.calls.filter(([name]) => name === 'mcpUsageTotals').map(([, input]) => input);
  }

  it('shows the whole home to the owner and to the plugin itself', async () => {
    await people.set('discord', FRIEND, { name: 'Me', status: 'owner' });
    await conversations.usage(FRIEND);
    await conversations.usage();
    expect(totals()).toHaveLength(6);
    for (const filter of totals()) {
      expect(filter).not.toHaveProperty('profileIds');
    }
  });

  it('shows a linked person only what their own profile spent', async () => {
    const sam = opened.store.profiles.create({ name: 'Sam' });
    await people.set('discord', FRIEND, { name: 'Sam', status: 'approved', profile_id: sam.id });
    await conversations.usage(FRIEND);
    expect(totals()).toHaveLength(3);
    for (const filter of totals()) {
      expect(filter).toMatchObject({ profileIds: [sam.id] });
    }
  });

  it('refuses a stranger and reads nothing', async () => {
    await expect(conversations.usage(STRANGER)).rejects.toThrow(ApiError);
    expect(totals()).toHaveLength(0);
  });
});
