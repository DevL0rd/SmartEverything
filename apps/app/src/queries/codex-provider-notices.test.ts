import { describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { AI_CHAT_CODEX_PROVIDER, AI_CHAT_RUNTIME_PROVIDER_NOTICE } from '@smarteverything/domain';
import { EntityStore } from '../store/entity-store';
import { noticeRouter } from '../store/notice-registry';
import { codexProviderKey, type CodexChatProvider } from './codex-provider-events';
import { CODEX_PROVIDER_NOTICES } from './codex-provider-notices';

const CHAT = '00000000-0000-4000-8000-0000000000c1';
const DEVICE = '00000000-0000-4000-8000-0000000000d1';
const PROFILE = '00000000-0000-4000-8000-0000000000e1';
const JOB = '00000000-0000-4000-8000-0000000000a1';
const OTHER_JOB = '00000000-0000-4000-8000-0000000000a2';
const PROCESS = '00000000-0000-4000-8000-0000000000b1';
const KEY = codexProviderKey(CHAT);

function stateOf(): CodexChatProvider {
  return AI_CHAT_CODEX_PROVIDER.parse({
    runtime: 'codex',
    device_id: DEVICE,
    session_id: null,
    job_id: JOB,
    state: 'working',
    reason: null,
    metadata: null,
    prompts: [],
    events: [],
    context: null,
  });
}

function noticeOf(
  seq: number,
  jobId: string,
  kind: 'text' | 'completed' = 'text',
): ReturnType<typeof AI_CHAT_RUNTIME_PROVIDER_NOTICE.parse> {
  const base = {
    job_id: jobId,
    chat_id: CHAT,
    seq,
    process_generation: PROCESS,
    thread_id: null,
    turn_id: null,
    item_id: null,
  };
  const event =
    kind === 'completed'
      ? { ...base, kind, session_id: 'session', interrupted: false }
      : { ...base, kind, delta: 'hi' };
  return AI_CHAT_RUNTIME_PROVIDER_NOTICE.parse({
    type: 'ai_chat_runtime_provider',
    chat_id: CHAT,
    device_id: DEVICE,
    profile_id: PROFILE,
    runtime: 'codex',
    job_id: jobId,
    event,
  });
}

function setup(): {
  client: QueryClient;
  receive: (seq: number, jobId?: string, last?: boolean) => void;
} {
  const client = new QueryClient();
  client.setQueryData(KEY, stateOf());
  const route = noticeRouter([CODEX_PROVIDER_NOTICES], { client, store: new EntityStore() });
  return {
    client,
    receive: (seq, jobId = JOB, last = false): void => {
      route(noticeOf(seq, jobId, last ? 'completed' : 'text'), true);
    },
  };
}

function seqsOf(client: QueryClient): readonly number[] {
  return client.getQueryData<CodexChatProvider>(KEY)?.events.map((event) => event.seq) ?? [];
}

describe('codex provider notices', () => {
  it('appends each event of the running job once and in order', () => {
    const { client, receive } = setup();
    receive(1);
    receive(2);
    receive(2);
    expect(seqsOf(client)).toStrictEqual([1, 2]);
    expect(client.getQueryState(KEY)?.isInvalidated).toBe(false);
  });

  it('rereads the state when an event is missing in between', () => {
    const { client, receive } = setup();
    receive(1);
    receive(3);
    expect(client.getQueryState(KEY)?.isInvalidated).toBe(true);
  });

  it('rereads the state when the event belongs to another job', () => {
    const { client, receive } = setup();
    receive(1, OTHER_JOB);
    expect(seqsOf(client)).toStrictEqual([]);
    expect(client.getQueryState(KEY)?.isInvalidated).toBe(true);
  });

  it('applies the events that arrive during a read after the read lands', async () => {
    const { client, receive } = setup();
    const reads: (() => void)[] = [];
    const observer = new QueryObserver(client, {
      queryKey: KEY,
      queryFn: (): Promise<CodexChatProvider> =>
        new Promise<CodexChatProvider>((resolve) => {
          reads.push((): void => {
            resolve(stateOf());
          });
        }),
      staleTime: 0,
    });
    const unsubscribe = observer.subscribe(() => undefined);
    await Promise.resolve();
    for (let seq = 1; seq < 20; seq += 1) receive(seq);
    receive(20, JOB, true);
    expect(seqsOf(client)).toStrictEqual([]);
    expect(reads).toHaveLength(1);
    reads[0]?.();
    await vi.waitFor(() => {
      expect(client.getQueryData<CodexChatProvider>(KEY)?.state).toBe('completed');
    });
    expect(seqsOf(client)).toStrictEqual(Array.from({ length: 20 }, (_, index) => index + 1));
    expect(reads).toHaveLength(1);
    unsubscribe();
  });

  it('applies events after a read whose observer left', async () => {
    const { client, receive } = setup();
    const reads: (() => void)[] = [];
    const observer = new QueryObserver(client, {
      queryKey: KEY,
      queryFn: (): Promise<CodexChatProvider> =>
        new Promise<CodexChatProvider>((resolve) => {
          reads.push((): void => {
            resolve(stateOf());
          });
        }),
      staleTime: 0,
    });
    const unsubscribe = observer.subscribe(() => undefined);
    await Promise.resolve();
    unsubscribe();
    for (let seq = 1; seq < 20; seq += 1) receive(seq);
    receive(20, JOB, true);
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });
    expect(reads).toHaveLength(1);
    reads[0]?.();
    await vi.waitFor(() => {
      expect(client.getQueryData<CodexChatProvider>(KEY)?.state).toBe('completed');
    });
    expect(seqsOf(client)).toStrictEqual(Array.from({ length: 20 }, (_, index) => index + 1));
    expect(reads).toHaveLength(1);
  });
});
