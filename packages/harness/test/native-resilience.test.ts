import { afterEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { SessionId } from '@deepseek-ai/dsh-session';
import { LlmError } from '@deepseek-ai/dsh-llm';
import type { StreamChunk } from '@deepseek-ai/dsh-llm';
import {
  ASSISTANT_MESSAGE_ROW,
  DSH_SESSION_ID,
  type AssistantMessageRow,
  type DshSessionId,
  type HarnessRuntimeReceipt,
  type HarnessRuntimeRequest,
} from '@smarteverything/domain';
import { nativeHeader } from '../src/persistence/validation';
import { liveCleanup, workDrained } from '../src/host/work';
import type { HarnessWork } from '../src/host/work';
import { ProcessControls } from '../src/process/controls';
import { importLegacyHistory } from '../src/process/legacy-history';
import { bootDispatcher } from './support/dispatcher';
import type { DispatcherFixture } from './support/dispatcher';

let fixture: DispatcherFixture | undefined;
afterEach(async () => {
  await fixture?.dispose();
  fixture = undefined;
});

function receipt(sessionId: DshSessionId): HarnessRuntimeReceipt {
  return {
    operation_id: randomUUID(),
    session_id: sessionId,
    epoch: 1,
    state: 'completed',
    durable_seq: -1,
  };
}

describe('operation receipts', () => {
  it('lets the hub retry an operation id after it failed', async () => {
    const controls = new ProcessControls();
    const session = DSH_SESSION_ID.parse(randomUUID());
    const request: HarnessRuntimeRequest = {
      kind: 'interrupt',
      session_id: session,
      expected_epoch: 1,
    };
    const id = randomUUID();

    await expect(
      controls.execute(id, request, () => Promise.reject(new Error('transient'))),
    ).rejects.toThrow('transient');
    const retried = await controls.execute(id, request, () => Promise.resolve(receipt(session)));

    expect(retried.state).toBe('completed');
  });

  it('answers a repeated successful operation from the first result', async () => {
    const controls = new ProcessControls();
    const session = DSH_SESSION_ID.parse(randomUUID());
    const request: HarnessRuntimeRequest = {
      kind: 'interrupt',
      session_id: session,
      expected_epoch: 1,
    };
    const id = randomUUID();
    const operation = vi.fn(() => Promise.resolve(receipt(session)));

    const first = await controls.execute(id, request, operation);
    const second = await controls.execute(id, request, operation);

    expect(second).toBe(first);
    expect(operation).toHaveBeenCalledOnce();
  });

  it('forgets a session own receipts when it closes but still answers a repeated close', async () => {
    const controls = new ProcessControls();
    const session = DSH_SESSION_ID.parse(randomUUID());
    const interrupt: HarnessRuntimeRequest = {
      kind: 'interrupt',
      session_id: session,
      expected_epoch: 1,
    };
    const close: HarnessRuntimeRequest = { kind: 'close', session_id: session, expected_epoch: 1 };
    const interrupted = vi.fn(() => Promise.resolve(receipt(session)));
    const closed = vi.fn(() => Promise.resolve({ ...receipt(session), state: 'closed' as const }));
    const interruptId = randomUUID();
    const closeId = randomUUID();

    await controls.execute(interruptId, interrupt, interrupted);
    await controls.execute(closeId, close, closed);
    await controls.execute(interruptId, interrupt, interrupted);
    await controls.execute(closeId, close, closed);

    expect(interrupted).toHaveBeenCalledTimes(2);
    expect(closed).toHaveBeenCalledOnce();
  });
});

describe('cleanup that could not be proved', () => {
  const idle = { turn: false, interactions: 0, shells: [] } as const;
  const unknown = { state: 'unknown', jobs: ['job-1'], reason: 'could not be proved' } as const;
  const work = (cleanup: HarnessWork['cleanup']): HarnessWork => ({
    ...idle,
    queuedMessages: 0,
    cleanup,
  });

  it('is settled as soon as nothing is running any more', () => {
    expect(liveCleanup(unknown, idle)).toStrictEqual({ state: 'completed' });
    expect(workDrained(work(liveCleanup(unknown, idle)))).toBe(true);
  });

  it('stays unknown while a shell or turn is still alive, and blocks the drain', () => {
    const busy = { ...idle, shells: ['job-1'] };

    expect(liveCleanup(unknown, busy)).toBe(unknown);
    expect(workDrained({ ...work(unknown), shells: ['job-1'] })).toBe(false);
  });
});

function historyRow(chat: string, profile: string, text: string): AssistantMessageRow {
  return ASSISTANT_MESSAGE_ROW.parse({
    id: randomUUID(),
    profile_id: profile,
    client_id: null,
    role: 'person',
    kind: 'text',
    author: 'Person',
    text,
    attachments: [],
    state: null,
    reason: null,
    steps: [],
    reply_to: null,
    chat_id: chat,
    origin: null,
    embeds: [],
    cost_micros: 0,
    model: null,
    created_at: '2026-10-01T09:00:00.000Z',
    updated_at: '2026-10-01T09:00:00.000Z',
  });
}

describe('importing a chat that predates the native history', () => {
  it('imports once and never compares an already imported chat with a rebuilt import', async () => {
    const host = await bootDispatcher();
    fixture = host;
    const sessionId = DSH_SESSION_ID.parse(randomUUID());
    const chatId = randomUUID();
    const cwd = join(host.directory, 'home');
    const claim = host.persistence.admit(
      nativeHeader({
        version: 4,
        id: sessionId,
        createdAt: Date.now(),
        cwd,
        isSeeded: false,
        agentPreset: 'smarteverything',
      }),
      chatId,
    );
    const open = (text: string): Extract<HarnessRuntimeRequest, { kind: 'open' }> => ({
      kind: 'open',
      chat_id: chatId,
      claim,
      route: host.route,
      permission: { sandbox: 'danger-full-access', approval: 'never' },
      cwd,
      mode: 'resume',
      history_import: [historyRow(chatId, host.persistence.profile, text)],
    });
    const ports = { persistence: host.persistence, load: undefined };

    await importLegacyHistory(host.dispatcher.runtime, open('first wording'), ports);
    const stored = await host.persistence.read(SessionId(sessionId));
    await importLegacyHistory(host.dispatcher.runtime, open('reworded later'), ports);

    expect(stored).not.toHaveLength(0);
    expect(await host.persistence.read(SessionId(sessionId))).toStrictEqual(stored);
  });
});

describe('a turn that fails', () => {
  it('tells the hub why, not a generic message', async () => {
    const host = await bootDispatcher();
    fixture = host;
    host.model.stream = (): AsyncIterable<StreamChunk> => ({
      [Symbol.asyncIterator]: () => ({
        next: () => Promise.reject(new LlmError('Insufficient credits on the account', 'AUTH')),
      }),
    });
    const opened = await host.open();

    await host.send(opened, 'hi');

    await vi.waitFor(() => {
      const failed = host.published.find((event) => event.kind === 'failed');
      expect(failed?.failure.message).toContain('Insufficient credits');
    });
  });
});
