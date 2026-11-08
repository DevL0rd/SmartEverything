import { afterEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { Context } from '@deepseek-ai/cordis';
import { ReasoningEffortId } from '@deepseek-ai/dsh-llm';
import type { LlmResolvedModelInfo } from '@deepseek-ai/dsh-llm';
import { AuxCompletions, completeAux } from '../src/plugins/aux-completions';
import type { AuxCompletionRequest } from '../src/plugins/aux-completions';
import { bootRuntime } from './support/runtime';
import type { RuntimeFixture } from './support/runtime';
import { SCRIPTED_MODEL, SCRIPTED_PROVIDER } from './support/scripted-model';

let fixture: RuntimeFixture | undefined;
afterEach(async () => {
  await fixture?.dispose();
  fixture = undefined;
});

async function boot(): Promise<{ readonly host: RuntimeFixture; readonly ctx: Context }> {
  let captured: Context | undefined;
  fixture = await bootRuntime({
    mount: (ctx) => {
      captured = ctx;
    },
  });
  if (captured === undefined) throw new Error('The runtime never mounted the test route.');
  return { host: fixture, ctx: captured };
}

function auxiliary(ctx: Context): AuxCompletions {
  const service = ctx.get('auxCompletions');
  if (!(service instanceof AuxCompletions))
    throw new Error('Auxiliary completions are not mounted.');
  return service;
}

function request(sessionId = randomUUID()): AuxCompletionRequest {
  return {
    provider: SCRIPTED_PROVIDER,
    model: SCRIPTED_MODEL,
    sessionId,
    system: 'You name conversations.',
    input: 'Person: hello\nAI: hi',
  };
}

describe('auxiliary completions', () => {
  it('returns the model text and sends the system text, input and session once', async () => {
    const { host, ctx } = await boot();
    host.model.script({ kind: 'text', text: 'Greeting chat' });
    const sessionId = randomUUID();

    const text = await auxiliary(ctx).complete({
      ...request(sessionId),
      purpose: 'session-title',
    });

    expect(text).toBe('Greeting chat');
    expect(host.model.requests).toHaveLength(1);
    expect(host.model.requests[0]).toMatchObject({
      provider: SCRIPTED_PROVIDER,
      model: SCRIPTED_MODEL,
      system: 'You name conversations.',
      sessionId,
      purpose: 'session-title',
      messages: [{ role: 'user', content: [{ type: 'text', text: 'Person: hello\nAI: hi' }] }],
    });
    expect(host.model.requests[0]).not.toHaveProperty('maxTokens');
    expect(host.model.requests[0]).not.toHaveProperty('reasoningEffort');
  });

  it('asks for the least reasoning effort the route supports', async () => {
    const { host, ctx } = await boot();
    host.model.script({ kind: 'text', text: 'ok' });
    host.model.resolveModel = (provider, model): Promise<LlmResolvedModelInfo> =>
      Promise.resolve({
        provider,
        id: model,
        name: model,
        reasoning: {
          efforts: [
            { id: ReasoningEffortId('none'), name: 'None' },
            { id: ReasoningEffortId('high'), name: 'High' },
          ],
        },
      });

    await auxiliary(ctx).complete(request());

    expect(host.model.requests[0]?.reasoningEffort).toBe('none');
  });

  it('sends the effort the caller names and none at all when the caller names no effort', async () => {
    const { host, ctx } = await boot();
    host.model.script({ kind: 'text', text: 'a' }, { kind: 'text', text: 'b' });
    host.model.resolveModel = (provider, model): Promise<LlmResolvedModelInfo> =>
      Promise.resolve({
        provider,
        id: model,
        name: model,
        reasoning: { efforts: [{ id: ReasoningEffortId('high'), name: 'High' }] },
      });

    await auxiliary(ctx).complete({ ...request(), effort: 'high' });
    await auxiliary(ctx).complete({ ...request(), effort: null });

    expect(host.model.requests[0]?.reasoningEffort).toBe('high');
    expect(host.model.requests[1]).not.toHaveProperty('reasoningEffort');
  });

  it('completes through the context without naming the service', async () => {
    const { host, ctx } = await boot();
    host.model.script({ kind: 'text', text: 'Garden lights' });

    await expect(completeAux(ctx, request())).resolves.toBe('Garden lights');
  });

  it('fails with the model failure instead of returning partial text', async () => {
    const { host, ctx } = await boot();
    host.model.script({
      kind: 'fail',
      failure: { message: 'The supplier refused the call.', code: 'AUTH' },
    });

    await expect(auxiliary(ctx).complete(request())).rejects.toMatchObject({
      message: 'The supplier refused the call.',
      code: 'AUTH',
    });
  });

  it('stops when the caller cancels', async () => {
    const { host, ctx } = await boot();
    host.model.script({ kind: 'hang' });
    const controller = new AbortController();

    const pending = auxiliary(ctx).complete(request(), controller.signal);
    controller.abort(new Error('stopped'));

    await expect(pending).rejects.toThrow();
  });
});
