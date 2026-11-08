import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  DSH_SESSION_EVENTS_WRITE,
  type AssistantMessageRow,
  type DshSessionEvent,
} from '@smarteverything/domain';
import { ConversationLog } from '../../../src/assistant/conversation-log';
import { reconcileNativeReplies } from '../../../src/assistant/engines/dsh/projector-replay';
import { projectorOf } from './support/projector';
import { useRig, type Rig } from './support/rig';
import { addMessage } from './support/native-conversation';

let rig: Rig;
useRig((made) => {
  rig = made;
});

function text(
  role: string,
  source: Record<string, string>,
  value: string,
): Record<string, DshSessionEvent['data']> {
  return { id: randomUUID(), role, source, content: [{ type: 'text', text: value }] };
}

function logOf(delivery: string, answered: string | null, received: boolean): DshSessionEvent[] {
  const events: DshSessionEvent[] = [
    {
      type: 'system/message',
      seq: 0,
      time: 1,
      surfaceOp: 'append',
      data: { turn: 0, step: 0, message: text('system', { kind: 'system-prompt' }, '') },
    },
    { type: 'turn/start', seq: 1, time: 2, data: { turn: 1 } },
    { type: 'step/start', seq: 2, time: 3, data: { turn: 1, step: 0 } },
  ];
  if (received)
    events.push({
      type: 'user/message',
      seq: 3,
      time: 4,
      surfaceOp: 'append',
      data: { ...text('user', { kind: 'user' }, 'work'), id: delivery },
    });
  if (answered !== null)
    events.push({
      type: 'assistant/message',
      seq: 4,
      time: 5,
      surfaceOp: 'append',
      data: {
        turn: 1,
        step: 0,
        stream: [],
        message: text(
          'assistant',
          { kind: 'model', provider: 'scripted', model: 'model-a' },
          answered,
        ),
      },
    });
  return events;
}

interface Killed {
  readonly reply: AssistantMessageRow;
  readonly delivery: string;
  readonly question: AssistantMessageRow;
  readonly finished: boolean[];
  readonly recover: () => void;
  readonly store: Rig['opened']['store'];
}

function killedMidReply(answered: string | null, persisted: string, received = true): Killed {
  const { store } = rig.opened;
  const chat = rig.newChat(rig.hub.target);
  const open = rig.service.prepare(rig.owner, chat.id, rig.authority, rig.clientId);
  const question = addMessage(rig, chat.id, { role: 'person', text: 'work' });
  const reply = addMessage(rig, chat.id, { role: 'responder', text: '' });
  store.assistantChat.updateMessage(reply.id, { model: 'model-a', state: 'working' });
  const delivery = randomUUID();
  store.assistantEvents.add({
    id: delivery,
    kind: 'chat',
    chat_id: chat.id,
    message_id: question.id,
    profile_id: rig.owner.profileId,
    client_id: null,
    text: 'work',
  });
  store.harnessDeliveries.admit(delivery, open.claim.session_id, () => reply.id);
  const base = store.dshSessions.stat(open.claim.session_id, rig.owner.profileId)?.next_seq ?? 0;
  const principal = rig.service.hostPrincipal(
    rig.owner.profileId,
    rig.service.directory.get(rig.hub.target).host,
  );
  store.dshSessions.append(
    {
      claim: open.claim,
      operation_id: randomUUID(),
      events: DSH_SESSION_EVENTS_WRITE.parse(
        logOf(delivery, answered, received).map((event) => ({ ...event, seq: event.seq + base })),
      ),
    },
    principal,
  );
  const conversation = new ConversationLog(store);
  conversation.progress(reply.id, persisted, { kind: 'chat_timeline', version: 1, parts: [] });
  const finished: boolean[] = [];
  const recover = (): void => {
    reconcileNativeReplies(
      projectorOf(rig, (_event, _text, ok): void => {
        finished.push(ok);
      }),
    );
  };
  return { reply, delivery, question, finished, recover, store };
}

describe('a reply cut off when the hub stopped mid-stream', () => {
  it('keeps the text saved at the last boundary when the native log has no answer yet', () => {
    const killed = killedMidReply(null, 'Looking around.');

    killed.recover();

    const row = killed.store.assistantChat.message(killed.reply.id);
    expect(row.text).toBe('Looking around.');
    expect(row.state).toBe('failed');
    expect(row.reason_code).toBe('interrupted');
    expect(killed.finished).toStrictEqual([false]);
  });

  it('takes the finished steps from the native log when it has them', () => {
    const killed = killedMidReply('Step one is done.', 'Step one');

    killed.recover();

    expect(killed.store.assistantChat.message(killed.reply.id).text).toBe('Step one is done.');
  });

  it('settles the delivery once, so a second start does not repeat the reply', () => {
    const killed = killedMidReply('Step one is done.', 'Step one');

    killed.recover();
    killed.recover();

    expect(killed.finished).toStrictEqual([false]);
    expect(killed.store.harnessDeliveries.find(killed.delivery)?.state).toBe('unknown');
  });
});

describe('a message the hub admitted but never got to the host before it stopped', () => {
  it('goes back to the queue to be delivered after the restart instead of failing', () => {
    const killed = killedMidReply(null, '', false);
    killed.store.assistantChat.updateMessage(killed.question.id, {
      state: 'failed',
      reason: 'The hub restarted.',
      reason_code: 'interrupted',
    });
    killed.store.assistantEvents.mark(killed.delivery, 'delivered_at');
    killed.store.assistantEvents.mark(killed.delivery, 'answered_at');

    killed.recover();

    expect(killed.store.harnessDeliveries.find(killed.delivery)).toBeUndefined();
    expect(killed.store.assistantEvents.pending().map((event) => event.id)).toContain(
      killed.delivery,
    );
    expect(killed.store.assistantChat.message(killed.question.id)).toMatchObject({
      state: 'queued',
      reason: null,
      reason_code: null,
    });
    expect(killed.store.assistantChat.find(killed.reply.id)).toBeUndefined();
    expect(killed.finished).toStrictEqual([]);
  });
});
