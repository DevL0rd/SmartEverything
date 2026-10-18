import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AI_HARNESS_EVENT,
  CHAT_TIMELINE_EMBED,
  type AiChatRow,
  type LiveChange,
} from '@smarteverything/domain';
import { ConversationLog } from '../../../src/assistant/conversation-log';
import { NativeDeliveryStreams } from '../../../src/assistant/engines/dsh/delivery-streams';
import { useRig, type Rig } from './support/rig';
import { addMessage } from './support/native-conversation';

let rig: Rig;
useRig((made) => {
  rig = made;
});
afterEach(() => {
  vi.restoreAllMocks();
});

type Tail = Record<string, unknown>;

interface Streaming {
  readonly chat: AiChatRow;
  readonly replyId: string;
  readonly publish: (rest: Tail) => void;
  readonly row: () => ReturnType<Rig['opened']['store']['assistantChat']['message']>;
}

async function streaming(): Promise<Streaming> {
  const { store } = rig.opened;
  const chat = rig.newChat(rig.hub.target);
  const open = rig.service.prepare(rig.owner, chat.id, rig.authority, rig.clientId);
  await rig.service.directory.execute(rig.hub.target, randomUUID(), open);
  const current = store.aiChats.chat(chat.id);
  const streams = new NativeDeliveryStreams(
    {
      service: rig.service,
      conversation: new ConversationLog(store),
      emit: (): void => undefined,
      finished: (): void => undefined,
    },
    (): void => undefined,
    (): void => undefined,
  );
  rig.service.onEvent(streams.received);
  const question = addMessage(rig, chat.id, { role: 'person', text: 'work' });
  const reply = addMessage(rig, chat.id, { role: 'responder', text: '' });
  const event = store.assistantEvents.add({
    id: randomUUID(),
    kind: 'chat',
    chat_id: chat.id,
    message_id: question.id,
    profile_id: rig.owner.profileId,
    client_id: null,
    text: 'work',
  });
  store.harnessDeliveries.admit(event.id, open.claim.session_id, () => reply.id);
  void streams.start(event, current, reply.id);
  const base = {
    session_id: open.claim.session_id,
    chat_id: chat.id,
    epoch: open.claim.epoch,
    delivery_id: event.id,
    native_turn: 1,
  };
  let seq = 0;
  const publish = (rest: Tail): void => {
    const next = AI_HARNESS_EVENT.parse({ ...base, seq, ...rest });
    seq += 1;
    rig.service.publish(next);
  };
  publish({ kind: 'state', session: rig.service.state(rig.owner, chat.id) });
  return {
    chat: current,
    replyId: reply.id,
    publish,
    row: () => store.assistantChat.message(reply.id),
  };
}

function tool(callId: string, state: 'running' | 'completed'): Tail {
  return {
    kind: 'tool',
    call_id: callId,
    name: 'bash',
    state,
    target: rig.hub.target,
    detail: null,
    input: JSON.stringify({ command: 'ls' }),
    output: state === 'completed' ? 'listing' : undefined,
  };
}

function timelineTexts(embeds: readonly unknown[]): string[] {
  return embeds.flatMap((embed) => {
    const timeline = CHAT_TIMELINE_EMBED.safeParse(embed);
    return timeline.success
      ? timeline.data.parts.flatMap((part) => (part.kind === 'text' ? [part.text] : []))
      : [];
  });
}

describe('a streamed native reply', () => {
  it('costs no database write per text chunk and no live row update', async () => {
    const turn = await streaming();
    turn.publish({ kind: 'text', delta: 'first ' });
    const exec = vi.spyOn(DatabaseSync.prototype, 'exec');
    const changes: LiveChange[] = [];
    rig.opened.store.feed.subscribe((change) => changes.push(change));

    for (let index = 0; index < 400; index += 1)
      turn.publish({ kind: 'text', delta: 'word '.repeat(10) });

    for (let index = 0; index < 100; index += 1) turn.publish({ kind: 'reasoning', delta: 'hmm ' });

    expect(exec.mock.calls.filter(([sql]) => sql === 'commit')).toStrictEqual([]);
    expect(changes).toStrictEqual([]);
    expect(turn.row().text).toBe('');
  });

  it('saves the text so far when a tool call starts and finishes', async () => {
    const turn = await streaming();
    turn.publish({ kind: 'text', delta: 'Looking. ' });
    expect(turn.row().text).toBe('');

    turn.publish(tool('call-1', 'running'));
    expect(turn.row().text).toBe('Looking.');
    expect(timelineTexts(turn.row().embeds)).toStrictEqual(['Looking. ']);

    turn.publish({ kind: 'text', delta: 'Found it. ' });
    expect(turn.row().text).toBe('Looking.');

    turn.publish(tool('call-1', 'completed'));
    expect(turn.row().text).toBe('Looking. Found it.');
    expect(timelineTexts(turn.row().embeds)).toStrictEqual(['Looking. ', 'Found it. ']);
  });

  it('saves the whole reply and answers when the turn completes', async () => {
    const turn = await streaming();
    turn.publish({ kind: 'text', delta: 'Done ' });
    turn.publish({ kind: 'text', delta: 'now.' });
    turn.publish({ kind: 'completed', durable_seq: 3, interrupted: false });

    expect(turn.row().text).toBe('Done now.');
    expect(turn.row().state).toBe('answered');
    expect(timelineTexts(turn.row().embeds)).toStrictEqual(['Done now.']);
  });

  it('commits the same few times whether a reply has 10 or 600 text chunks', async () => {
    async function commitsFor(chunks: number): Promise<number> {
      const turn = await streaming();
      const exec = vi.spyOn(DatabaseSync.prototype, 'exec');
      for (let index = 0; index < chunks; index += 1) turn.publish({ kind: 'text', delta: 'w ' });
      turn.publish(tool('call-1', 'running'));
      turn.publish(tool('call-1', 'completed'));
      for (let index = 0; index < chunks; index += 1) turn.publish({ kind: 'text', delta: 'm ' });
      turn.publish({ kind: 'completed', durable_seq: 3, interrupted: false });
      const commits = exec.mock.calls.filter(([sql]) => sql === 'commit').length;
      exec.mockRestore();
      return commits;
    }

    const short = await commitsFor(10);
    expect(short).toBeLessThanOrEqual(10);
    expect(await commitsFor(600)).toBe(short);
  });

  it('keeps a reply longer than the old 16 000 character limit whole', async () => {
    const turn = await streaming();
    for (let chunk = 0; chunk < 15; chunk += 1)
      turn.publish({ kind: 'text', delta: 'x'.repeat(10_000) });
    turn.publish({ kind: 'completed', durable_seq: 3, interrupted: false });

    expect(turn.row().text).toBe('x'.repeat(150_000));
  });
});
