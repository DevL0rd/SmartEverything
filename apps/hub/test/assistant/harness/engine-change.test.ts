import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { AiHarnessPermission, DshEngine } from '@smarteverything/domain';
import { admitUnboundEngineChange } from '../../../src/harness/engine-change-admission';
import { useRig, type Rig } from './support/rig';
import { addMessage } from './support/native-conversation';

let rig: Rig;
useRig((made) => {
  rig = made;
});

function selectOn(host: Rig['desk'], permission?: AiHarnessPermission): DshEngine {
  const chat = rig.newChat(rig.hub.target);
  if (chat.engine.kind !== 'dsh') throw new Error('The test chat must use the native engine.');
  const engine = {
    ...chat.engine,
    execution_target: host.target,
    ...(permission === undefined ? {} : { permission }),
  };
  return admitUnboundEngineChange(rig.service, rig.owner, chat, engine);
}

function working(chatId: string): void {
  const question = addMessage(rig, chatId, { role: 'person', text: 'work' });
  rig.opened.store.assistantEvents.add({
    id: randomUUID(),
    kind: 'chat',
    chat_id: chatId,
    message_id: question.id,
    profile_id: rig.owner.profileId,
    client_id: null,
    text: 'work',
  });
}

describe('selecting a computer for a chat that was never opened', () => {
  it('keeps the permission the person chose', () => {
    const engine = selectOn(rig.desk, { sandbox: 'workspace-write', approval: 'on-request' });

    expect(engine.permission).toStrictEqual({ sandbox: 'workspace-write', approval: 'on-request' });
  });

  it('still allows the choice while the chat has a reply in progress', () => {
    const chat = rig.newChat(rig.hub.target);
    working(chat.id);
    if (chat.engine.kind !== 'dsh') throw new Error('The test chat must use the native engine.');

    const engine = admitUnboundEngineChange(rig.service, rig.owner, chat, {
      ...chat.engine,
      execution_target: rig.desk.target,
    });

    expect(engine.execution_target).toStrictEqual(rig.desk.target);
  });

  it('refuses a computer that is offline', () => {
    rig.service.directory.offline(rig.desk.target);

    expect(() => selectOn(rig.desk)).toThrow(/unavailable/u);
  });
});
