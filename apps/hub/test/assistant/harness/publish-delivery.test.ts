import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { AI_HARNESS_EVENT, type AiChatRow, type AiHarnessEvent } from '@smarteverything/domain';
import { useRig, type Rig } from './support/rig';

let rig: Rig;
useRig((made) => {
  rig = made;
});

interface Open {
  readonly chat: AiChatRow;
  readonly epoch: number;
  readonly publish: (seq: number, rest: Record<string, unknown>) => void;
  readonly text: (seq: number) => AiHarnessEvent;
}

async function open(): Promise<Open> {
  const chat = rig.newChat(rig.hub.target);
  const request = rig.service.prepare(rig.owner, chat.id, rig.authority, rig.clientId);
  await rig.service.directory.execute(rig.hub.target, randomUUID(), request);
  const base = {
    session_id: request.claim.session_id,
    chat_id: chat.id,
    epoch: request.claim.epoch,
  };
  return {
    chat: rig.opened.store.aiChats.chat(chat.id),
    epoch: request.claim.epoch,
    publish: (seq, rest): void => {
      rig.service.publish(AI_HARNESS_EVENT.parse({ ...base, seq, ...rest }));
    },
    text: (seq): AiHarnessEvent => ({ ...base, seq, kind: 'text', delta: `chunk ${String(seq)}` }),
  };
}

describe('native events published to the hub', () => {
  it('are offered again when a listener failed, so a retry is not lost', async () => {
    const opened = await open();
    let failing = true;
    const seen: number[] = [];
    rig.service.onEvent((event) => {
      if (failing) throw new Error('listener failed');
      seen.push(event.seq);
    });

    expect(() => {
      rig.service.publish(opened.text(1));
    }).toThrow('listener failed');
    failing = false;
    rig.service.publish(opened.text(1));

    expect(seen).toStrictEqual([1]);
  });

  it('stop reaching a listener that left', async () => {
    const opened = await open();
    const seen: number[] = [];
    const leave = rig.service.onEvent((event) => seen.push(event.seq));
    rig.service.publish(opened.text(1));
    leave();
    rig.service.publish(opened.text(2));

    expect(seen).toStrictEqual([1]);
  });

  it('record the working state when text arrives while the chat waits on a request', async () => {
    const opened = await open();
    opened.publish(1, {
      kind: 'interaction',
      interaction: { id: 'allow-1', epoch: opened.epoch, kind: 'permission', request: {} },
    });
    expect(rig.service.state(rig.owner, opened.chat.id).state).toBe('waiting');

    rig.service.publish(opened.text(2));

    expect(rig.service.state(rig.owner, opened.chat.id).state).toBe('working');
  });
});
