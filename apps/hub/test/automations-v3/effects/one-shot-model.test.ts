import { describe, expect, it } from 'vitest';
import type { UsageEntry } from '@smarteverything/domain';
import type { HubTool, HubToolResult } from '../../../src/ai-tools/hub-tool';
import type { ToolCheck } from '../../../src/ai-tools/tool-hub';
import { IntegrationError } from '../../../src/automations/effects/integration-error';
import {
  ONE_SHOT_TOOL_STEPS,
  OneShotModel,
  type OneShotPorts,
  type OneShotRequest,
} from '../../../src/automations/effects/one-shot-model';
import type { ChatRequest } from '../../../src/openrouter/chat-types';
import { OR_CHUNK, type OrChunk } from '../../../src/openrouter/wire';

interface Step {
  readonly text?: string;
  readonly tool?: { readonly name: string; readonly args: string };
  readonly cost?: number;
}

const PROFILE = '11111111-1111-4111-8111-111111111111';

const TOOL: HubTool = {
  name: 'lookup',
  title: 'Lookup',
  description: 'x',
  inputSchema: {},
  annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  origin: { kind: 'se' },
  humanOnly: false,
};

function chunksOf(step: Step, index: number): OrChunk[] {
  const base = { id: `gen-${String(index)}`, model: 'm/x' };
  const delta =
    step.tool === undefined
      ? { content: step.text ?? '' }
      : {
          content: step.text ?? '',
          tool_calls: [
            {
              index: 0,
              id: `call-${String(index)}`,
              function: { name: step.tool.name, arguments: step.tool.args },
            },
          ],
        };
  return [
    OR_CHUNK.parse({ ...base, choices: [{ delta, finish_reason: 'stop' }] }),
    OR_CHUNK.parse({
      ...base,
      choices: [],
      usage: { prompt_tokens: 10, completion_tokens: 5, cost: step.cost ?? 0.001 },
    }),
  ];
}

interface Rig {
  readonly model: OneShotModel;
  readonly requests: ChatRequest[];
  readonly ledger: UsageEntry[];
  readonly toolCalls: Record<string, unknown>[];
  readonly checks: string[];
}

function rig(steps: readonly Step[], options: { readonly stop?: string } = {}): Rig {
  const requests: ChatRequest[] = [];
  const ledger: UsageEntry[] = [];
  const toolCalls: Record<string, unknown>[] = [];
  const checks: string[] = [];
  let next = 0;
  const ports: OneShotPorts = {
    chat: {
      // eslint-disable-next-line @typescript-eslint/require-await
      chat: async function* (request: ChatRequest): AsyncGenerator<OrChunk> {
        requests.push(request);
        const step = steps[next];
        next += 1;
        if (step === undefined) throw new Error('the script ran out');
        yield* chunksOf(step, next);
      },
    },
    catalogue: {
      resolve: () => ({ choice: 'auto', model_id: 'm/x', name: 'X', effort: null }),
    },
    budgets: {
      check: (): void => {
        if (options.stop !== undefined) throw new Error(options.stop);
      },
    },
    ledger: {
      record: (entry): void => {
        ledger.push(entry);
      },
    },
    tools: {
      list: () => [TOOL],
      openAiTools: (set) =>
        set.map((tool) => ({
          type: 'function',
          function: { name: tool.name, description: tool.description, parameters: {} },
        })),
      check: (name): ToolCheck => {
        checks.push(name);
        return { ok: true, tool: TOOL };
      },
      call: (_name, args): Promise<HubToolResult> => {
        toolCalls.push(args);
        return Promise.resolve({ response: { result: { n: 1 } }, line: '', pictures: [] });
      },
    },
  };
  return { model: new OneShotModel(ports), requests, ledger, toolCalls, checks };
}

function request(extra: Partial<OneShotRequest> = {}): OneShotRequest {
  return {
    profileId: PROFILE,
    automationId: 'auto-1',
    role: 'owner',
    system: null,
    prompt: 'Say hi',
    pictures: [],
    shape: null,
    tools: [],
    model: null,
    capUsd: null,
    signal: new AbortController().signal,
    ...extra,
  };
}

async function failure(work: Promise<unknown>): Promise<IntegrationError> {
  const cause = await work.then(
    () => undefined,
    (error: unknown) => error,
  );
  if (!(cause instanceof IntegrationError)) throw new Error('expected an IntegrationError');
  return cause;
}

describe('the one-shot model call', () => {
  it('answers in text and charges the person in the ledger', async () => {
    const { model, ledger, requests } = rig([{ text: 'Hi there', cost: 0.002 }]);
    const answer = await model.ask(request());
    expect(answer).toMatchObject({ text: 'Hi there', result: null, tokens: 15, costUsd: 0.002 });
    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toMatchObject({
      profile_id: PROFILE,
      work: 'chat',
      cost_micros: 2000,
      meta: { automation_id: 'auto-1' },
    });
    expect(ledger[0]).not.toHaveProperty('chat_id');
    expect(requests[0]?.tools).toBeUndefined();
  });

  it('sends pictures as image parts', async () => {
    const { model, requests } = rig([{ text: 'a cat' }]);
    await model.ask(request({ pictures: [{ mimeType: 'image/jpeg', base64: 'QUJD' }] }));
    const content = requests[0]?.messages.at(-1)?.content;
    expect(Array.isArray(content) && content[1]).toMatchObject({
      type: 'image_url',
      image_url: { url: 'data:image/jpeg;base64,QUJD' },
    });
  });

  it('returns the fields of a shape', async () => {
    const { model } = rig([{ text: 'Here: {"mood":"happy","score":3}' }]);
    const answer = await model.ask(request({ shape: { mood: 'text', score: 'number' } }));
    expect(answer.result).toEqual({ mood: 'happy', score: 3 });
  });

  it('asks once more after a wrong shape and then accepts', async () => {
    const { model, requests, ledger } = rig([{ text: '{"mood":1}' }, { text: '{"mood":"calm"}' }]);
    const answer = await model.ask(request({ shape: { mood: 'text' } }));
    expect(answer.result).toEqual({ mood: 'calm' });
    expect(requests).toHaveLength(2);
    expect(requests[1]?.messages.at(-1)?.content).toContain('not usable');
    expect(ledger).toHaveLength(2);
  });

  it('raises Invalid when the second answer is wrong too', async () => {
    const { model } = rig([{ text: 'no json' }, { text: '{"mood":2}' }]);
    const error = await failure(model.ask(request({ shape: { mood: 'text' } })));
    expect(error.kind).toBe('Invalid');
  });

  it('decides yes or no with a reason', async () => {
    const { model } = rig([{ text: '{"answer":false,"reason":"just a cat"}' }]);
    const { shape: _shape, tools: _tools, ...base } = request();
    expect(await model.decide(base)).toMatchObject({ answer: false, reason: 'just a cat' });
  });

  it('refuses before calling the model when the budget is used up', async () => {
    const { model, requests, ledger } = rig([{ text: 'x' }], { stop: 'budget used up' });
    const error = await failure(model.ask(request()));
    expect(error).toMatchObject({ kind: 'Refused', message: 'budget used up' });
    expect(requests).toHaveLength(0);
    expect(ledger).toHaveLength(0);
  });

  it('stops when the call cost more than its cap', async () => {
    const { model } = rig([{ text: 'x', cost: 0.5 }]);
    const error = await failure(model.ask(request({ capUsd: 0.1 })));
    expect(error.kind).toBe('LimitExceeded');
  });
});

describe('tools in a one-shot call', () => {
  it('offers none by default', async () => {
    const { model, requests } = rig([{ text: 'x' }]);
    await model.ask(request());
    expect(requests[0]?.tools).toBeUndefined();
  });

  it('refuses a member who asks for tools', async () => {
    const { model, requests } = rig([{ text: 'x' }]);
    const error = await failure(model.ask(request({ role: 'member', tools: ['lookup'] })));
    expect(error.kind).toBe('Forbidden');
    expect(requests).toHaveLength(0);
  });

  it('refuses a tool the hub does not have', async () => {
    const { model } = rig([{ text: 'x' }]);
    const error = await failure(model.ask(request({ tools: ['missing'] })));
    expect(error.kind).toBe('NotFound');
  });

  it('runs a requested tool as the person and goes on with its result', async () => {
    const { model, requests, toolCalls, checks } = rig([
      { tool: { name: 'lookup', args: '{"q":"a"}' } },
      { text: 'done' },
    ]);
    const answer = await model.ask(request({ tools: ['lookup'] }));
    expect(answer.text).toBe('done');
    expect(toolCalls).toEqual([{ q: 'a' }]);
    expect(checks).toEqual(['lookup']);
    expect(requests[1]?.messages.at(-1)).toMatchObject({
      role: 'tool',
      content: '{"result":{"n":1}}',
    });
  });

  it('gives a broken tool call back to the model instead of failing', async () => {
    const { model, requests } = rig([
      { tool: { name: 'lookup', args: '{broken' } },
      { text: 'ok' },
    ]);
    await model.ask(request({ tools: ['lookup'] }));
    const last = requests[1]?.messages.at(-1)?.content;
    expect(typeof last === 'string' && last).toContain('error');
  });

  it('stops a model that keeps asking for tools', async () => {
    const loop = Array.from({ length: ONE_SHOT_TOOL_STEPS + 1 }, () => ({
      tool: { name: 'lookup', args: '{}' },
    }));
    const { model } = rig(loop);
    const error = await failure(model.ask(request({ tools: ['lookup'] })));
    expect(error.kind).toBe('LimitExceeded');
  });
});
