import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { AiChatRow } from '@smarteverything/domain';
import { nativeReferenceSession } from '../../../src/harness/reference-authority';
import type { ConversationAuthority } from '../../../src/harness/authority-contract';
import type { ReferenceContext } from '../../../src/references/contracts';
import { acknowledge, useRig, type Rig } from './support/rig';

let rig: Rig;
useRig((made) => {
  rig = made;
});

function supportReferences(): void {
  const connection = rig.service.directory.get(rig.desk.target);
  const manifest = connection.host.manifest;
  if (manifest === null) throw new Error('The test host has no manifest.');
  rig.service.directory.register({
    actor: connection.actor,
    host: { ...connection.host, manifest: { ...manifest, references: { protocol: 1 } } },
    hasSession: () => true,
    execute: (_id, request) => Promise.resolve(acknowledge(request)),
  });
}

async function opened(references = true): Promise<AiChatRow> {
  if (references) supportReferences();
  const chat = rig.newChat(rig.desk.target);
  const open = rig.service.prepare(rig.owner, chat.id, rig.authority, rig.clientId);
  await rig.service.directory.execute(rig.desk.target, randomUUID(), open);
  return rig.opened.store.aiChats.chat(chat.id);
}

function contextOf(chat: AiChatRow): ReferenceContext {
  const authority: ConversationAuthority = {
    event_id: randomUUID(),
    profile_id: rig.owner.profileId,
    client_id: null,
    kind: 'service',
    role: 'owner',
    hub_os_ban: false,
    tools: null,
    plugin_id: null,
    requester: null,
  };
  return {
    caller: { kind: 'service', authority, profileId: rig.owner.profileId, chatId: chat.id },
    chat,
    authority: { chatId: chat.id, profileId: rig.owner.profileId, validate: () => undefined },
    validate: () => undefined,
  };
}

function sessionIdOf(chat: AiChatRow): string {
  const id = rig.service.binding(chat).session_id;
  if (id === null) throw new Error('The chat must be opened first.');
  return id;
}

describe('structured references on a native chat', () => {
  it('find the session of the chat', async () => {
    const chat = await opened();

    const session = nativeReferenceSession(rig.service, contextOf(chat));

    expect(session.session_id).toBe(sessionIdOf(chat));
  });

  it('tell a person with an older machine to update it', async () => {
    const chat = await opened(false);

    expect(() => nativeReferenceSession(rig.service, contextOf(chat))).toThrow(
      "This machine's SmartEverything is too old for file references; update it.",
    );
  });

  it('tell a person to start the chat before using references', () => {
    const chat = rig.newChat(rig.desk.target);

    expect(() => nativeReferenceSession(rig.service, contextOf(chat))).toThrow(
      'Send a message in this chat first.',
    );
  });
});
