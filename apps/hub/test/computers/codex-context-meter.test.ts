import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { CODEX_PROVIDER_TURN, type CodexProviderEvent } from '@smarteverything/domain';
import { expect, it } from 'vitest';
import { noteContext } from '../../src/assistant/engines/computer/context-meter';
import { CodexClient } from '../../src/codex/client';
import { CodexJob } from '../../src/codex/job';
import { testStore } from '../support/store';

const AT = '2026-10-08T10:00:00.000Z';
const THREAD = 'test-thread';
const TURN = 'test-turn';

function breakdown(inputTokens: number, outputTokens: number): Record<string, number> {
  return {
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    cachedInputTokens: 0,
    reasoningOutputTokens: 0,
  };
}

it('persists Codex context from the latest request and retains cumulative usage separately', async () => {
  const opened = await testStore(() => new Date(AT));
  const { store } = opened;
  const profile = store.profiles.create({ name: 'Pat' });
  const engine = {
    kind: 'codex',
    device_id: randomUUID(),
    model: 'test-model',
    effort: null,
    settings: {},
  } as const;
  const chat = store.aiChats.create({
    profileId: profile.id,
    kind: 'chat',
    title: 'Native work',
    icon: null,
    parentId: null,
    sourceKey: null,
    engine,
  });
  const client = new CodexClient({
    process: spawn(process.execPath, ['-e', 'process.stdin.resume()']),
    received: (): void => undefined,
    closed: (): void => undefined,
  });
  try {
    const events: CodexProviderEvent[] = [];
    const job = new CodexJob({
      turn: CODEX_PROVIDER_TURN.parse({
        device_id: engine.device_id,
        model: engine.model,
        effort: engine.effort,
        job_id: randomUUID(),
        chat_id: chat.id,
        profile_id: profile.id,
        session_id: THREAD,
        system: 'system',
        messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
        tools: [],
        options: {},
      }),
      client,
      generation: randomUUID(),
      threadId: THREAD,
      cwd: '/work',
      roots: [],
      now: (): string => AT,
      cleanup: (): void => undefined,
      publish: (event): void => {
        events.push(event);
        noteContext(store, chat, event);
      },
    });
    job.started(TURN);
    const notification = { threadId: THREAD, turnId: TURN };
    const total = breakdown(389_000, 1_000);
    const last = breakdown(30_000, 1_000);
    job.receive(
      'thread/tokenUsage/updated',
      { ...notification, tokenUsage: { total, last } },
      null,
    );
    expect(store.aiChats.chat(chat.id).context_percent).toBeNull();

    job.receive(
      'thread/tokenUsage/updated',
      { ...notification, tokenUsage: { total, last, modelContextWindow: 250_000 } },
      null,
    );
    expect(events.at(-1)).toMatchObject({
      kind: 'usage',
      context_percent: 12.4,
      usage: { input_tokens: 389_000, output_tokens: 1_000, total_tokens: 390_000 },
    });

    job.receive(
      'thread/tokenUsage/updated',
      { ...notification, tokenUsage: { total, last, modelContextWindow: null } },
      null,
    );
    expect(store.aiChats.chat(chat.id).context_percent).toBe(12);
    expect(store.aiChats.meterHistory(chat.id)).toStrictEqual([
      { at: AT, kind: 'context', percent: 12 },
    ]);
  } finally {
    client.stop();
    await opened.close();
  }
});
