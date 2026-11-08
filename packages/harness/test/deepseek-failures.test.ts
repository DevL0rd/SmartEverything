import { afterEach, describe, expect, it } from 'vitest';
import type { SessionEvent } from '@deepseek-ai/dsh-session';
import { ask, bootProviderLoop, turnEnds } from './support/loop-testkit';
import type { ProviderLoop } from './support/loop-testkit';
import { startMockProvider } from './support/llm-mock-server';
import type { MockProvider } from './support/llm-mock-server';

let provider: MockProvider | undefined;
let loop: ProviderLoop | undefined;

afterEach(async () => {
  await loop?.dispose();
  await provider?.dispose();
  loop = undefined;
  provider = undefined;
});

async function boot(sequence: Parameters<typeof startMockProvider>[0]): Promise<{
  readonly mock: MockProvider;
  readonly session: ProviderLoop;
}> {
  provider = await startMockProvider(sequence);
  loop = await bootProviderLoop({ key: 'vault-key' });
  return { mock: provider, session: loop };
}

function assistantTexts(events: readonly SessionEvent[]): readonly string[] {
  return events.flatMap((event) => {
    if (event.type !== 'assistant/message') return [];
    return JSON.stringify(event.data);
  });
}

describe('provider failures on the wire', () => {
  it('ends a turn the provider rejects permanently and accepts the next prompt', async () => {
    const { mock, session } = await boot(['auth_error', 'success']);
    const agent = await session.agent('permanent');

    await ask(agent, 'first');
    await ask(agent, 'second');

    expect(
      turnEnds(session.events(agent.session.id)).map((end) =>
        end.kind === 'error' ? end.code : end.kind,
      ),
    ).toStrictEqual(['AUTH', 'completed']);
    expect(mock.server.requests.map((request) => request.behavior)).toStrictEqual([
      'auth_error',
      'success',
    ]);
  });

  it('retries a transient server failure within the same turn', async () => {
    const { mock, session } = await boot(['server_error', 'success']);
    const agent = await session.agent('transient');

    await ask(agent, 'hello');

    expect(turnEnds(session.events(agent.session.id))).toStrictEqual([{ kind: 'completed' }]);
    expect(mock.server.requests.map((request) => request.behavior)).toStrictEqual([
      'server_error',
      'success',
    ]);
    expect(session.events(agent.session.id).some((event) => event.type === 'llm/retry')).toBe(true);
  });

  it('discards a reply cut off mid-stream and keeps only the complete retry', async () => {
    const { mock, session } = await boot(['partial_disconnect', 'success']);
    const agent = await session.agent('partial');

    await ask(agent, 'hello');

    const replies = assistantTexts(session.events(agent.session.id));
    expect(turnEnds(session.events(agent.session.id))).toStrictEqual([{ kind: 'completed' }]);
    expect(mock.server.requests).toHaveLength(2);
    expect(replies).toHaveLength(1);
    expect(replies[0]).toContain('mock response recovered');
    expect(replies[0]).not.toContain('discarded partial response');
  });

  it.each([
    ['quota_exceeded', 'QUOTA'],
    ['invalid_request', 'INVALID_REQUEST'],
  ] as const)('surfaces %s without retrying', async (behavior, code) => {
    const { mock, session } = await boot([behavior]);
    const agent = await session.agent(behavior);

    await ask(agent, 'hello');

    expect(
      turnEnds(session.events(agent.session.id)).map((end) =>
        end.kind === 'error' ? end.code : end.kind,
      ),
    ).toStrictEqual([code]);
    expect(mock.server.requests).toHaveLength(1);
  });
});
