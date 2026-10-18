import { describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryObserver } from '@tanstack/react-query';
import {
  AI_CHAT_PROVIDER,
  AI_CHAT_PROVIDER_NOTICE,
  type AiChatProvider,
} from '@smarteverything/domain';
import { EntityStore } from '../store/entity-store';
import { noticeRouter } from '../store/notice-registry';
import { providerKey } from './keys';
import { PROVIDER_NOTICES } from './provider-notices';

const CHAT = '00000000-0000-4000-8000-0000000000c1';
const DEVICE = '00000000-0000-4000-8000-0000000000d1';
const JOB = '00000000-0000-4000-8000-0000000000a1';
const OTHER_JOB = '00000000-0000-4000-8000-0000000000a2';
const KEY = [...providerKey(CHAT), 'state'];

function stateOf(jobId: string | null): AiChatProvider {
  return AI_CHAT_PROVIDER.parse({
    device_id: DEVICE,
    session_id: null,
    job_id: jobId,
    state: 'working',
    reason: null,
    metadata: null,
    prompts: [],
    events: [],
  });
}

function noticeOf(
  seq: number,
  jobId: string = JOB,
  kind: 'text' | 'completed' = 'text',
): ReturnType<typeof AI_CHAT_PROVIDER_NOTICE.parse> {
  const event =
    kind === 'completed'
      ? { kind, job_id: jobId, chat_id: CHAT, seq, session_id: 'session', interrupted: false }
      : { kind, job_id: jobId, chat_id: CHAT, seq, delta: 'hi' };
  return AI_CHAT_PROVIDER_NOTICE.parse({
    type: 'ai_chat_provider',
    chat_id: CHAT,
    device_id: DEVICE,
    job_id: jobId,
    event,
  });
}

function routed(client: QueryClient): (seq: number, jobId?: string, last?: boolean) => void {
  const route = noticeRouter([PROVIDER_NOTICES], { client, store: new EntityStore() });
  return (seq, jobId, last = false): void => {
    route(noticeOf(seq, jobId, last ? 'completed' : 'text'), true);
  };
}

function seqsOf(client: QueryClient): readonly number[] {
  return client.getQueryData<AiChatProvider>(KEY)?.events.map((event) => event.seq) ?? [];
}

describe('claude provider notices', () => {
  it('appends each event of the running job to the cached state in order', () => {
    const client = new QueryClient();
    client.setQueryData(KEY, stateOf(JOB));
    const receive = routed(client);
    receive(1);
    receive(2);
    receive(2);
    expect(seqsOf(client)).toStrictEqual([1, 2]);
    expect(client.getQueryState(KEY)?.isInvalidated).toBe(false);
  });

  it('rereads the state when an event is missing in between', () => {
    const client = new QueryClient();
    client.setQueryData(KEY, stateOf(JOB));
    const receive = routed(client);
    receive(1);
    receive(3);
    expect(client.getQueryState(KEY)?.isInvalidated).toBe(true);
  });

  it('rereads the state when the event belongs to another job', () => {
    const client = new QueryClient();
    client.setQueryData(KEY, stateOf(JOB));
    routed(client)(1, OTHER_JOB);
    expect(seqsOf(client)).toStrictEqual([]);
    expect(client.getQueryState(KEY)?.isInvalidated).toBe(true);
  });

  it('applies the events that arrive during a read after the read lands', async () => {
    const client = new QueryClient();
    client.setQueryData(KEY, stateOf(JOB));
    const reads: (() => void)[] = [];
    const observer = new QueryObserver(client, {
      queryKey: KEY,
      queryFn: (): Promise<AiChatProvider> =>
        new Promise<AiChatProvider>((resolve) => {
          reads.push((): void => {
            resolve(stateOf(JOB));
          });
        }),
      staleTime: 0,
    });
    const unsubscribe = observer.subscribe(() => undefined);
    await Promise.resolve();
    const receive = routed(client);
    for (let seq = 1; seq < 20; seq += 1) receive(seq);
    receive(20, JOB, true);
    expect(seqsOf(client)).toStrictEqual([]);
    expect(reads).toHaveLength(1);
    reads[0]?.();
    await vi.waitFor(() => {
      expect(client.getQueryData<AiChatProvider>(KEY)?.state).toBe('completed');
    });
    expect(seqsOf(client)).toStrictEqual(Array.from({ length: 20 }, (_, index) => index + 1));
    expect(reads).toHaveLength(1);
    unsubscribe();
  });

  it('applies events after a read whose observer left', async () => {
    const client = new QueryClient();
    client.setQueryData(KEY, stateOf(JOB));
    const reads: (() => void)[] = [];
    const observer = new QueryObserver(client, {
      queryKey: KEY,
      queryFn: (): Promise<AiChatProvider> =>
        new Promise<AiChatProvider>((resolve) => {
          reads.push((): void => {
            resolve(stateOf(JOB));
          });
        }),
      staleTime: 0,
    });
    const unsubscribe = observer.subscribe(() => undefined);
    await Promise.resolve();
    unsubscribe();
    const receive = routed(client);
    for (let seq = 1; seq < 20; seq += 1) receive(seq);
    receive(20, JOB, true);
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });
    expect(reads).toHaveLength(1);
    reads[0]?.();
    await vi.waitFor(() => {
      expect(client.getQueryData<AiChatProvider>(KEY)?.state).toBe('completed');
    });
    expect(seqsOf(client)).toStrictEqual(Array.from({ length: 20 }, (_, index) => index + 1));
    expect(reads).toHaveLength(1);
  });
});
