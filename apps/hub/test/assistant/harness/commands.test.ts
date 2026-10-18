import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { DSH_SESSION_ID } from '@smarteverything/domain';
import type {
  AiChatRow,
  AiHarnessCommandOutcome,
  DshSessionId,
  HarnessRuntimeReceipt,
  HarnessRuntimeRequest,
} from '@smarteverything/domain';
import { executeHarnessCommand, listHarnessCommands } from '../../../src/harness/commands';
import { acknowledge, useRig } from './support/rig';
import type { Rig } from './support/rig';

let rig: Rig;
useRig((made) => {
  rig = made;
});

const SETTLED: AiHarnessCommandOutcome = {
  status: 'settled',
  execution: { commandId: 'clear', result: { kind: 'success', text: 'Cleared.' } },
};

function advertiseCommands(
  execute: (request: HarnessRuntimeRequest) => Promise<HarnessRuntimeReceipt>,
): void {
  const connection = rig.service.directory.get(rig.desk.target);
  rig.service.directory.register({
    actor: connection.actor,
    host: {
      ...connection.host,
      manifest: connection.host.manifest && { ...connection.host.manifest, human_commands: true },
    },
    hasSession: () => true,
    execute: (_id, request) => execute(request),
  });
}

async function openedChat(): Promise<{ chat: AiChatRow; sessionId: DshSessionId; epoch: number }> {
  const chat = rig.newChat(rig.desk.target);
  const open = rig.service.prepare(rig.owner, chat.id, rig.authority, rig.clientId);
  await rig.service.directory.execute(rig.desk.target, randomUUID(), open);
  return { chat, sessionId: DSH_SESSION_ID.parse(open.claim.session_id), epoch: open.claim.epoch };
}

function context(chat: AiChatRow): { owner: Rig['owner']; chatId: string; clientId: string } {
  return { owner: rig.owner, chatId: chat.id, clientId: rig.clientId };
}

describe('slash commands on a native conversation', () => {
  it('shows the result the machine returned and keeps no receipt of the command', async () => {
    const { chat, sessionId, epoch } = await openedChat();
    advertiseCommands((request) =>
      Promise.resolve({ ...acknowledge(request), state: 'completed', command_outcome: SETTLED }),
    );
    const operation = randomUUID();

    const outcome = await executeHarnessCommand(rig.service, context(chat), {
      session_id: sessionId,
      expected_epoch: epoch,
      operation_id: operation,
      line: '/clear',
      attachments: [],
    });

    expect(outcome).toStrictEqual(SETTLED);
    expect(rig.opened.store.harnessCoordination.operation(operation)).toBeUndefined();
  });

  it('shows the error when the machine fails instead of recording an unknown outcome', async () => {
    const { chat, sessionId, epoch } = await openedChat();
    advertiseCommands(() => Promise.reject(new Error('The machine dropped the command.')));

    await expect(
      executeHarnessCommand(rig.service, context(chat), {
        session_id: sessionId,
        expected_epoch: epoch,
        operation_id: randomUUID(),
        line: '/clear',
        attachments: [],
      }),
    ).rejects.toThrow('The machine dropped the command.');
  });

  it('lists the commands the machine offers', async () => {
    const { chat, sessionId, epoch } = await openedChat();
    advertiseCommands((request) =>
      Promise.resolve({
        ...acknowledge(request),
        state: 'completed',
        commands: [{ name: 'clear', description: 'Clear the conversation.' }],
      }),
    );

    const catalogue = await listHarnessCommands(rig.service, context(chat), {
      session_id: sessionId,
      expected_epoch: epoch,
    });

    expect(catalogue.commands).toStrictEqual([
      { name: 'clear', description: 'Clear the conversation.' },
    ]);
  });

  it('refuses commands on a machine that does not offer them', async () => {
    const { chat, sessionId, epoch } = await openedChat();

    await expect(
      listHarnessCommands(rig.service, context(chat), {
        session_id: sessionId,
        expected_epoch: epoch,
      }),
    ).rejects.toThrow(/human commands/u);
  });
});
