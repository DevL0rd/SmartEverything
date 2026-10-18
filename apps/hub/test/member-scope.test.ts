import { randomUUID } from 'node:crypto';
import {
  DEFAULT_ENGINE,
  type AiChatRow,
  type ClientRow,
  type EndpointName,
} from '@smarteverything/domain';
import type { OperationInput } from '../src/server/operations';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { callerFor, type ActingContext } from '../src/extensions/mcp/tools/acting';
import {
  ownedAttachment,
  ownedChat,
  reachesChat,
  type ChatOwner,
} from '../src/assistant/chat-directory';
import { admitConfined } from '../src/server/confinement';
import { chatOwnerOf, clientOf, confinedChatOf, roleOfCaller } from '../src/server/auth';
import { captureLogs } from './support/logs';
import { testStore, type TestStore } from './support/store';

let opened: TestStore;
let owner: ClientRow;
let ownerProfile: string;
let memberProfile: string;
let ownerChat: AiChatRow;
let sibling: AiChatRow;
let memberChat: AiChatRow;
let ownerFile: string;
let memberFile: string;
let siblingFile: string;

function chat(profileId: string, parentId: string | null = null): AiChatRow {
  return opened.store.aiChats.create({
    profileId,
    kind: parentId === null ? 'chat' : 'subagent',
    title: 'Chat',
    icon: null,
    parentId,
    sourceKey: null,
    engine: DEFAULT_ENGINE,
    titleAuto: false,
  });
}

function fileIn(chatRow: AiChatRow): string {
  const id = randomUUID();
  opened.store.assistantChat.addAttachment({
    id,
    profile_id: chatRow.profile_id,
    name: 'a.txt',
    mime: 'text/plain',
    bytes: 1,
    width: null,
    height: null,
    storage_path: 'a.txt',
    sha256: 'a'.repeat(64),
  });
  const message = opened.store.assistantChat.addMessage({
    profile_id: chatRow.profile_id,
    client_id: null,
    role: 'person',
    kind: 'text',
    author: 'Sam',
    text: '',
    attachments: [],
    state: null,
    reason: null,
    steps: [],
    step_states: [],
    reply_to: null,
    chat_id: chatRow.id,
    origin: null,
    embeds: [],
    cost_micros: 0,
    model: null,
  });
  opened.store.assistantChat.attachTo(message.id, [id]);
  return id;
}

beforeEach(async () => {
  captureLogs();
  opened = await testStore();
  const { store } = opened;
  owner = store.clients.create(
    { name: 'Owner', platform: 'desktop', role: 'owner', tokenHash: 'a'.repeat(64) },
    true,
  );
  ownerProfile = store.profiles.activeOf(owner.id).id;
  memberProfile = store.profiles.create({ name: 'Robin' }).id;
  ownerChat = chat(ownerProfile);
  sibling = chat(ownerProfile);
  memberChat = chat(memberProfile);
  ownerFile = fileIn(ownerChat);
  siblingFile = fileIn(sibling);
  memberFile = fileIn(memberChat);
});

afterEach(async () => {
  await opened.close();
});

const asOwner = (): ChatOwner => ({ profileId: ownerProfile, role: 'owner' });
const asMember = (): ChatOwner => ({ profileId: memberProfile, role: 'member' });

describe('a member reaches only their own chats and files', () => {
  it('cannot open another person’s chat or attachment', () => {
    expect(() => ownedChat(opened.store, asMember(), ownerChat.id)).toThrow(/someone else/);
    expect(() => ownedAttachment(opened.store, asMember(), ownerFile)).toThrow(/someone else/);
  });

  it('can open their own chat and attachment', () => {
    expect(ownedChat(opened.store, asMember(), memberChat.id).id).toBe(memberChat.id);
    expect(ownedAttachment(opened.store, asMember(), memberFile).id).toBe(memberFile);
  });

  it('leaves the owner’s own chats and files open', () => {
    expect(ownedChat(opened.store, asOwner(), ownerChat.id).id).toBe(ownerChat.id);
    expect(ownedAttachment(opened.store, asOwner(), ownerFile).id).toBe(ownerFile);
  });
});

describe('a plugin person who is not approved reaches only their conversation', () => {
  const confined = (): ChatOwner => ({
    ...asMember(),
    profileId: ownerProfile,
    confinedTo: ownerChat.id,
  });

  it('reaches their chat, its helper chats and their files', () => {
    const helper = chat(ownerProfile, ownerChat.id);
    expect(ownedChat(opened.store, confined(), ownerChat.id).id).toBe(ownerChat.id);
    expect(ownedChat(opened.store, confined(), helper.id).id).toBe(helper.id);
    expect(ownedAttachment(opened.store, confined(), ownerFile).id).toBe(ownerFile);
  });

  it('cannot reach another chat of the same home or its files', () => {
    expect(reachesChat(opened.store, ownerChat.id, sibling)).toBe(false);
    expect(() => ownedChat(opened.store, confined(), sibling.id)).toThrow(/someone else/);
    expect(() => ownedAttachment(opened.store, confined(), siblingFile)).toThrow(/someone else/);
  });

  it('reaches nothing when the request has no chat', () => {
    expect(reachesChat(opened.store, null, ownerChat)).toBe(false);
  });
});

describe('the acting person of an AI tool call', () => {
  function context(actor: ActingContext['actor']): ActingContext {
    return { store: opened.store, caller: null, actor };
  }

  it('is a member even when no app is named and the owner app would be the fallback', () => {
    const caller = callerFor(
      context({ clientId: null, profileId: memberProfile, role: 'member', chatId: null }),
    );
    expect(roleOfCaller(caller)).toBe('member');
    expect(clientOf(caller).role).toBe('member');
  });

  it('stays the owner for an owner call', () => {
    const caller = callerFor(
      context({ clientId: null, profileId: ownerProfile, role: 'owner', chatId: null }),
    );
    expect(clientOf(caller).role).toBe('owner');
  });

  it('is confined to its conversation for an unlisted plugin person', () => {
    const caller = callerFor(
      context({
        clientId: owner.id,
        profileId: ownerProfile,
        role: 'member',
        chatId: ownerChat.id,
        pluginId: 'discord',
        pluginRequester: 'unlisted',
      }),
    );
    expect(clientOf(caller).role).toBe('member');
    expect(confinedChatOf(caller)).toBe(ownerChat.id);
    expect(chatOwnerOf(opened.store, caller).confinedTo).toBe(ownerChat.id);
    const admit = (name: EndpointName, input: OperationInput): void => {
      admitConfined(opened.store, name, caller, input);
    };
    expect(() => {
      admit('readAiProjectFiles', { params: { chatId: sibling.id } });
    }).toThrow(/someone else/);
    expect(() => {
      admit('readAiProjectFiles', { params: { chatId: ownerChat.id } });
    }).not.toThrow();
    expect(() => {
      admit('listSchedules', {});
    }).toThrow(/owner/);
    for (const name of [
      'createSchedule',
      'cancelSchedule',
      'removeSchedule',
      'readUsageTotals',
      'listUsageLedger',
    ] as const) {
      expect(() => {
        admit(name, {});
      }).toThrow(/owner/);
    }
  });

  it('is a member but not confined to one chat for an approved plugin person', () => {
    const caller = callerFor(
      context({
        clientId: owner.id,
        profileId: ownerProfile,
        role: 'owner',
        chatId: ownerChat.id,
        pluginId: 'discord',
        pluginRequester: 'approved',
      }),
    );
    expect(confinedChatOf(caller)).toBeUndefined();
    expect(roleOfCaller(caller)).toBe('member');
  });
});
