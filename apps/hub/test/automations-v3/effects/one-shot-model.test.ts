import { afterEach, describe, expect, it, vi } from 'vitest';
import type { HubTool } from '../../../src/ai-tools/hub-tool';
import {
  AgentCancelledError,
  type AgentLaunch,
  type AgentMessage,
  type AgentSession,
  type AgentSpend,
} from '../../../src/automations/effects/dsh-agent';
import { IntegrationError } from '../../../src/automations/effects/integration-error';
import {
  OneShotModel,
  type OneShotPorts,
  type OneShotRequest,
} from '../../../src/automations/effects/one-shot-model';

interface Reply {
  readonly text: string;
  readonly spend?: AgentSpend;
  readonly after?: () => Promise<void>;
  readonly hang?: boolean;
}

function fail(): Promise<void> {
  return Promise.reject(new IntegrationError('Unreachable', 'The AI did not answer'));
}

function sleep(milliseconds: number): () => Promise<void> {
  return () =>
    new Promise<void>((resolve) => {
      setTimeout(resolve, milliseconds);
    });
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

const HUMAN_TOOL: HubTool = { ...TOOL, name: 'secret', humanOnly: true };

const CHEAP: AgentSpend = { tokens: 15, costUsd: 0.002 };

interface Rig {
  readonly model: OneShotModel;
  readonly launches: AgentLaunch[];
  readonly said: AgentMessage[];
  readonly state: { interrupted: number; ended: number };
  readonly emit: (spend: AgentSpend) => void;
}

function rig(replies: readonly Reply[], options: { readonly stop?: string } = {}): Rig {
  const launches: AgentLaunch[] = [];
  const said: AgentMessage[] = [];
  const state = { interrupted: 0, ended: 0 };
  const watchers = new Set<(spend: AgentSpend) => void>();
  const hung = new Set<(cause: Error) => void>();
  let spend: AgentSpend = { tokens: 0, costUsd: 0 };
  let next = 0;
  const emit = (value: AgentSpend): void => {
    spend = value;
    for (const watcher of watchers) watcher(value);
  };
  const session: AgentSession = {
    say: async (message) => {
      said.push(message);
      const reply = replies[next];
      next += 1;
      if (reply === undefined) throw new Error('the script ran out');
      if (reply.spend !== undefined) emit(reply.spend);
      if (reply.hang === true)
        await new Promise<void>((_resolve, reject) => {
          hung.add(reject);
        });
      await reply.after?.();
      return reply.text;
    },
    spent: () => spend,
    onSpend: (listener) => {
      watchers.add(listener);
      return (): void => {
        watchers.delete(listener);
      };
    },
    interrupt: () => {
      state.interrupted += 1;
      for (const release of hung) release(new IntegrationError('Unreachable', 'interrupted'));
      return Promise.resolve();
    },
    end: () => {
      state.ended += 1;
      return Promise.resolve();
    },
  };
  const ports: OneShotPorts = {
    agents: {
      open: (launch) => {
        launches.push(launch);
        return session;
      },
    },
    tools: { list: () => [TOOL, HUMAN_TOOL] },
    budgets: {
      check: (): void => {
        if (options.stop !== undefined) throw new Error(options.stop);
      },
    },
  };
  return { model: new OneShotModel(ports), launches, said, state, emit };
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

async function failure(work: Promise<unknown>): Promise<unknown> {
  return work.then(
    () => undefined,
    (error: unknown) => error,
  );
}

async function integrationFailure(work: Promise<unknown>): Promise<IntegrationError> {
  const cause = await failure(work);
  if (!(cause instanceof IntegrationError)) throw new Error('expected an IntegrationError');
  return cause;
}

afterEach(() => {
  vi.useRealTimers();
});

describe('the one-shot dsh agent call', () => {
  it('answers in text with the spend of the agent and ends the session', async () => {
    const { model, launches, said, state } = rig([{ text: 'Hi there', spend: CHEAP }]);
    const answer = await model.ask(request({ model: 'm/x' }));
    expect(answer).toEqual({ text: 'Hi there', result: null, tokens: 15, costUsd: 0.002 });
    expect(launches).toEqual([
      { profileId: PROFILE, role: 'owner', automationId: 'auto-1', model: 'm/x', tools: [] },
    ]);
    expect(said).toEqual([{ text: 'Say hi', pictures: [] }]);
    expect(state.ended).toBe(1);
  });

  it('puts the system text and the shape instruction before the prompt', async () => {
    const { model, said } = rig([{ text: '{"mood":"happy"}' }]);
    await model.ask(request({ system: 'Be brief.', shape: { mood: 'text' } }));
    const text = said[0]?.text ?? '';
    expect(text.startsWith('Be brief.')).toBe(true);
    expect(text).toContain('mood');
    expect(text.endsWith('Say hi')).toBe(true);
  });

  it('sends the pictures with the first message', async () => {
    const { model, said } = rig([{ text: 'a cat' }]);
    const pictures = [{ mimeType: 'image/jpeg', base64: 'QUJD' }];
    await model.ask(request({ pictures }));
    expect(said[0]?.pictures).toEqual(pictures);
  });

  it('returns the fields of a shape', async () => {
    const { model } = rig([{ text: 'Here: {"mood":"happy","score":3}' }]);
    const answer = await model.ask(request({ shape: { mood: 'text', score: 'number' } }));
    expect(answer.result).toEqual({ mood: 'happy', score: 3 });
  });

  it('asks once more in the same session after a wrong shape and then accepts', async () => {
    const { model, said, launches } = rig([{ text: '{"mood":1}' }, { text: '{"mood":"calm"}' }]);
    const answer = await model.ask(request({ shape: { mood: 'text' } }));
    expect(answer.result).toEqual({ mood: 'calm' });
    expect(launches).toHaveLength(1);
    expect(said).toHaveLength(2);
    expect(said[1]).toMatchObject({ pictures: [] });
    expect(said[1]?.text).toContain('not usable');
  });

  it('raises Invalid when the second answer is wrong too', async () => {
    const { model, state } = rig([{ text: 'no json' }, { text: '{"mood":2}' }]);
    const error = await integrationFailure(model.ask(request({ shape: { mood: 'text' } })));
    expect(error.kind).toBe('Invalid');
    expect(state.ended).toBe(1);
  });

  it('decides yes or no with a reason', async () => {
    const { model } = rig([{ text: '{"answer":false,"reason":"just a cat"}' }]);
    const { shape: _shape, tools: _tools, ...base } = request();
    expect(await model.decide(base)).toMatchObject({ answer: false, reason: 'just a cat' });
  });

  it('refuses before opening a session when the budget is used up', async () => {
    const { model, launches } = rig([{ text: 'x' }], { stop: 'budget used up' });
    const error = await integrationFailure(model.ask(request()));
    expect(error).toMatchObject({ kind: 'Refused', message: 'budget used up' });
    expect(launches).toHaveLength(0);
  });

  it('ends the session when the agent fails', async () => {
    const { model, state } = rig([
      {
        text: 'x',
        after: fail,
      },
    ]);
    const error = await integrationFailure(model.ask(request()));
    expect(error.kind).toBe('Unreachable');
    expect(state.ended).toBe(1);
  });
});

describe('limits of a one-shot dsh agent call', () => {
  it('stops when the call cost more than its cap after the turn', async () => {
    const { model, state } = rig([{ text: 'x', spend: { tokens: 9, costUsd: 0.5 } }]);
    const error = await integrationFailure(model.ask(request({ capUsd: 0.1 })));
    expect(error.kind).toBe('LimitExceeded');
    expect(state.ended).toBe(1);
  });

  it('interrupts the agent the moment its spend passes the cap', async () => {
    const { model, state, said, emit } = rig([{ text: 'late', hang: true }]);
    const pending = integrationFailure(model.ask(request({ capUsd: 0.1 })));
    await vi.waitFor(() => {
      expect(said).toHaveLength(1);
    });
    emit({ tokens: 100, costUsd: 0.4 });
    const error = await pending;
    expect(error.kind).toBe('LimitExceeded');
    expect(state.interrupted).toBe(1);
    expect(state.ended).toBe(1);
  });

  it('has no step cap and no time cap of its own', async () => {
    vi.useFakeTimers();
    const tenHours = 10 * 60 * 60_000;
    const { model, state } = rig([
      {
        text: 'finally',
        after: sleep(tenHours),
      },
    ]);
    const pending = model.ask(request());
    await vi.advanceTimersByTimeAsync(tenHours);
    expect(await pending).toMatchObject({ text: 'finally' });
    expect(state.interrupted).toBe(0);
  });

  it('cancels the agent when the automation run is cancelled', async () => {
    const run = new AbortController();
    const { model, state } = rig([{ text: 'never', hang: true }]);
    const pending = model.ask(request({ signal: run.signal }));
    run.abort();
    expect(await failure(pending)).toBeInstanceOf(AgentCancelledError);
    expect(state.interrupted).toBe(1);
    expect(state.ended).toBe(1);
  });

  it('does not start an agent for a run that is already cancelled', async () => {
    const run = new AbortController();
    run.abort();
    const { model, launches } = rig([{ text: 'x' }]);
    expect(await failure(model.ask(request({ signal: run.signal })))).toBeInstanceOf(
      AgentCancelledError,
    );
    expect(launches).toHaveLength(0);
  });

  it('honours a timeout the automation defines by cancelling through the run signal', async () => {
    vi.useFakeTimers();
    const run = new AbortController();
    const { model, state } = rig([{ text: 'never', hang: true }]);
    setTimeout(() => {
      run.abort();
    }, 5_000);
    const pending = failure(model.ask(request({ signal: run.signal })));
    await vi.advanceTimersByTimeAsync(5_000);
    expect(await pending).toBeInstanceOf(AgentCancelledError);
    expect(state.interrupted).toBe(1);
  });
});

describe('tools in a one-shot call', () => {
  it('opens the agent with no tools by default', async () => {
    const { model, launches } = rig([{ text: 'x' }]);
    await model.ask(request());
    expect(launches[0]?.tools).toEqual([]);
  });

  it('refuses a member who asks for tools', async () => {
    const { model, launches } = rig([{ text: 'x' }]);
    const error = await integrationFailure(
      model.ask(request({ role: 'member', tools: ['lookup'] })),
    );
    expect(error.kind).toBe('Forbidden');
    expect(launches).toHaveLength(0);
  });

  it('refuses a tool the hub does not have or only a person may use', async () => {
    const { model, launches } = rig([{ text: 'x' }]);
    const missing = await integrationFailure(model.ask(request({ tools: ['missing'] })));
    const human = await integrationFailure(model.ask(request({ tools: ['secret'] })));
    expect(missing.kind).toBe('NotFound');
    expect(human.kind).toBe('NotFound');
    expect(launches).toHaveLength(0);
  });

  it('gives the owner the tools the step names', async () => {
    const { model, launches } = rig([{ text: 'done' }]);
    const answer = await model.ask(request({ tools: ['lookup'] }));
    expect(answer.text).toBe('done');
    expect(launches[0]?.tools).toEqual(['lookup']);
  });
});
