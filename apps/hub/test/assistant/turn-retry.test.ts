import { afterEach, describe, expect, it } from 'vitest';
import { failure, type HubTool, type ToolSource } from '../../src/ai-tools/hub-tool';
import { ToolHub } from '../../src/ai-tools/tool-hub';
import { runLoop, type LoopInput } from '../../src/assistant/engines/openrouter/turn-loop';
import { TurnStream } from '../../src/assistant/engines/openrouter/stream';
import type { ChatChunk, ChatRequest } from '../../src/openrouter/chat-types';
import { openRouterError } from '../../src/openrouter/errors';
import { TurnAccumulator } from '../../src/openrouter/turn';

let stream: TurnStream | null = null;

afterEach(() => {
  stream?.close();
  stream = null;
});

type Script = (call: number, request: ChatRequest) => AsyncIterable<ChatChunk>;

const ANSWER: readonly ChatChunk[] = [
  { type: 'start', generationId: 'gen-1', model: 'openai/gpt-6-luna' },
  { type: 'text', text: 'All done.' },
  { type: 'finish', reason: 'stop' },
];

async function* chunks(list: readonly ChatChunk[]): AsyncIterable<ChatChunk> {
  await Promise.resolve();
  yield* list;
}

function unreachable(): AsyncIterable<ChatChunk> {
  return {
    [Symbol.asyncIterator]: (): AsyncIterator<ChatChunk> => ({
      next: (): Promise<IteratorResult<ChatChunk>> =>
        Promise.reject(openRouterError('unavailable', 'couldn’t reach OpenRouter: fetch failed')),
    }),
  };
}

function toolCallChunks(id: string, args: string): readonly ChatChunk[] {
  return [
    { type: 'start', generationId: `gen-${id}`, model: 'openai/gpt-6-luna' },
    { type: 'tool_call', index: 0, id, name: 'read_claude', arguments: args },
    { type: 'finish', reason: 'tool_calls' },
  ];
}

interface Harness {
  readonly requests: ChatRequest[];
  readonly retries: string[];
  readonly lines: string[];
  readonly failures: string[];
  readonly run: Promise<unknown>;
}

function harness(script: Script, hub: ToolHub | null = null, signal?: AbortSignal): Harness {
  const requests: ChatRequest[] = [];
  const retries: string[] = [];
  const lines: string[] = [];
  const failures: string[] = [];
  stream = new TurnStream(
    { chatId: 'chat', turnId: 'turn', messageId: null, profileId: 'profile' },
    () => undefined,
  );
  const input: LoopInput = {
    client: {
      chat: (request): AsyncIterable<ChatChunk> => {
        requests.push(request);
        return script(requests.length, request);
      },
    },
    newTurn: () => new TurnAccumulator(),
    model: {
      choice: 'openai/gpt-6-luna',
      model_id: 'openai/gpt-6-luna',
      name: 'Luna',
      effort: null,
    },
    messages: [{ role: 'user', content: 'Hi' }],
    tools:
      hub === null
        ? []
        : [
            {
              type: 'function',
              function: { name: 'read_claude', description: '', parameters: {} },
            },
          ],
    hub,
    caller: { profileId: 'profile', role: 'owner', chatId: 'chat', via: 'chat', clientId: null },
    images: { model: 'openai/gpt-6-luna', allowed: false },
    work: 'chat',
    signal: signal ?? new AbortController().signal,
    hooks: {
      stream,
      text: (): void => undefined,
      toolLine: (line): void => {
        lines.push(line);
      },
      toolFailed: (tool, reason): void => {
        failures.push(`${tool}: ${reason}`);
      },
      usage: (): void => undefined,
      retried: (reason): void => {
        retries.push(reason);
      },
    },
  };
  return { requests, retries, lines, failures, run: runLoop(input) };
}

const READ_CLAUDE: HubTool = {
  name: 'read_claude',
  title: 'Read Claude',
  description: 'Claude sessions',
  inputSchema: {},
  annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  origin: { kind: 'se' },
  humanOnly: false,
};

function hubRefusing(): { readonly hub: ToolHub; readonly calls: unknown[] } {
  const calls: unknown[] = [];
  const source: ToolSource = {
    tools: () => [READ_CLAUDE],
    call: (_tool, args) => {
      calls.push(args);
      return Promise.resolve(
        failure('invalid_request: view sessions does not take sessionId; it takes fields: state'),
      );
    },
    validate: () => null,
    changes: () => () => undefined,
  };
  return { hub: new ToolHub([source]), calls };
}

describe('a transient provider failure before any answer', () => {
  it('is retried once and the second answer is used', async () => {
    const run = harness((call) => (call === 1 ? unreachable() : chunks(ANSWER)));
    await expect(run.run).resolves.toMatchObject({ text: 'All done.' });
    expect(run.requests).toHaveLength(2);
    expect(run.retries).toEqual([
      'OpenRouter or the model’s provider is unavailable right now (couldn’t reach OpenRouter: fetch failed).',
    ]);
  });

  it('is surfaced after one retry when the provider is still down', async () => {
    const run = harness(() => unreachable());
    await expect(run.run).rejects.toThrow('couldn’t reach OpenRouter: fetch failed');
    expect(run.requests).toHaveLength(2);
    expect(run.retries).toHaveLength(1);
  });

  it('is not retried once part of the answer has streamed', async () => {
    async function* cut(): AsyncIterable<ChatChunk> {
      await Promise.resolve();
      yield { type: 'start', generationId: 'gen-9', model: 'openai/gpt-6-luna' };
      yield { type: 'text', text: 'Half an' };
      throw openRouterError('unavailable', 'the answer stopped before it finished');
    }
    const run = harness(() => cut());
    await expect(run.run).rejects.toThrow('the answer stopped before it finished');
    expect(run.requests).toHaveLength(1);
    expect(run.retries).toEqual([]);
  });

  it('is not retried when the key or the request is wrong', async () => {
    function refused(): AsyncIterable<ChatChunk> {
      return {
        [Symbol.asyncIterator]: (): AsyncIterator<ChatChunk> => ({
          next: (): Promise<IteratorResult<ChatChunk>> =>
            Promise.reject(openRouterError('bad_request', 'No endpoints support tool use', 400)),
        }),
      };
    }
    const run = harness(() => refused());
    await expect(run.run).rejects.toThrow('No endpoints support tool use');
    expect(run.requests).toHaveLength(1);
  });

  it('is not retried after the person stopped the turn', async () => {
    const stop = new AbortController();
    stop.abort();
    const run = harness(() => unreachable(), null, stop.signal);
    await expect(run.run).rejects.toThrow('couldn’t reach OpenRouter');
    expect(run.requests).toHaveLength(1);
  });
});

describe('a tool call the hub refused for its arguments', () => {
  it('is answered from the first refusal when the model repeats it exactly', async () => {
    const { hub, calls } = hubRefusing();
    const run = harness((call, request) => {
      if (call <= 3) {
        return chunks(
          toolCallChunks(`call-${String(call)}`, '{"view":"sessions","sessionId":null}'),
        );
      }
      expect(request.messages.length).toBeGreaterThan(4);
      return chunks(ANSWER);
    }, hub);
    await run.run;
    expect(calls).toHaveLength(1);
    const toolAnswers = run.requests
      .at(-1)
      ?.messages.filter((message) => message.role === 'tool')
      .map((message) => JSON.stringify(message.content));
    expect(toolAnswers?.[1]).toContain('You already sent this exact call in this turn');
    expect(toolAnswers?.[1]).toContain('view sessions does not take sessionId');
  });

  it('still runs a changed call', async () => {
    const { hub, calls } = hubRefusing();
    const run = harness(
      (call) =>
        call <= 2
          ? chunks(
              toolCallChunks(`call-${String(call)}`, `{"view":"sessions","limit":${String(call)}}`),
            )
          : chunks(ANSWER),
      hub,
    );
    await run.run;
    expect(calls).toHaveLength(2);
  });
});

const LOG_FOOD: HubTool = {
  ...READ_CLAUDE,
  name: 'read_claude',
  title: 'Log food or water',
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
};

describe('a failed tool call that changes things', () => {
  it('writes no chat row, keeps the failed step, logs it and tells the model', async () => {
    const source: ToolSource = {
      tools: () => [LOG_FOOD],
      call: () =>
        Promise.resolve(
          failure('invalid_request: The arguments are not valid: food expected object'),
        ),
      validate: () => null,
      changes: () => () => undefined,
    };
    const run = harness(
      (call) => (call === 1 ? chunks(toolCallChunks('call-1', '{"food":"x"}')) : chunks(ANSWER)),
      new ToolHub([source]),
    );
    await run.run;
    expect(run.lines).toEqual([]);
    expect(run.failures).toEqual([
      'read_claude: invalid_request: The arguments are not valid: food expected object',
    ]);
    expect(stream?.settled().map((step) => step.outcome)).toEqual(['failed']);
    const answered = run.requests
      .at(-1)
      ?.messages.filter((message) => message.role === 'tool')
      .map((message) => JSON.stringify(message.content));
    expect(answered?.[0]).toContain('The arguments are not valid: food expected object');
  });

  it('still writes the action row when the call worked', async () => {
    const source: ToolSource = {
      tools: () => [LOG_FOOD],
      call: () =>
        Promise.resolve({ response: { result: 'ok' }, line: 'Log food or water', pictures: [] }),
      validate: () => null,
      changes: () => () => undefined,
    };
    const run = harness(
      (call) => (call === 1 ? chunks(toolCallChunks('call-1', '{}')) : chunks(ANSWER)),
      new ToolHub([source]),
    );
    await run.run;
    expect(run.lines).toEqual(['Log food or water']);
    expect(run.failures).toEqual([]);
  });
});
