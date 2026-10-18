import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { AiChatRow, HarnessRuntimeRequest } from '@smarteverything/domain';
import { ensureAttached, readSession, sessionAttached } from '../../../src/harness/attach';
import { acknowledge, useRig } from './support/rig';
import type { Rig } from './support/rig';

let rig: Rig;
useRig((made) => {
  rig = made;
});

function context(chat: AiChatRow): { owner: Rig['owner']; chatId: string; clientId: string } {
  return { owner: rig.owner, chatId: chat.id, clientId: rig.clientId };
}

async function openOnDesk(): Promise<{ chat: AiChatRow; epoch: number }> {
  const chat = rig.newChat(rig.desk.target);
  const open = rig.service.prepare(rig.owner, chat.id, rig.authority, rig.clientId);
  await rig.service.directory.execute(rig.desk.target, randomUUID(), open);
  return { chat: rig.opened.store.aiChats.chat(chat.id), epoch: open.claim.epoch };
}

function restartDesk(holdsSession: boolean): HarnessRuntimeRequest[] {
  const requests: HarnessRuntimeRequest[] = [];
  const connection = rig.service.directory.get(rig.desk.target);
  rig.service.directory.register({
    actor: connection.actor,
    host: {
      ...connection.host,
      runtime_instance: randomUUID(),
      connection_generation: randomUUID(),
    },
    hasSession: () => holdsSession,
    execute: (_id, request) => {
      requests.push(request);
      return Promise.resolve(acknowledge(request));
    },
  });
  return requests;
}

function attachedNow(chat: AiChatRow): boolean {
  return sessionAttached(rig.service, rig.service.binding(chat).session_id, rig.owner.profileId);
}

describe('a chat attached to a machine', () => {
  it('stays attached while that machine still holds the session', async () => {
    const { chat } = await openOnDesk();

    expect(attachedNow(chat)).toBe(true);
  });

  it('is no longer attached when the machine came back as a new runtime without the session', async () => {
    const { chat } = await openOnDesk();
    restartDesk(false);

    expect(attachedNow(chat)).toBe(false);
  });

  it('is no longer attached once the machine goes offline', async () => {
    const { chat } = await openOnDesk();
    rig.service.directory.offline(rig.desk.target);

    expect(attachedNow(chat)).toBe(false);
  });

  it('is not attached to a restarted runtime that holds a session of that id until it is opened again', async () => {
    const { chat } = await openOnDesk();
    restartDesk(true);

    expect(attachedNow(chat)).toBe(false);
  });

  it('is attached again at the next epoch after the computer restarted, without waiting for anything', async () => {
    const { chat, epoch } = await openOnDesk();
    const requests = restartDesk(false);

    const session = await ensureAttached(rig.service, context(chat), epoch);

    expect(session.epoch).toBe(epoch + 1);
    expect(requests.filter((request) => request.kind === 'open')).toHaveLength(1);
  });

  it('is not opened again when it is still attached', async () => {
    const { chat, epoch } = await openOnDesk();
    rig.calls.length = 0;

    const session = await ensureAttached(rig.service, context(chat), epoch);

    expect(session.epoch).toBe(epoch);
    expect(rig.calls).toStrictEqual([]);
  });

  it('refuses an action that names a stale epoch', async () => {
    const { chat, epoch } = await openOnDesk();

    await expect(ensureAttached(rig.service, context(chat), epoch + 1)).rejects.toThrow(
      /current stable session epoch/u,
    );
  });
});

describe('opening a chat in the app', () => {
  it('attaches a chat that was never opened instead of answering a conflict', async () => {
    const chat = rig.newChat(rig.desk.target);
    rig.calls.length = 0;

    const session = await readSession(rig.service, context(chat));

    expect(session.state).toBe('idle');
    expect(rig.calls).toStrictEqual(['desk:open']);
  });

  it('reads the stored state without opening anything when the machine is offline', async () => {
    const { chat } = await openOnDesk();
    rig.service.directory.offline(rig.desk.target);
    rig.calls.length = 0;

    const session = await readSession(rig.service, context(chat));

    expect(session.chat_id).toBe(chat.id);
    expect(rig.calls).toStrictEqual([]);
  });

  it('leaves a chat that is mid-change alone', async () => {
    const { chat } = await openOnDesk();
    const session = rig.service.state(rig.owner, chat.id);
    rig.opened.store.harnessCoordination.markSwitching(session.session_id);
    restartDesk(false);
    rig.calls.length = 0;

    const read = await readSession(rig.service, context(chat));

    expect(read.state).toBe('switching');
    expect(rig.calls).toStrictEqual([]);
  });
});
