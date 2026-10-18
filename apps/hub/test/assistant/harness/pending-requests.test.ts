import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type {
  AiChatProvider,
  AiChatRow,
  AiHarnessInteraction,
  LiveChange,
} from '@smarteverything/domain';
import { useRig, type Rig } from './support/rig';

let rig: Rig;
let seq = 0;
useRig((made) => {
  rig = made;
  seq = 0;
});

function nextSeq(): number {
  seq += 1;
  return seq;
}

async function openChat(): Promise<{ chat: AiChatRow; epoch: number }> {
  const chat = rig.newChat(rig.hub.target);
  const open = rig.service.prepare(rig.owner, chat.id, rig.authority, rig.clientId);
  await rig.service.directory.execute(rig.hub.target, randomUUID(), open);
  return { chat: rig.opened.store.aiChats.chat(chat.id), epoch: open.claim.epoch };
}

function request(epoch: number, id: string): AiHarnessInteraction {
  return { id, epoch, kind: 'permission', request: { tool: 'bash' } };
}

function ask(chat: AiChatRow, epoch: number, interaction: AiHarnessInteraction): void {
  const session = rig.service.state(rig.owner, chat.id);
  rig.service.publish({
    kind: 'interaction',
    session_id: session.session_id,
    chat_id: chat.id,
    epoch,
    seq: nextSeq(),
    interaction,
  });
}

function answerAll(chat: AiChatRow, epoch: number): void {
  const session = rig.service.state(rig.owner, chat.id);
  rig.service.publish({
    kind: 'state',
    session_id: session.session_id,
    chat_id: chat.id,
    epoch,
    seq: nextSeq(),
    session: { ...session, state: 'working', interactions: [] },
  });
}

function pendingOf(chatId: string): number {
  return rig.opened.store.aiChats.chat(chatId).pending_requests;
}

describe('the number of requests a chat is waiting on the person for', () => {
  it('is 0 for a chat that has never asked for anything', async () => {
    const { chat } = await openChat();
    expect(chat.pending_requests).toBe(0);
    expect(rig.newChat(rig.hub.target).pending_requests).toBe(0);
  });

  it('rises as each request opens and falls to 0 when the answers clear them', async () => {
    const { chat, epoch } = await openChat();
    ask(chat, epoch, request(epoch, 'allow-1'));
    expect(pendingOf(chat.id)).toBe(1);
    ask(chat, epoch, request(epoch, 'allow-2'));
    ask(chat, epoch, request(epoch, 'allow-3'));
    expect(pendingOf(chat.id)).toBe(3);
    answerAll(chat, epoch);
    expect(pendingOf(chat.id)).toBe(0);
  });

  it('counts a request once when the runtime opens it again', async () => {
    const { chat, epoch } = await openChat();
    ask(chat, epoch, request(epoch, 'allow-1'));
    ask(chat, epoch, request(epoch, 'allow-1'));
    expect(pendingOf(chat.id)).toBe(1);
  });

  it('counts only the chat the request belongs to', async () => {
    const asking = await openChat();
    const quiet = await openChat();
    ask(asking.chat, asking.epoch, request(asking.epoch, 'allow-1'));
    expect(pendingOf(asking.chat.id)).toBe(1);
    expect(pendingOf(quiet.chat.id)).toBe(0);
  });

  it('is announced as a live update of the chat row only when the count changes', async () => {
    const { chat, epoch } = await openChat();
    const seen: LiveChange[] = [];
    rig.opened.store.feed.subscribe((change) => {
      if (change.table === 'ai_chats') seen.push(change);
    });
    ask(chat, epoch, request(epoch, 'allow-1'));
    const counts = (): number[] =>
      seen.flatMap((change) =>
        change.table === 'ai_chats' && change.record !== null
          ? [change.record.pending_requests]
          : [],
      );
    expect(counts()).toEqual([1]);
    expect(seen[0]?.operation).toBe('UPDATE');
    answerAll(chat, epoch);
    expect(counts()).toEqual([1, 0]);
    answerAll(chat, epoch);
    expect(counts()).toEqual([1, 0]);
  });

  it('falls to 0 with a live update when the session is reopened without its requests', async () => {
    const { chat, epoch } = await openChat();
    ask(chat, epoch, request(epoch, 'allow-1'));
    const seen: number[] = [];
    rig.opened.store.feed.subscribe((change) => {
      if (change.table === 'ai_chats' && change.record !== null)
        seen.push(change.record.pending_requests);
    });
    const session = rig.service.state(rig.owner, chat.id);
    rig.opened.store.harnessCoordination.project(
      { ...session, epoch: epoch + 1, state: 'idle', interactions: [] },
      0,
    );
    expect(pendingOf(chat.id)).toBe(0);
    expect(seen).toEqual([0]);
  });

  it('counts the open prompts of a native chat and announces each change', async () => {
    const { chat } = await openChat();
    const target = rig.desk.target;
    if (target.kind !== 'device') throw new Error('The desk is a device target.');
    const prompt = (
      id: string,
      status: 'pending' | 'answered',
    ): AiChatProvider['prompts'][number] => ({
      id,
      kind: 'permission',
      request: {},
      status,
    });
    const provider = (prompts: AiChatProvider['prompts']): AiChatProvider => ({
      device_id: target.device_id,
      session_id: null,
      job_id: null,
      state: 'working',
      reason: null,
      metadata: null,
      prompts,
      events: [],
    });
    const seen: number[] = [];
    rig.opened.store.feed.subscribe((change) => {
      if (change.table === 'ai_chats' && change.record !== null)
        seen.push(change.record.pending_requests);
    });
    const save = (prompts: AiChatProvider['prompts']): void => {
      rig.opened.store.aiProvider.save(chat.id, provider(prompts));
    };
    save([prompt('a', 'pending'), prompt('b', 'answered')]);
    expect(pendingOf(chat.id)).toBe(1);
    save([prompt('a', 'answered'), prompt('b', 'answered')]);
    expect(pendingOf(chat.id)).toBe(0);
    expect(seen).toEqual([1, 0]);
  });
});
