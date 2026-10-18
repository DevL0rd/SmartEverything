import { describe, expect, it, vi } from 'vitest';
import type * as ClaudeSdk from '@anthropic-ai/claude-agent-sdk';
import type { Options, Query, SDKMessage, SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';
import { PROVIDER_TURN, type ProviderTurn } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { ProviderJob } from '../../src/claude/provider/job';

const JOB = '6b6e4f0e-2d6c-4f54-9d3a-0a4a4f5c7d11';
const CHAT = '0f9a8c1e-7a3b-4d77-8d5e-3b0f6f7a2c10';
const DEVICE = '3c1d5a52-9a0e-4b0d-8f0b-7f2b1f6d4e90';
const PROFILE = 'a2c8d0aa-52a4-4c87-8c33-0c6e5e3d9b21';

const sdk = vi.hoisted(
  (): {
    extraUsage: boolean;
    sent: number;
    feed: ((message: SDKMessage) => void) | undefined;
  } => ({ extraUsage: true, sent: 0, feed: undefined }),
);

function fakeQuery(prompt: AsyncIterable<SDKUserMessage>): Query {
  void (async (): Promise<void> => {
    for await (const _message of prompt) sdk.sent += 1;
  })();
  const waiting: ((value: IteratorResult<SDKMessage>) => void)[] = [];
  sdk.feed = (message): void => {
    waiting.shift()?.({ done: false, value: message });
  };
  const iterator: AsyncIterator<SDKMessage> = {
    next: () => new Promise((resolve) => waiting.push(resolve)),
  };
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return -- partial fake of the SDK query
  return Object.assign(Object.create(null), {
    [Symbol.asyncIterator]: () => iterator,
    close: vi.fn(),
    supportedModels: () => Promise.resolve([{ value: 'sonnet', resolvedModel: 'sonnet' }]),
    setModel: () => Promise.resolve(undefined),
    applyFlagSettings: () => Promise.resolve(undefined),
    mcpServerStatus: () => Promise.resolve([]),
    usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET: () =>
      Promise.resolve({
        subscription_type: 'max',
        rate_limits_available: true,
        rate_limits: {
          five_hour: { utilization: 0, resets_at: null },
          seven_day: { utilization: 1, resets_at: '2999-01-01T00:00:00Z' },
          model_scoped: [],
          extra_usage: { is_enabled: sdk.extraUsage },
        },
      }),
  });
}

vi.mock('@anthropic-ai/claude-agent-sdk', async (original) => {
  const actual = await original<typeof ClaudeSdk>();
  return {
    ...actual,
    query: (input: {
      readonly prompt: AsyncIterable<SDKUserMessage>;
      readonly options: Options;
    }): Query => fakeQuery(input.prompt),
  };
});

function turn(): ProviderTurn {
  return PROVIDER_TURN.parse({
    job_id: JOB,
    device_id: DEVICE,
    chat_id: CHAT,
    profile_id: PROFILE,
    model: 'sonnet',
    effort: null,
    session_id: null,
    system: 'system',
    messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
    tools: [],
    options: { builtin_tools: [] },
  });
}

function result(): SDKMessage {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return -- partial fake of an SDK message
  return Object.assign(Object.create(null), {
    type: 'result',
    subtype: 'success',
    is_error: false,
    result: '',
    session_id: 'session',
    total_cost_usd: 0,
    usage: {
      input_tokens: 1,
      output_tokens: 1,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 0,
    },
  });
}

async function idleJob(): Promise<ProviderJob> {
  const subject = new ProviderJob({
    turn: turn(),
    cwd: '/work',
    log: new Logger('hub.claude'),
    publish: (): void => undefined,
  });
  const consume: unknown = Reflect.get(subject, 'consume');
  if (typeof consume !== 'function') throw new Error('The job has no consume loop.');
  void Reflect.apply(consume, subject, []);
  await vi.waitFor(() => {
    expect(sdk.feed).toBeDefined();
  });
  sdk.feed?.(result());
  await vi.waitFor(() => {
    expect(subject.active).toBe(false);
  });
  return subject;
}

describe('continuing a Claude job after a billing refusal', () => {
  it('leaves the job idle and accepts nothing when the billing gate refuses the follow-up turn', async () => {
    sdk.extraUsage = true;
    sdk.sent = 0;
    const subject = await idleJob();
    await expect(subject.continue(turn())).rejects.toThrow();
    expect(subject.active).toBe(false);
    expect(subject.steer([{ type: 'text', text: 'stop' }])).toBe(false);
    expect(sdk.sent).toBe(0);
  });

  it('starts the follow-up turn when the billing gate allows it', async () => {
    sdk.extraUsage = false;
    const subject = await idleJob();
    await subject.continue(turn());
    expect(subject.active).toBe(true);
  });
});
