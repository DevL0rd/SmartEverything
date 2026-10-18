import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as ClaudeSdk from '@anthropic-ai/claude-agent-sdk';
import type {
  HookCallback,
  Options,
  Query,
  SDKMessage,
  SDKUserMessage,
} from '@anthropic-ai/claude-agent-sdk';
import {
  PROVIDER_TURN,
  type ProviderContent,
  type ProviderEvent,
  type ProviderTurn,
} from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { ProviderJob } from '../../src/claude/provider/job';

const IMAGE: ProviderContent = { type: 'image', media_type: 'image/png', data: 'iVBORw0KGgo=' };
const JOB = '6b6e4f0e-2d6c-4f54-9d3a-0a4a4f5c7d11';
const CHAT = '0f9a8c1e-7a3b-4d77-8d5e-3b0f6f7a2c10';
const DEVICE = '3c1d5a52-9a0e-4b0d-8f0b-7f2b1f6d4e90';
const PROFILE = 'a2c8d0aa-52a4-4c87-8c33-0c6e5e3d9b21';

interface Sdk {
  options: Options | undefined;
  sent: SDKUserMessage[];
  feed: ((message: SDKMessage) => void) | undefined;
  end: (() => void) | undefined;
  interrupts: unknown[];
}

const sdk = vi.hoisted((): Sdk => ({
  options: undefined,
  sent: [],
  feed: undefined,
  end: undefined,
  interrupts: [],
}));

function fakeQuery(prompt: AsyncIterable<SDKUserMessage>): Query {
  const waiting: ((value: IteratorResult<SDKMessage>) => void)[] = [];
  const queued: SDKMessage[] = [];
  let ended = false;
  sdk.feed = (message): void => {
    const next = waiting.shift();
    if (next === undefined) queued.push(message);
    else next({ done: false, value: message });
  };
  sdk.end = (): void => {
    ended = true;
    for (const next of waiting.splice(0)) next({ done: true, value: undefined });
  };
  void (async (): Promise<void> => {
    for await (const message of prompt) sdk.sent.push(message);
  })();
  const iterator: AsyncIterator<SDKMessage> = {
    next: () => {
      const value = queued.shift();
      if (value !== undefined) return Promise.resolve({ done: false, value });
      if (ended) return Promise.resolve({ done: true, value: undefined });
      return new Promise((resolve) => waiting.push(resolve));
    },
  };
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return -- partial fake of the SDK query
  return Object.assign(Object.create(null), {
    [Symbol.asyncIterator]: () => iterator,
    close: vi.fn(),
    getContextUsage: () => Promise.resolve({ percentage: 12 }),
    interrupt: (options: unknown) => {
      sdk.interrupts.push(options);
      return Promise.resolve(undefined);
    },
  });
}

vi.mock('@anthropic-ai/claude-agent-sdk', async (original) => {
  const actual = await original<typeof ClaudeSdk>();
  return {
    ...actual,
    query: (input: {
      readonly prompt: AsyncIterable<SDKUserMessage>;
      readonly options: Options;
    }): Query => {
      sdk.options = input.options;
      return fakeQuery(input.prompt);
    },
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

// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- partial fakes of SDK objects that only expose what the code under test reads
function loose<T>(value: object): T {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return -- same partial fake
  return Object.assign(Object.create(null), value);
}

function result(change: Record<string, unknown> = {}): SDKMessage {
  return loose<SDKMessage>({
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
    ...change,
  });
}

interface Running {
  readonly job: ProviderJob;
  readonly events: ProviderEvent[];
  readonly consuming: Promise<void>;
}

function run(): Running {
  const events: ProviderEvent[] = [];
  const job = new ProviderJob({
    turn: turn(),
    cwd: '/work',
    log: new Logger('hub.claude'),
    publish: (event): void => {
      events.push(event);
    },
  });
  const consume: unknown = Reflect.get(job, 'consume');
  if (typeof consume !== 'function') throw new Error('The job has no consume loop.');
  const consuming: unknown = Reflect.apply(consume, job, []);
  if (!(consuming instanceof Promise)) throw new Error('The consume loop is not asynchronous.');
  return { job, events, consuming: consuming.then(() => undefined) };
}

async function settle(): Promise<void> {
  await vi.waitFor(() => undefined);
  await new Promise((done) => setImmediate(done));
}

async function toolFinished(agentId?: string): Promise<void> {
  const hook = sdk.options?.hooks?.PostToolUse?.[0]?.hooks[0];
  if (hook === undefined) throw new Error('No tool boundary hook was registered.');
  const input: Parameters<HookCallback>[0] = {
    hook_event_name: 'PostToolUse',
    session_id: 'session',
    transcript_path: '/work/t.jsonl',
    cwd: '/work',
    tool_name: 'Bash',
    tool_input: {},
    tool_response: {},
    tool_use_id: 'tool-1',
    ...(agentId === undefined ? {} : { agent_id: agentId }),
  };
  await hook(input, 'tool-1', { signal: new AbortController().signal });
}

function kinds(events: readonly ProviderEvent[]): string[] {
  return events.map((event) => event.kind).filter((kind) => kind !== 'runtime');
}

function textOf(message: SDKUserMessage | undefined): unknown {
  return message?.message.content;
}

describe('steering a running Claude reply', () => {
  beforeEach(() => {
    sdk.sent.length = 0;
    sdk.interrupts.length = 0;
  });

  it('does not deliver a steer when a sub-agent finishes a tool, only when the main agent does', async () => {
    const { job } = run();
    job.steer([{ type: 'text', text: 'stop' }]);

    await toolFinished('sub-agent-1');
    await settle();
    expect(sdk.sent).toHaveLength(0);

    await toolFinished();
    await settle();
    expect(sdk.sent).toHaveLength(1);
  });

  it('holds the steer until the running turn finishes a tool, then queues it with next priority', async () => {
    const { job } = run();
    expect(job.steer([{ type: 'text', text: 'stop' }, IMAGE])).toBe(true);
    await settle();
    expect(sdk.sent).toHaveLength(0);

    await toolFinished();
    await settle();

    expect(sdk.sent).toHaveLength(1);
    expect(sdk.sent[0]).toMatchObject({ type: 'user', priority: 'next' });
    expect(textOf(sdk.sent[0])).toStrictEqual([
      { type: 'text', text: 'stop' },
      { type: 'image', source: { type: 'base64', media_type: 'image/png', data: IMAGE.data } },
    ]);
  });

  it('ends the reply at its result once the steer was delivered at a tool boundary', async () => {
    const { job, events } = run();
    job.steer([{ type: 'text', text: 'also' }]);
    await toolFinished();
    sdk.feed?.(result());
    await settle();

    expect(kinds(events)).toStrictEqual(['usage', 'completed']);
    expect(job.active).toBe(false);
    expect(sdk.sent).toHaveLength(1);
  });

  it('answers a steer that arrives just before the result as a follow-up turn of the same reply', async () => {
    const { job, events } = run();
    job.steer([{ type: 'text', text: 'one more thing' }]);
    sdk.feed?.(result());
    await settle();

    expect(kinds(events)).toStrictEqual(['usage']);
    expect(job.active).toBe(true);
    expect(sdk.sent).toHaveLength(1);
    expect(textOf(sdk.sent[0])).toStrictEqual([{ type: 'text', text: 'one more thing' }]);

    sdk.feed?.(result());
    await settle();

    expect(kinds(events)).toStrictEqual(['usage', 'usage', 'completed']);
    expect(job.active).toBe(false);
    expect(sdk.sent).toHaveLength(1);
  });

  it('merges several waiting steers into one follow-up message', async () => {
    const { job } = run();
    job.steer([{ type: 'text', text: 'first' }]);
    job.steer([{ type: 'text', text: 'second' }, IMAGE]);
    sdk.feed?.(result());
    await settle();

    expect(sdk.sent).toHaveLength(1);
    expect(textOf(sdk.sent[0])).toHaveLength(3);
  });

  it('drops waiting steers and cancels queued ones when the reply is stopped', async () => {
    const { job, events } = run();
    job.steer([{ type: 'text', text: 'too late' }]);
    await job.interrupt();
    expect(sdk.interrupts).toStrictEqual([{ cancelQueued: true }]);

    sdk.feed?.(result());
    await settle();

    expect(sdk.sent).toHaveLength(0);
    expect(kinds(events)).toStrictEqual(['usage', 'completed']);
    expect(events.at(-1)).toMatchObject({ kind: 'completed', interrupted: true });
    expect(job.active).toBe(false);
  });

  it('does not run a waiting steer after the turn failed', async () => {
    const { job, events } = run();
    job.steer([{ type: 'text', text: 'late' }]);
    sdk.feed?.(result({ subtype: 'error_during_execution', errors: ['boom'] }));
    await settle();

    expect(kinds(events)).toStrictEqual(['usage', 'failed']);
    expect(sdk.sent).toHaveLength(0);
    expect(job.active).toBe(false);
  });

  it('refuses a steer once the job has closed, while a native command owns the turn, or after the result', async () => {
    const closed = run().job;
    closed.stop();
    expect(closed.steer([{ type: 'text', text: 'late' }])).toBe(false);

    const command = run().job;
    Reflect.set(command, 'nativeCommand', true);
    expect(command.steer([{ type: 'text', text: 'during' }])).toBe(false);

    const finished = run();
    sdk.feed?.(result());
    await settle();
    expect(finished.job.steer([{ type: 'text', text: 'after' }])).toBe(false);
  });
});
