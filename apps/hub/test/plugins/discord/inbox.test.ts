import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { PLUGIN_MANIFEST, pluginChatKey, type InboundMessage } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AssistantFiles } from '../../../src/assistant/files';
import { ChatDirectory } from '../../../src/assistant/chat-directory';
import { PluginHost } from '../../../src/plugins/host';
import { PluginInbox, type PluginInboxOptions } from '../../../src/plugins/inbound';
import { PluginPeople } from '../../../src/plugins/plugin-people';
import { PluginSpeakers } from '../../../src/plugins/plugin-speakers';
import { PluginSecrets } from '../../../src/plugins/plugin-secrets';
import { SecretStore } from '../../../src/secrets/store';
import { Transcripts } from '../../../src/transcripts/transcript-service';
import { testLogger } from '../../support/logs';
import { testStore, type TestStore } from '../../support/store';

const NOW = new Date('2026-10-16T10:00:00.000Z');

function nothing(): void {
  return undefined;
}

function unused(): never {
  throw new Error('This test runs no built-in plugin.');
}

async function hostOf(opened: TestStore): Promise<PluginHost> {
  const { store, directory } = opened;
  const secrets = await SecretStore.open(join(directory, 'secrets'), randomBytes(32));
  const now = (): Date => NOW;
  return new PluginHost({
    store,
    secrets: new PluginSecrets(secrets),
    builtins: [],
    builtin: {
      drivers: {
        registry: { register: (): (() => void) => nothing },
        viewers: { watch: (): (() => void) => nothing, watched: (): boolean => false },
        metrics: { push: nothing },
        sources: { push: nothing },
        deviceIdOf: (): undefined => undefined,
        target: (deviceId): string => `device:${deviceId}`,
      },
      people: new PluginPeople(store),
      speakers: new PluginSpeakers(),
      voice: {
        store,
        host: unused,
        turn: unused,
        chat: unused,
        keys: { changes: (): (() => void) => nothing },
        ears: { open: unused },
        transcripts: new Transcripts({
          store,
          clock: { now, at: (): (() => void) => nothing },
          log: testLogger('transcripts'),
        }),
        transcriber: { transcribe: unused },
        names: (): string[] => [],
        keyPresent: (): boolean => false,
        clock: { now, at: (): (() => void) => nothing },
        log: testLogger('plugin-voice'),
      },
      conversations: { forPlugin: unused },
      attachments: (): string[] => [],
      machineFile: unused,
      uploadFile: unused,
      dataDirectory: directory,
      submit: (): [] => [],
      now,
    },
    contributions: {
      signals: { emit: nothing, register: (): (() => void) => nothing },
      inbound: nothing,
      now,
    },
    configure: (): Promise<void> => Promise.resolve(),
    dataDirectory: directory,
    mcpUrl: (): string => 'http://127.0.0.1:1',
    now,
    log: testLogger('plugins'),
  });
}

interface Rig {
  readonly inbox: PluginInbox;
  readonly handed: string[];
  readonly requesters: (string | undefined)[];
  readonly opened: TestStore;
  readonly host: PluginHost;
}

async function rigged(): Promise<Rig> {
  const opened = await testStore(() => NOW);
  const { store } = opened;
  const manifest = PLUGIN_MANIFEST.parse({
    id: 'discord',
    name: 'Discord',
    version: '1.0.0',
    description: 'A plugin for tests',
    publisher: 'Tests',
    permissions: { inbound: true },
  });
  store.plugins.create({ manifest, source: 'local', location: null, trusted: true });
  const files = new AssistantFiles({
    dataDirectory: opened.directory,
    chat: store.assistantChat,
    now: (): Date => NOW,
  });
  const handed: string[] = [];
  const requesters: (string | undefined)[] = [];
  const assistant: PluginInboxOptions['assistant'] = {
    chats: new ChatDirectory(store, files, () => NOW),
    files,
    onFinished: (): (() => void) => nothing,
    onActivity: (): (() => void) => nothing,
    inbound: (input): Promise<{ eventId: string; messageId: string }> => {
      handed.push(input.chat.profile_id);
      requesters.push(input.origin.requester);
      return Promise.resolve({ eventId: `event-${String(handed.length)}`, messageId: 'message' });
    },
  };
  const host = await hostOf(opened);
  const inbox = new PluginInbox({
    store,
    assistant,
    host: (): PluginHost => host,
    fetch,
    now: (): Date => NOW,
    log: testLogger('inbound'),
  });
  return { inbox, handed, requesters, opened, host };
}

function message(index: number, conversation = 'channel'): InboundMessage {
  return {
    eventId: `e${String(index)}`,
    conversation: { key: conversation, title: '#general' },
    text: `hello ${String(index)}`,
    from: { id: '42', name: 'Sam', trusted: false },
    attachments: [],
    reply: {
      tool: 'reply',
      eventIdArg: 'eventId',
      textArg: 'text',
      progressArg: null,
      filesArg: null,
    },
    rule: null,
    voice: false,
    priority: 'normal',
  };
}

let rig: Rig;

beforeEach(async () => {
  rig = await rigged();
});

afterEach(async () => {
  rig.inbox.stop();
  await rig.host.shutdown();
  await rig.opened.close();
});

describe('plugin inbox', () => {
  it('hands over every message of a burst without dropping any', async () => {
    for (let index = 0; index < 40; index += 1) {
      rig.inbox.receive('discord', message(index, `channel-${String(index)}`));
    }
    await expect.poll(() => rig.handed.length).toBe(40);
  });

  it('keeps plugin chats in the first profile when the desktop switches profile', async () => {
    const { store } = rig.opened;
    const first = store.profiles.first();
    const owner = store.clients.create(
      { name: 'This computer', platform: 'desktop', role: 'owner', tokenHash: 'a' },
      true,
    );
    const other = store.profiles.create({ name: 'Sam' });
    store.clients.useProfile(owner.id, other.id);
    new PluginPeople(store).set('discord', '42', { name: 'Me', status: 'owner' });
    rig.inbox.receive('discord', message(1));
    await expect.poll(() => rig.handed.length).toBe(1);
    expect(rig.handed).toStrictEqual([first.id]);
    expect(store.aiChats.bySource(first.id, pluginChatKey('discord', 'channel'))).toBeDefined();
    expect(store.aiChats.bySource(other.id, pluginChatKey('discord', 'channel'))).toBeUndefined();
  });

  it('runs a stranger and an approved person with no home person as limited guests in the owner profile', async () => {
    const { store } = rig.opened;
    new PluginPeople(store).set('discord', '42', { name: 'Sam', status: 'approved' });
    rig.inbox.receive('discord', message(1));
    await expect.poll(() => rig.handed.length).toBe(1);
    expect(rig.handed).toStrictEqual([store.personAccess.homeOwner()]);
    expect(rig.requesters).toStrictEqual(['unlisted']);
  });

  it('gives a stranger a chat of their own, never the chat the owner has in the same channel', async () => {
    const { store } = rig.opened;
    const home = store.personAccess.homeOwner();
    new PluginPeople(store).set('discord', '43', { name: 'Me', status: 'owner' });
    rig.inbox.receive('discord', { ...message(1), from: { id: '43', name: 'Me', trusted: false } });
    await expect.poll(() => rig.handed.length).toBe(1);
    rig.inbox.receive('discord', message(2));
    await expect.poll(() => rig.handed.length).toBe(2);
    rig.inbox.receive('discord', {
      ...message(3),
      from: { id: '77', name: 'Kim', trusted: false },
    });
    await expect.poll(() => rig.handed.length).toBe(3);
    const owners = store.aiChats.bySource(home, pluginChatKey('discord', 'channel'));
    const sams = store.aiChats.bySource(home, pluginChatKey('discord', 'channel:guest:42'));
    const kims = store.aiChats.bySource(home, pluginChatKey('discord', 'channel:guest:77'));
    expect(new Set([owners?.id, sams?.id, kims?.id]).size).toBe(3);
    expect(owners).toBeDefined();
    expect(sams).toBeDefined();
    expect(kims).toBeDefined();
  });

  it('answers a linked guest whose time has ended with a refusal, starts no chat and records it', async () => {
    const { store } = rig.opened;
    const guest = store.profiles.create({ name: 'Lee' });
    new PluginPeople(store).set('discord', '42', {
      name: 'Lee',
      status: 'approved',
      profile_id: guest.id,
    });
    store.personAccess.change(guest.id, {
      role: 'guest',
      expires_at: new Date(NOW.getTime() - 60_000).toISOString(),
    });
    const call = vi
      .spyOn(rig.host, 'call')
      .mockResolvedValue({ response: {}, line: '', pictures: [] });
    rig.inbox.receive('discord', message(1));
    await expect.poll(() => call.mock.calls.length).toBe(1);
    expect(call).toHaveBeenCalledWith(
      'discord',
      'reply',
      { eventId: 'e1', text: 'This access has ended; ask the owner for more time.' },
      expect.objectContaining({ role: 'member', pluginRequester: 'unlisted' }),
    );
    expect(rig.handed).toStrictEqual([]);
    expect(store.aiChats.bySource(guest.id, pluginChatKey('discord', 'channel'))).toBeUndefined();
    expect(store.accessAudit.list(10, guest.id).map((entry) => entry.kind)).toStrictEqual([
      'refused_expired',
    ]);
  });

  it('runs an approved person linked to a member in that member’s own chat, not the owner’s', async () => {
    const { store } = rig.opened;
    const sam = store.profiles.create({ name: 'Sam' });
    new PluginPeople(store).set('discord', '42', {
      name: 'Sam',
      status: 'approved',
      profile_id: sam.id,
    });
    rig.inbox.receive('discord', message(1));
    await expect.poll(() => rig.handed.length).toBe(1);
    expect(rig.handed).toStrictEqual([sam.id]);
    expect(rig.requesters).toStrictEqual(['approved']);
    expect(store.aiChats.bySource(sam.id, pluginChatKey('discord', 'channel'))).toBeDefined();
    expect(
      store.aiChats.bySource(store.personAccess.homeOwner(), pluginChatKey('discord', 'channel')),
    ).toBeUndefined();
  });

  it('keeps the owner of the plugin an owner in the home owner profile', async () => {
    const { store } = rig.opened;
    new PluginPeople(store).set('discord', '42', { name: 'Me', status: 'owner' });
    rig.inbox.receive('discord', message(1));
    await expect.poll(() => rig.handed.length).toBe(1);
    expect(rig.handed).toStrictEqual([store.personAccess.homeOwner()]);
    expect(rig.requesters).toStrictEqual(['owner']);
  });

  it('gives each person who speaks in one channel their own chat', async () => {
    const { store } = rig.opened;
    const sam = store.profiles.create({ name: 'Sam' });
    const people = new PluginPeople(store);
    people.set('discord', '42', { name: 'Sam', status: 'approved', profile_id: sam.id });
    people.set('discord', '43', { name: 'Me', status: 'owner' });
    rig.inbox.receive('discord', message(1));
    await expect.poll(() => rig.handed.length).toBe(1);
    rig.inbox.receive('discord', { ...message(2), from: { id: '43', name: 'Me', trusted: false } });
    await expect.poll(() => rig.handed.length).toBe(2);
    const chats = rig.handed.map((profileId) =>
      store.aiChats.bySource(profileId, pluginChatKey('discord', 'channel')),
    );
    expect(new Set(chats.map((chat) => chat?.id)).size).toBe(2);
  });
});
