import { describe, expect, it } from 'vitest';
import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { AI_HARNESS_NOTICE } from '@smarteverything/domain';
import { EntityStore } from '../store/entity-store';
import { noticeRouter } from '../store/notice-registry';
import { HARNESS_NOTICES, harnessKey } from './harness-notices';

const CHAT = '00000000-0000-4000-8000-0000000000c1';

type State = 'running' | 'idle';

function completedNotice(): ReturnType<typeof AI_HARNESS_NOTICE.parse> {
  return AI_HARNESS_NOTICE.parse({
    type: 'ai_harness',
    event: {
      kind: 'completed',
      session_id: 'session-1',
      chat_id: CHAT,
      epoch: 1,
      seq: 1,
      interrupted: false,
      durable_seq: -1,
    },
  });
}

function settled(): Promise<void> {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
}

describe('harness notices', () => {
  it('rereads a session that a notice outdates while another read is in flight', async () => {
    const client = new QueryClient();
    const route = noticeRouter(HARNESS_NOTICES, { client, store: new EntityStore() });
    const settle: ((state: State) => void)[] = [];
    client.setQueryData<State>(harnessKey(CHAT), 'running');
    const observer = new QueryObserver<State>(client, {
      queryKey: harnessKey(CHAT),
      queryFn: (): Promise<State> =>
        new Promise<State>((resolve) => {
          settle.push(resolve);
        }),
    });
    const unsubscribe = observer.subscribe(() => undefined);
    await settled();
    expect(settle).toHaveLength(1);
    expect(route(completedNotice(), true)).toBe(true);
    await settled();
    expect(settle).toHaveLength(2);
    settle[1]?.('idle');
    settle[0]?.('running');
    await settled();
    expect(client.getQueryData(harnessKey(CHAT))).toBe('idle');
    unsubscribe();
  });
});

describe('harness text deltas', () => {
  it('leave the session read alone while the assistant is still typing', () => {
    const client = new QueryClient();
    const route = noticeRouter(HARNESS_NOTICES, { client, store: new EntityStore() });
    client.setQueryData<State>(harnessKey(CHAT), 'running');
    const text = AI_HARNESS_NOTICE.parse({
      type: 'ai_harness',
      event: {
        kind: 'text',
        session_id: 'session-1',
        chat_id: CHAT,
        epoch: 1,
        seq: 2,
        delta: 'hi',
        durable_seq: -1,
      },
    });
    route(text, true);
    expect(client.getQueryState(harnessKey(CHAT))?.isInvalidated).toBe(false);
  });
});
