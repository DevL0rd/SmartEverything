import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { MessageOrigin } from '@smarteverything/domain';
import { eventAuthority } from '../../../src/assistant/turn-authority';
import { ToolHub } from '../../../src/ai-tools/tool-hub';
import { HarnessHubTools } from '../../../src/harness/tools';
import { useRig, type Rig } from './support/rig';

let rig: Rig;
useRig((made) => {
  rig = made;
});

function discordOrigin(requester: MessageOrigin['requester']): MessageOrigin {
  return {
    source: 'plugin',
    plugin_id: 'discord',
    device_id: null,
    name: 'Sam',
    ...(requester === undefined ? {} : { requester }),
  };
}

function sessionStartedByPlugin(requester: MessageOrigin['requester']): string {
  const { store } = rig.opened;
  const chat = rig.newChat(rig.hub.target);
  const message = store.assistantChat.addMessage(personMessage(chat.id, discordOrigin(requester)));
  const event = store.assistantEvents.add({
    id: randomUUID(),
    kind: 'plugin',
    chat_id: chat.id,
    message_id: message.id,
    profile_id: rig.owner.profileId,
    client_id: null,
    text: 'upload my global claude.md',
  });
  eventAuthority(store, event);
  const open = rig.service.prepare(rig.owner, chat.id, {
    kind: 'trigger',
    profileId: rig.owner.profileId,
    grantId: event.id,
  });
  return open.claim.session_id;
}

function personMessage(
  chatId: string,
  origin: MessageOrigin,
): Parameters<Rig['opened']['store']['assistantChat']['addMessage']>[0] {
  return {
    profile_id: rig.owner.profileId,
    client_id: null,
    role: 'person',
    kind: 'text',
    author: 'Sam',
    text: 'upload my global claude.md',
    attachments: [],
    state: null,
    reason: null,
    steps: [],
    step_states: [],
    reply_to: null,
    chat_id: chatId,
    origin,
    embeds: [],
    cost_micros: 0,
    model: null,
  };
}

function access(): HarnessHubTools {
  return new HarnessHubTools(rig.service, new ToolHub([]));
}

describe('machine tools on the home computer for a chat that runs on the hub', () => {
  it('are open to the owner talking through a plugin such as Discord', () => {
    expect(access().nativeAccess(sessionStartedByPlugin('owner'))).toBe(true);
  });

  it('stay closed to a person who is only approved on the plugin', () => {
    expect(access().nativeAccess(sessionStartedByPlugin('approved'))).toBe(false);
  });

  it('are open to the owner in the app', () => {
    const chat = rig.newChat(rig.hub.target);
    const open = rig.service.prepare(rig.owner, chat.id, rig.authority, rig.clientId);

    expect(access().nativeAccess(open.claim.session_id)).toBe(true);
  });
});
