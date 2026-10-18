import { randomUUID } from 'node:crypto';
import {
  API_ENDPOINTS,
  MCP_UNAVAILABLE_OPERATIONS,
  type EndpointName,
  type MessageOrigin,
} from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { executionRole, eventAuthority } from '../../../src/assistant/turn-authority';
import { isEndpointName } from '../../../src/extensions/mcp/tools/operation-shape';
import {
  callerFor,
  operate,
  type OperatingContext,
} from '../../../src/extensions/mcp/tools/acting';
import type { ConversationAuthority } from '../../../src/harness/authority-contract';
import type { Caller } from '../../../src/server/auth';
import { harnessRig, type Rig } from '../harness/support/rig';

let rig: Rig;
let member: string;

beforeEach(async () => {
  rig = await harnessRig();
  member = rig.opened.store.profiles.create({ name: 'Robin' }).id;
});

afterEach(async () => {
  await rig.close();
});

function ownerOnlyOperation(): EndpointName {
  const found = Object.keys(API_ENDPOINTS)
    .filter(isEndpointName)
    .find(
      (name) =>
        API_ENDPOINTS[name].access === 'owner' && MCP_UNAVAILABLE_OPERATIONS[name] === undefined,
    );
  if (found === undefined) throw new Error('There is no owner-only operation.');
  return found;
}

const OWNER_ONLY = ownerOnlyOperation();

function unattended(profileId: string, origin: MessageOrigin | null = null): ConversationAuthority {
  const { store } = rig.opened;
  const chat = rig.newChat({ kind: 'server' });
  const message =
    origin === null
      ? null
      : store.assistantChat.addMessage({
          profile_id: profileId,
          client_id: null,
          role: 'person',
          kind: 'text',
          author: 'Sam',
          text: 'hello',
          attachments: [],
          state: null,
          reason: null,
          steps: [],
          step_states: [],
          reply_to: null,
          chat_id: chat.id,
          origin,
          embeds: [],
          cost_micros: 0,
          model: null,
        });
  const event = store.assistantEvents.add({
    id: randomUUID(),
    kind: 'wake',
    chat_id: chat.id,
    message_id: message?.id ?? null,
    profile_id: profileId,
    client_id: null,
    text: 'run the step',
  });
  return eventAuthority(store, event);
}

function context(authority: ConversationAuthority, calls: Caller[]): OperatingContext {
  return {
    store: rig.opened.store,
    caller: null,
    actor: {
      authority,
      clientId: null,
      profileId: authority.profile_id,
      chatId: null,
    },
    operations: {
      run: (_name, caller): Promise<unknown> => {
        calls.push(caller);
        return Promise.resolve(null);
      },
    },
  };
}

describe('unattended work started for the owner', () => {
  it('runs with the owner role', () => {
    const authority = unattended(rig.owner.profileId);
    expect(authority).toMatchObject({ kind: 'service', role: 'owner', client_id: null });
    expect(executionRole(authority)).toBe('owner');
  });

  it('reaches owner-only operations as the owner', async () => {
    const calls: Caller[] = [];
    await operate(context(unattended(rig.owner.profileId), calls), OWNER_ONLY, {});
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ kind: 'client', client: { id: rig.clientId } });
  });

  it('can act for another person', () => {
    const acting = callerFor(context(unattended(rig.owner.profileId), []), { personId: member });
    expect(acting).toMatchObject({ kind: 'client', profileId: member });
  });
});

describe('unattended work started for a member', () => {
  it('stays a member and is refused owner-only operations', () => {
    const authority = unattended(member);
    expect(executionRole(authority)).toBe('member');
    expect(() => operate(context(authority, []), OWNER_ONLY, {})).toThrow(/Only an owner may use/);
  });

  it('cannot act for another person', () => {
    expect(() =>
      callerFor(context(unattended(member), []), { personId: rig.owner.profileId }),
    ).toThrow(/Only an owner/);
  });
});

describe('unattended work that came from a plugin conversation', () => {
  const FROM_PLUGIN: MessageOrigin = {
    source: 'plugin',
    plugin_id: 'discord',
    device_id: null,
    name: 'Sam',
    requester: 'owner',
  };

  it('runs as the owner when the person on the plugin is the owner', () => {
    const authority = unattended(rig.owner.profileId, FROM_PLUGIN);
    expect(executionRole(authority)).toBe('owner');
  });

  it('stays a member when the person on the plugin is only approved', () => {
    const authority = unattended(rig.owner.profileId, { ...FROM_PLUGIN, requester: 'approved' });
    expect(executionRole(authority)).toBe('member');
    expect(() => operate(context(authority, []), OWNER_ONLY, {})).toThrow(/Only an owner may use/);
  });

  it('stays a member when a plugin acts on its own', () => {
    const authority = unattended(rig.owner.profileId, {
      source: 'plugin',
      plugin_id: 'discord',
      device_id: null,
      name: 'Sam',
    });
    expect(executionRole(authority)).toBe('member');
  });

  it('is refused owner-only operations when an unlisted person talks through the owner phone', () => {
    const chat: OperatingContext = {
      ...context(unattended(rig.owner.profileId), []),
      actor: {
        clientId: rig.clientId,
        profileId: rig.owner.profileId,
        chatId: null,
        pluginId: 'discord',
        pluginRequester: 'unlisted',
      },
    };
    expect(() => operate(chat, OWNER_ONLY, {})).toThrow(/Only an owner may use/);
  });
});
