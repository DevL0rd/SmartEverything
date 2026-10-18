import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type {
  AiChatRow,
  AiHarnessPermission,
  AiHarnessPermissionChange,
  HarnessRuntimeReceipt,
  HarnessRuntimeRequest,
} from '@smarteverything/domain';
import { acknowledge, useRig, type FakeHost, type Rig } from './support/rig';

const WORKSPACE: AiHarnessPermission = { sandbox: 'workspace-write', approval: 'on-request' };
const READ_ONLY: AiHarnessPermission = { sandbox: 'read-only', approval: 'on-request' };

let rig: Rig;
useRig((made) => {
  rig = made;
});

async function openOn(
  host: FakeHost,
): Promise<{ chat: AiChatRow; epoch: number; close: () => Promise<unknown> }> {
  const chat = rig.newChat(host.target);
  const open = rig.service.prepare(rig.owner, chat.id, rig.authority, rig.clientId);
  await rig.service.directory.execute(host.target, randomUUID(), open);
  return {
    chat: rig.opened.store.aiChats.chat(chat.id),
    epoch: open.claim.epoch,
    close: () =>
      rig.service.directory.execute(host.target, randomUUID(), {
        kind: 'close',
        session_id: open.claim.session_id,
        expected_epoch: open.claim.epoch,
      }),
  };
}

function change(epoch: number, permission: AiHarnessPermission): AiHarnessPermissionChange {
  return { operation_id: randomUUID(), expected_epoch: epoch, permission };
}

function confirmFromHost(
  chat: AiChatRow,
  epoch: number,
): (request: HarnessRuntimeRequest) => HarnessRuntimeReceipt {
  return (request) => {
    if (request.kind === 'permission') {
      const session = rig.service.state(rig.owner, chat.id);
      rig.service.publish({
        kind: 'state',
        session_id: session.session_id,
        chat_id: chat.id,
        epoch,
        seq: session.metadata.next_seq,
        session: { ...session, permission: request.permission },
        permission_operation_id: request.operation_id,
      });
    }
    return acknowledge(request);
  };
}

describe('changing the Access of a chat that is open on a machine', () => {
  it('records the new Access on the chat once the machine confirms it', async () => {
    const { chat, epoch } = await openOn(rig.desk);
    rig.desk.script = confirmFromHost(chat, epoch);

    const session = await rig.service.permission(rig.owner, chat.id, change(epoch, WORKSPACE));

    expect(session.permission).toStrictEqual(WORKSPACE);
    expect(session.permission_change ?? null).toBeNull();
    expect(rig.service.binding(rig.opened.store.aiChats.chat(chat.id)).permission).toStrictEqual(
      WORKSPACE,
    );
  });

  it('completes the change when the machine applied it but its confirmation never arrived', async () => {
    const { chat, epoch } = await openOn(rig.desk);

    const session = await rig.service.permission(rig.owner, chat.id, change(epoch, READ_ONLY));

    expect(session.permission).toStrictEqual(READ_ONLY);
    expect(session.permission_change ?? null).toBeNull();
    expect(rig.service.binding(rig.opened.store.aiChats.chat(chat.id)).permission).toStrictEqual(
      READ_ONLY,
    );
  });

  it('leaves no unconfirmed change behind that would block reopening the chat', async () => {
    const { chat, epoch } = await openOn(rig.desk);

    const session = await rig.service.permission(rig.owner, chat.id, change(epoch, READ_ONLY));

    expect(rig.opened.store.harnessCoordination.permissionChange(session.session_id)).toBeNull();
  });

  it('settles a change left pending by a restart when the chat is opened again', async () => {
    const { chat, epoch, close } = await openOn(rig.desk);
    const input = change(epoch, READ_ONLY);
    const session = rig.service.state(rig.owner, chat.id);
    rig.opened.store.harnessCoordination.begin(input.operation_id, session.session_id, {
      kind: 'permission',
      ...input,
    });
    await close();

    const open = rig.service.prepare(rig.owner, chat.id, rig.authority, rig.clientId);

    expect(open.permission).toStrictEqual(READ_ONLY);
    expect(rig.opened.store.harnessCoordination.permissionChange(session.session_id)).toBeNull();
    expect(rig.service.binding(rig.opened.store.aiChats.chat(chat.id)).permission).toStrictEqual(
      READ_ONLY,
    );
  });

  it('returns the settled chat when the same change is asked again', async () => {
    const { chat, epoch } = await openOn(rig.desk);
    const input = change(epoch, READ_ONLY);
    await rig.service.permission(rig.owner, chat.id, input);
    rig.desk.requests.length = 0;

    const again = await rig.service.permission(rig.owner, chat.id, input);

    expect(again.permission).toStrictEqual(READ_ONLY);
    expect(rig.desk.requests).toHaveLength(0);
  });

  it('refuses a member changing the Access of a computer', async () => {
    const { chat, epoch } = await openOn(rig.desk);

    await expect(
      rig.service.permission({ ...rig.owner, role: 'member' }, chat.id, change(epoch, READ_ONLY)),
    ).rejects.toThrow(/owner/u);
  });
});
