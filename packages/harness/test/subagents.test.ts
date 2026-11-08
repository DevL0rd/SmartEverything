import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Context } from '@deepseek-ai/cordis';
import Subagent from '@deepseek-ai/dsh-subagent';
import { SESSION_FORMAT_VERSION, SessionId } from '@deepseek-ai/dsh-session';
import { nativeEvents } from '../src/persistence/validation';
import { AI_AGENT_LOOP_SETTINGS } from '@smarteverything/domain';
import type { z } from 'zod';
import { bindAgentLoopSettings } from '../src/plugins/goals';
import {
  SUBAGENT_MODEL_POLICY_EVENT,
  SUBAGENT_MODELS_TOOL,
  SUBAGENT_TOOL_NAMES,
  type SubagentModelRoute,
} from '../src/plugins/subagents';
import { bootRuntime, spoken, turnsFinished } from './support/runtime';
import type { RuntimeFixture } from './support/runtime';
import { StoredSession } from './support/memory-persistence';
import { SCRIPTED_MODEL, SCRIPTED_PROVIDER } from './support/scripted-model';

let fixture: RuntimeFixture | undefined;
let anchor: Context | undefined;
afterEach(async () => {
  await fixture?.dispose();
  fixture = undefined;
  anchor = undefined;
});

async function boot(): Promise<RuntimeFixture> {
  fixture = await bootRuntime({
    mount: (ctx) => {
      anchor = ctx;
    },
  });
  await vi.waitFor(() => {
    expect(anchor?.get('subagents')?.getProvider('spawn')?.name).toBe('spawn');
    expect(anchor?.get('subagents')?.getProvider('fork')?.name).toBe('fork');
  });
  return fixture;
}

function settings(
  subagents: z.input<typeof AI_AGENT_LOOP_SETTINGS>['subagents'],
): z.output<typeof AI_AGENT_LOOP_SETTINGS> {
  return AI_AGENT_LOOP_SETTINGS.parse({ subagents });
}

function toolNames(host: RuntimeFixture, request: number): readonly string[] {
  return (host.model.requests[request]?.tools ?? []).map((tool) => tool.name);
}

function delegation(depth: number): Record<string, unknown> {
  return { description: `level ${String(depth)}`, prompt: 'Do the focused part and report.' };
}

describe('the subagent stack', () => {
  it('offers the delegation and control tools to the model', async () => {
    const host = await boot();
    host.model.script({ kind: 'text', text: 'hello' });
    const session = await host.runtime.create(host.sessionOptions());
    session.text('hi');
    await turnsFinished(host, session, 1);

    expect(toolNames(host, 0)).toEqual(expect.arrayContaining([...SUBAGENT_TOOL_NAMES]));
  });

  it('runs a delegated child as its own session that remembers its parent', async () => {
    const host = await boot();
    host.model.script(
      { kind: 'tool', id: 'd1', name: 'subagent', input: delegation(1) },
      { kind: 'text', text: 'working' },
      { kind: 'text', text: 'finished' },
      { kind: 'text', text: 'summary' },
    );
    const options = host.sessionOptions();
    const session = await host.runtime.create(options);
    session.text('delegate something');

    await vi.waitFor(() => {
      const children = [...host.persistence.sessions.values()].filter(
        (stored) => stored.header.origin === 'subagent',
      );
      expect(children).toHaveLength(1);
      expect(children[0]?.header.parentSession).toBe(options.sessionId);
    });
    await vi.waitFor(() => {
      expect(host.model.requests).toHaveLength(4);
    });
  });

  it('starts no child session for a working directory that does not exist', async () => {
    const host = await boot();
    host.model.script(
      {
        kind: 'tool',
        id: 'd1',
        name: 'subagent',
        input: { ...delegation(1), cwd: '/nonexistent/garbled' },
      },
      { kind: 'text', text: 'it failed' },
    );
    const session = await host.runtime.create(host.sessionOptions());
    session.text('delegate something');
    await turnsFinished(host, session, 1);

    const children = [...host.persistence.sessions.values()].filter(
      (stored) => stored.header.origin === 'subagent',
    );
    expect(children).toHaveLength(0);
    expect(JSON.stringify(spoken(host.model.requests[1]?.messages ?? []))).toContain(
      'working directory does not exist: \\"/nonexistent/garbled\\"',
    );
  });

  it('refuses a delegation deeper than the depth from the settings', async () => {
    const host = await boot();
    if (anchor === undefined) throw new Error('The test mount did not run.');
    await bindAgentLoopSettings(anchor, settings({ max_depth: 0 }));
    host.model.script(
      { kind: 'tool', id: 'd1', name: 'subagent', input: delegation(1) },
      { kind: 'text', text: 'done' },
    );
    const session = await host.runtime.create(host.sessionOptions());
    session.text('delegate something');
    await turnsFinished(host, session, 1);

    const result = host.model.requests[1]?.messages.at(-1);
    expect(spoken(result === undefined ? [] : [result])[0]?.text.toLowerCase()).toContain('depth');
    expect([...host.persistence.sessions.values()]).toHaveLength(1);
  });

  it('refuses a child beyond the active capacity from the settings without restarting the service', async () => {
    const host = await boot();
    if (anchor === undefined) throw new Error('The test mount did not run.');
    const mounted = [...(anchor.root.registry.get(Subagent)?.fibers ?? [])][0];
    await bindAgentLoopSettings(anchor, settings({ max_active: 1 }));
    await vi.waitFor(() => {
      expect(anchor?.get('subagents')?.getProvider('spawn')?.name).toBe('spawn');
    });
    const service = anchor.get('subagents');
    expect(mounted).toBeDefined();
    expect([...(anchor.root.registry.get(Subagent)?.fibers ?? [])][0] === mounted).toBe(true);
    host.model.script({ kind: 'hang' }, { kind: 'hang' });
    const options = host.sessionOptions();
    await host.runtime.create(options);
    const parent = anchor.get('agents')?.get(SessionId(options.sessionId));
    if (parent === undefined || service === undefined) throw new Error('The parent is missing.');
    const start = (label: string): ReturnType<typeof service.startActivation> =>
      service.startActivation({
        provider: 'spawn',
        label,
        request: {
          parent,
          prompt: [{ type: 'text', text: label }],
        },
        signal: new AbortController().signal,
        delivery: 'caller',
      });

    const first = await start('first');
    await expect(start('second')).rejects.toMatchObject({ code: 'ACTIVATION_LIMIT_REACHED' });
    await first.dispose();
  });
});

describe('a delegated child reporting to its parent', () => {
  it('lists the child it started and delivers the child report into the parent session', async () => {
    const host = await boot();
    const options = host.sessionOptions();
    let parentCalls = 0;
    let childCalls = 0;
    host.model.guard = (request): void => {
      const own = spoken(request.messages)
        .map((message) => message.text)
        .join('\n');
      if (own.includes('Your parent agent id')) {
        childCalls += 1;
        host.model.script(
          childCalls === 1
            ? {
                kind: 'tool',
                id: 'r1',
                name: 'send_message',
                input: { agent_id: options.sessionId, message: 'REPORT first heading found' },
              }
            : { kind: 'text', text: 'finished' },
        );
        return;
      }
      parentCalls += 1;
      if (parentCalls === 1)
        host.model.script({ kind: 'tool', id: 'd1', name: 'subagent', input: delegation(1) });
      else if (parentCalls === 2)
        host.model.script({ kind: 'tool', id: 'l1', name: 'list_agents', input: {} });
      else host.model.script({ kind: 'text', text: 'noted' });
    };
    const session = await host.runtime.create(options);
    session.text('delegate something');

    await vi.waitFor(() => {
      expect(
        host.model.requests.some((request) =>
          spoken(request.messages).some((message) => message.text.includes('REPORT first heading')),
        ),
      ).toBe(true);
    });
    const children = [...host.persistence.sessions.values()].filter(
      (stored) => stored.header.origin === 'subagent',
    );
    expect(children).toHaveLength(1);
    const listing = host.model.requests
      .flatMap((request) => spoken(request.messages))
      .filter((message) => message.role === 'tool')
      .map((message) => message.text);
    const listed = listing.find((text) => text.includes(children[0]?.header.id ?? 'missing'));
    expect(listed).toBeDefined();
    expect(listing.join('\n')).not.toContain('sessionQuery');
  });
});

const SMALL_MODEL = 'scripted-small';

function openWithModels(
  host: RuntimeFixture,
  routes: readonly SubagentModelRoute[],
): ReturnType<RuntimeFixture['sessionOptions']> {
  const options = host.sessionOptions();
  const stored = new StoredSession(
    {
      version: SESSION_FORMAT_VERSION,
      id: SessionId(options.sessionId),
      createdAt: Date.now(),
      cwd: options.directory,
      isSeeded: false,
      agentPreset: 'smarteverything',
    },
    0,
  );
  stored.events.push(
    ...nativeEvents(stored.header, [
      {
        type: SUBAGENT_MODEL_POLICY_EVENT,
        seq: 0,
        time: Date.now(),
        data: { allowedModels: routes.map(({ provider, model }) => ({ provider, model })) },
      },
    ]),
  );
  host.persistence.sessions.set(options.sessionId, stored);
  return options;
}

function children(host: RuntimeFixture): readonly StoredSession[] {
  return [...host.persistence.sessions.values()].filter(
    (stored) => stored.header.origin === 'subagent',
  );
}

const BOTH: readonly SubagentModelRoute[] = [
  { provider: SCRIPTED_PROVIDER, model: SCRIPTED_MODEL },
  { provider: SCRIPTED_PROVIDER, model: SMALL_MODEL },
];

describe('choosing the model of a helper', () => {
  it('offers no model choice in a chat the hub gave no models', async () => {
    const host = await boot();
    host.model.script({ kind: 'text', text: 'hello' });
    const session = await host.runtime.create(host.sessionOptions());
    session.text('hi');
    await turnsFinished(host, session, 1);

    expect(toolNames(host, 0)).not.toContain(SUBAGENT_MODELS_TOOL);
  });

  it('runs the child on the model the parent chose from the models it may use', async () => {
    const host = await boot();
    host.model.script(
      {
        kind: 'tool',
        id: 'd1',
        name: 'subagent',
        input: { ...delegation(1), provider: SCRIPTED_PROVIDER, model: SMALL_MODEL },
      },
      { kind: 'text', text: 'working' },
      { kind: 'text', text: 'finished' },
      { kind: 'text', text: 'summary' },
    );
    const session = await host.runtime.resume(openWithModels(host, BOTH));
    session.text('delegate something');

    await vi.waitFor(() => {
      expect(host.model.requests.map((request) => request.model)).toContain(SMALL_MODEL);
    });
    expect(toolNames(host, 0)).toContain(SUBAGENT_MODELS_TOOL);
    expect(host.model.requests[0]?.model).toBe(SCRIPTED_MODEL);
    expect(children(host)).toHaveLength(1);
  });

  it('refuses a model the parent may not use and starts no child', async () => {
    const host = await boot();
    host.model.script(
      {
        kind: 'tool',
        id: 'd1',
        name: 'subagent',
        input: { ...delegation(1), provider: SCRIPTED_PROVIDER, model: 'scripted-forbidden' },
      },
      { kind: 'text', text: 'done' },
    );
    const session = await host.runtime.resume(
      openWithModels(host, [{ provider: SCRIPTED_PROVIDER, model: SCRIPTED_MODEL }]),
    );
    session.text('delegate something');
    await turnsFinished(host, session, 1);

    const result = host.model.requests[1]?.messages.at(-1);
    expect(spoken(result === undefined ? [] : [result])[0]?.text).toContain('not allowed');
    expect(children(host)).toHaveLength(0);
  });

  it('gives the child the parent model when the parent names none', async () => {
    const host = await boot();
    host.model.script(
      { kind: 'tool', id: 'd1', name: 'subagent', input: delegation(1) },
      { kind: 'text', text: 'working' },
      { kind: 'text', text: 'finished' },
      { kind: 'text', text: 'summary' },
    );
    const session = await host.runtime.resume(openWithModels(host, BOTH));
    session.text('delegate something');

    await vi.waitFor(() => {
      expect(host.model.requests).toHaveLength(4);
    });
    expect(children(host)).toHaveLength(1);
    expect(new Set(host.model.requests.map((request) => request.model))).toEqual(
      new Set([SCRIPTED_MODEL]),
    );
  });
});
