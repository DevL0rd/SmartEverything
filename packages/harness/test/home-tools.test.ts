import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Context } from '@deepseek-ai/cordis';
import { LlmAdapter, ToolCallId } from '@deepseek-ai/dsh-llm';
import type {
  GenerateOptions,
  LlmModelInfo,
  LlmResolvedModelInfo,
  StreamChunk,
} from '@deepseek-ai/dsh-llm';
import { bindHomeTools } from '../src/plugins/home-tools';
import type {
  HomeTool,
  HomeToolCall,
  HomeToolResult,
  HomeToolSession,
  HomeToolTransport,
} from '../src/plugins/home-tools';
import { bootRuntime, spoken, turnsFinished } from './support/runtime';
import { isTitleRequest } from './support/scripted-model';
import type { RuntimeFixture } from './support/runtime';

const PROVIDER = 'parallel';
const PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

interface Planned {
  readonly id: string;
  readonly name: string;
  readonly input: Readonly<Record<string, unknown>>;
}

type Reply = readonly Planned[] | string;

class StepModel extends LlmAdapter {
  readonly requests: GenerateOptions[] = [];
  private readonly replies: Reply[] = [];

  script(...replies: readonly Reply[]): void {
    this.replies.push(...replies);
  }

  override listModels(provider: string): Promise<readonly LlmModelInfo[]> {
    return Promise.resolve([{ provider, id: 'steps', name: 'steps' }]);
  }

  override resolveModel(provider: string, model: string): Promise<LlmResolvedModelInfo> {
    return Promise.resolve({
      provider,
      id: model,
      name: model,
      context: { contextWindow: 200_000 },
    });
  }

  override async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    await Promise.resolve();
    if (isTitleRequest(options)) {
      yield* textChunks('Session title');
      return;
    }
    this.requests.push(options);
    const reply = this.replies.shift();
    if (reply === undefined) throw new Error('The step model has no reply left.');
    yield* typeof reply === 'string' ? textChunks(reply) : callChunks(reply);
  }
}

const USAGE: StreamChunk = { type: 'usage', usage: { inputTokens: 10, outputTokens: 5 } };

function textChunks(text: string): readonly StreamChunk[] {
  return [
    { type: 'block-start', index: 0, blockType: 'text' },
    { type: 'text-delta', index: 0, text },
    { type: 'block-end', index: 0, block: { type: 'text', text } },
    USAGE,
    { type: 'finish', reason: { kind: 'stop' } },
  ];
}

function callChunks(calls: readonly Planned[]): readonly StreamChunk[] {
  return [
    ...calls.flatMap((call, index): readonly StreamChunk[] => {
      const id = ToolCallId(call.id);
      const args = JSON.stringify(call.input);
      return [
        { type: 'block-start', index, blockType: 'tool-call' },
        { type: 'tool-call-delta', index, id, name: call.name, argumentsDelta: args },
        {
          type: 'block-end',
          index,
          block: { type: 'tool-call', id, name: call.name, arguments: args },
        },
      ];
    }),
    USAGE,
    { type: 'finish', reason: { kind: 'tool-calls' } },
  ];
}

function tool(name: string, safe: (args: Readonly<Record<string, unknown>>) => boolean): HomeTool {
  return {
    name,
    description: `The ${name} tool.`,
    parameters: { type: 'object', properties: { text: { type: 'string' } } },
    concurrencySafe: safe,
  };
}

class FakeHub implements HomeToolTransport {
  readonly calls: HomeToolCall[] = [];
  readonly activeAtStart: Record<string, number> = {};
  peak = 0;
  private active = 0;
  private listener: (() => void) | undefined;
  private current: readonly HomeTool[];
  declared: readonly string[];
  pictures: HomeToolResult['pictures'] = [];
  arrival: (call: HomeToolCall) => Promise<void> = () => Promise.resolve();

  constructor(tools: readonly HomeTool[]) {
    this.current = tools;
    this.declared = tools.map((entry) => entry.name);
  }

  tools(): readonly HomeTool[] {
    return this.current;
  }

  replace(tools: readonly HomeTool[]): void {
    this.current = tools;
    this.listener?.();
  }

  changes(listener: () => void): () => void {
    this.listener = listener;
    return (): void => {
      this.listener = undefined;
    };
  }

  session(): Promise<HomeToolSession> {
    return Promise.resolve({ tools: this.current, declared: this.declared });
  }

  async call(call: HomeToolCall): Promise<HomeToolResult> {
    this.calls.push(call);
    this.activeAtStart[call.callId] = this.active;
    this.active += 1;
    this.peak = Math.max(this.peak, this.active);
    try {
      await this.arrival(call);
    } finally {
      this.active -= 1;
    }
    return {
      response: { echoed: call.name, text: call.arguments['text'] ?? null },
      pictures: this.pictures,
    };
  }
}

function bothRunning(hub: FakeHub): Promise<void> {
  return vi.waitFor(() => {
    expect(hub.peak).toBe(2);
  });
}

let fixture: RuntimeFixture | undefined;
afterEach(async () => {
  await fixture?.dispose();
  fixture = undefined;
});

async function boot(): Promise<{
  readonly host: RuntimeFixture;
  readonly ctx: Context;
  readonly model: StepModel;
}> {
  let captured: Context | undefined;
  const model = new StepModel();
  fixture = await bootRuntime({
    mount: (ctx) => {
      captured = ctx;
      const registration = ctx.llm.registerAdapter([PROVIDER], model);
      ctx.effect(() => registration);
    },
  });
  if (captured === undefined) throw new Error('The runtime never mounted the test route.');
  return { host: fixture, ctx: captured, model };
}

async function ask(host: RuntimeFixture, text: string): Promise<string> {
  const options = { ...host.sessionOptions(), provider: PROVIDER, model: 'steps' };
  const session = await host.runtime.create(options);
  session.text(text);
  await turnsFinished(host, session, 1);
  return options.sessionId;
}

function resultTexts(model: StepModel, request: number): readonly string[] {
  const messages = model.requests[request]?.messages ?? [];
  return spoken(messages.filter((message) => message.role === 'tool')).map((entry) => entry.text);
}

function offered(model: StepModel, request: number): readonly string[] {
  return model.requests[request]?.tools?.map((entry) => entry.name) ?? [];
}

describe('home tools run in parallel only when the transport classifies the call as read-only', () => {
  it('overlaps two read-only calls of one step', async () => {
    const { host, ctx, model } = await boot();
    const hub = new FakeHub([tool('home_read', () => true)]);
    hub.arrival = (): Promise<void> => bothRunning(hub);
    bindHomeTools(ctx, hub);
    model.script(
      [
        { id: 'r1', name: 'home_read', input: { text: 'a' } },
        { id: 'r2', name: 'home_read', input: { text: 'b' } },
      ],
      'done',
    );

    await ask(host, 'read twice');

    expect(hub.peak).toBe(2);
    expect(resultTexts(model, 1)).toHaveLength(2);
  });

  it('runs mutating calls one at a time in the order the model asked', async () => {
    const { host, ctx, model } = await boot();
    const hub = new FakeHub([tool('device_control', () => false)]);
    bindHomeTools(ctx, hub);
    model.script(
      [
        { id: 'w1', name: 'device_control', input: { text: 'a' } },
        { id: 'w2', name: 'device_control', input: { text: 'b' } },
      ],
      'done',
    );

    await ask(host, 'switch twice');

    expect(hub.peak).toBe(1);
    expect(hub.calls.map((call) => call.callId)).toStrictEqual(['w1', 'w2']);
  });

  it('runs a mutating call alone between read-only calls', async () => {
    const { host, ctx, model } = await boot();
    const hub = new FakeHub([tool('home_read', () => true), tool('device_control', () => false)]);
    hub.arrival = (call): Promise<void> =>
      call.name === 'home_read' && call.callId !== 'r3' ? bothRunning(hub) : Promise.resolve();
    bindHomeTools(ctx, hub);
    model.script(
      [
        { id: 'r1', name: 'home_read', input: {} },
        { id: 'r2', name: 'home_read', input: {} },
        { id: 'w1', name: 'device_control', input: {} },
        { id: 'r3', name: 'home_read', input: {} },
      ],
      'done',
    );

    await ask(host, 'mixed');

    expect(hub.activeAtStart['w1']).toBe(0);
    expect(hub.activeAtStart['r3']).toBe(0);
    expect(hub.calls.map((call) => call.callId)).toStrictEqual(['r1', 'r2', 'w1', 'r3']);
  });

  it('classifies a call by its arguments', async () => {
    const { host, ctx, model } = await boot();
    const hub = new FakeHub([tool('tool_call', (args) => args['text'] === 'safe')]);
    hub.arrival = (call): Promise<void> =>
      call.arguments['text'] === 'safe' ? bothRunning(hub) : Promise.resolve();
    bindHomeTools(ctx, hub);
    model.script(
      [
        { id: 'a', name: 'tool_call', input: { text: 'safe' } },
        { id: 'b', name: 'tool_call', input: { text: 'safe' } },
        { id: 'c', name: 'tool_call', input: { text: 'unsafe' } },
      ],
      'done',
    );

    await ask(host, 'classify');

    expect(hub.peak).toBe(2);
    expect(hub.activeAtStart['c']).toBe(0);
  });
});

describe('home tools keep the caller context and the model-facing result', () => {
  it('passes the calling session, call id, name and arguments to the transport', async () => {
    const { host, ctx, model } = await boot();
    const hub = new FakeHub([tool('home_read', () => true)]);
    bindHomeTools(ctx, hub);
    model.script([{ id: 'c1', name: 'home_read', input: { text: 'hello there' } }], 'done');

    const sessionId = await ask(host, 'read');

    expect(hub.calls).toHaveLength(1);
    expect(hub.calls[0]).toMatchObject({
      sessionId,
      callId: 'c1',
      name: 'home_read',
      arguments: { text: 'hello there' },
    });
    expect(resultTexts(model, 1).join('')).toContain('"echoed":"home_read"');
  });

  it('puts returned pictures into the next model request with a media reference', async () => {
    const { host, ctx, model } = await boot();
    const hub = new FakeHub([tool('camera_snapshot', () => true)]);
    hub.pictures = [{ mediaType: 'image/png', data: PNG }];
    bindHomeTools(ctx, hub);
    model.script([{ id: 'p1', name: 'camera_snapshot', input: {} }], 'done');

    await ask(host, 'look');

    const blocks = (model.requests[1]?.messages ?? [])
      .filter((message) => message.role === 'tool')
      .flatMap((message) => message.content);
    expect(blocks.some((block) => block.type === 'image')).toBe(true);
  });

  it('shows the model the declared tools only', async () => {
    const { host, ctx, model } = await boot();
    const hub = new FakeHub([tool('home_read', () => true), tool('hidden_tool', () => true)]);
    hub.declared = ['home_read'];
    bindHomeTools(ctx, hub);
    model.script('hi');

    await ask(host, 'hello');

    expect(offered(model, 0)).toContain('home_read');
    expect(offered(model, 0)).not.toContain('hidden_tool');
  });

  it('follows a tool list that changes while it is bound and forgets it once unbound', async () => {
    const { host, ctx, model } = await boot();
    const hub = new FakeHub([tool('home_read', () => true)]);
    const unbind = bindHomeTools(ctx, hub);
    hub.replace([tool('home_search', () => true)]);
    hub.declared = ['home_search'];
    model.script('one', 'two');
    const session = await host.runtime.create({
      ...host.sessionOptions(),
      provider: PROVIDER,
      model: 'steps',
    });

    session.text('first');
    await turnsFinished(host, session, 1);
    unbind();
    session.text('second');
    await turnsFinished(host, session, 2);

    expect(offered(model, 0)).toContain('home_search');
    expect(offered(model, 0)).not.toContain('home_read');
    expect(offered(model, 1)).not.toContain('home_search');
  });
});
