import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { harnessTargetKey } from '@smarteverything/domain';
import type { AiChatRow } from '@smarteverything/domain';
import { listMachines, switchMachine } from '../../../src/harness/machines';
import { useRig, type Rig } from './support/rig';
import { addMessage } from './support/native-conversation';

let rig: Rig;
useRig((made) => {
  rig = made;
});

async function openChat(): Promise<AiChatRow> {
  const chat = rig.newChat(rig.hub.target);
  const open = rig.service.prepare(rig.owner, chat.id, rig.authority, rig.clientId);
  await rig.service.directory.execute(rig.hub.target, randomUUID(), open);
  return rig.opened.store.aiChats.chat(chat.id);
}

function startTurn(chat: AiChatRow): void {
  const { store } = rig.opened;
  const sessionId = rig.service.binding(chat).session_id;
  if (sessionId === null) throw new Error('The chat must be opened first.');
  const question = addMessage(rig, chat.id, { role: 'person', text: 'work' });
  const answer = addMessage(rig, chat.id, { role: 'responder', text: '' });
  const event = store.assistantEvents.add({
    id: randomUUID(),
    kind: 'chat',
    chat_id: chat.id,
    message_id: question.id,
    profile_id: rig.owner.profileId,
    client_id: null,
    text: 'work',
  });
  store.harnessDeliveries.admit(event.id, sessionId, () => answer.id);
}

describe('machine_read', () => {
  it('names every machine with its system, whether it is online and which one the chat is on', async () => {
    const chat = await openChat();

    const { machines } = listMachines(rig.service, rig.owner, chat.id);

    expect(machines).toStrictEqual([
      { id: 'hub', name: 'Hub', os: 'Linux', online: true, current: true },
      {
        id: harnessTargetKey(rig.desk.target).replace('device:', ''),
        name: 'Desk',
        os: 'Linux',
        online: true,
        current: false,
      },
    ]);
  });

  it('shows a member only the home’s own machine', async () => {
    const chat = await openChat();

    const { machines } = listMachines(rig.service, { ...rig.owner, role: 'member' }, chat.id);

    expect(machines.map((machine) => machine.name)).toStrictEqual(['Hub']);
  });
});

describe('machine_switch', () => {
  it('moves an idle chat by machine name, whatever the letter case', async () => {
    const chat = await openChat();

    const result = await switchMachine(rig.service, rig.owner, chat.id, 'dEsK');

    expect(result).toStrictEqual({ state: 'applied', machine: 'Desk' });
    expect(harnessTargetKey(rig.service.state(rig.owner, chat.id).target)).toBe(
      harnessTargetKey(rig.desk.target),
    );
  });

  it('accepts the machine id from machine_read', async () => {
    const chat = await openChat();
    const { machines } = listMachines(rig.service, rig.owner, chat.id);
    const desk = machines.find((machine) => machine.name === 'Desk');

    const result = await switchMachine(rig.service, rig.owner, chat.id, desk?.id ?? '');

    expect(result.machine).toBe('Desk');
  });

  it('waits for the AI’s next tool call when the AI is working, which is when a tool asks', async () => {
    const chat = await openChat();
    startTurn(chat);

    const result = await switchMachine(rig.service, rig.owner, chat.id, 'Desk');

    expect(result).toStrictEqual({ state: 'pending', machine: 'Desk' });
    expect(rig.opened.store.aiChats.chat(chat.id).pending_execution_target).toStrictEqual(
      rig.desk.target,
    );
  });

  it('names the machines there are when the name matches none', async () => {
    const chat = await openChat();

    await expect(switchMachine(rig.service, rig.owner, chat.id, 'Attic')).rejects.toThrow(
      /No machine is called "Attic"\. Machines: Hub \(Linux\), Desk \(Linux\)\./u,
    );
  });
});
