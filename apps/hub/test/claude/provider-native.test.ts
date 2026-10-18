import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  CanUseTool,
  ModelInfo,
  Query,
  SDKResultMessage,
} from '@anthropic-ai/claude-agent-sdk';
import { PROVIDER_TURN, type ProviderControl, type ProviderTurn } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { ProviderCommandCatalogue } from '../../src/claude/provider/command-catalogue';
import { configurationOptions } from '../../src/claude/provider/configured-options';
import { controlProvider, type ProviderControlTarget } from '../../src/claude/provider/control';
import { resultEvents } from '../../src/claude/provider/events';
import { ProviderInputError, userMessageOf } from '../../src/claude/provider/input';
import { jobOptions } from '../../src/claude/provider/job-options';
import { modelOptions } from '../../src/claude/provider/options';
import { ProviderPrompts } from '../../src/claude/provider/prompts';
import type { ProviderDialogs } from '../../src/claude/provider/dialogs';
import type { ProviderTools } from '../../src/claude/provider/tools';
import { agentDefinitions } from '../../src/claude/provider/agents';
import { captureLogs } from '../support/logs';

const JOB = '6b6e4f0e-2d6c-4f54-9d3a-0a4a4f5c7d11';
const CHAT = '0f9a8c1e-7a3b-4d77-8d5e-3b0f6f7a2c10';
const DEVICE = '3c1d5a52-9a0e-4b0d-8f0b-7f2b1f6d4e90';
const PROFILE = 'a2c8d0aa-52a4-4c87-8c33-0c6e5e3d9b21';

function turn(change: Partial<ProviderTurn> = {}): ProviderTurn {
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
    ...change,
  });
}

function model(change: Partial<ModelInfo> = {}): ModelInfo {
  return { value: 'sonnet', displayName: 'Sonnet', description: 'Sonnet', ...change };
}

// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- partial fakes of SDK objects that only expose what the code under test reads
function loose<T>(value: object): T {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return -- same partial fake
  return Object.assign(Object.create(null), value);
}

function fakeQuery(): { readonly query: Query; readonly calls: string[] } {
  const calls: string[] = [];
  const query = loose<Query>({
    setPermissionMode: (mode: string): Promise<void> => {
      calls.push(`setPermissionMode:${mode}`);
      return Promise.resolve();
    },
    setModel: (model: string): Promise<void> => {
      calls.push(`setModel:${model}`);
      return Promise.resolve();
    },
  });
  return { query, calls };
}

function target(query: Query): ProviderControlTarget {
  return {
    query,
    setMcpServers: () => Promise.resolve(null),
    cwd: '/work',
    session: 'session',
    stop: vi.fn(),
    owns: () => true,
    remember: () => Promise.resolve(),
  };
}

afterEach(() => {
  Logger.reset();
});

describe('native command catalogue', () => {
  function catalogue(): ProviderCommandCatalogue {
    const value = new ProviderCommandCatalogue();
    Reflect.set(value, 'initialized', true);
    Reflect.set(value, 'terminal', new Set(['vim']));
    Reflect.set(value, 'commands', [
      { name: 'compact', description: 'Compact', argumentHint: '[focus]', builtin: true },
      { name: 'clear', description: 'Clear', argumentHint: '', builtin: true },
      { name: 'model', description: 'Model', argumentHint: '', builtin: true },
      { name: 'vim', description: 'Vim', argumentHint: '', builtin: true },
      { name: 'review', description: 'Review a PR', argumentHint: '<pr>' },
    ]);
    return value;
  }

  it('lists compact and custom commands as enabled and hides terminal-only commands', () => {
    const rows = catalogue().descriptors();
    expect(rows.map((row) => row.name)).toEqual(['compact', 'clear', 'model', 'review']);
    const enabled = rows.filter((row) => row.enabled).map((row) => row.name);
    expect(enabled).toEqual(['compact', 'review']);
  });

  it('explains why session and option commands stay with the owned controls', () => {
    const rows = catalogue().descriptors();
    expect(rows.find((row) => row.name === 'clear')?.unavailable_reason).toContain(
      'session ownership',
    );
    expect(rows.find((row) => row.name === 'model')?.unavailable_reason).toContain(
      'settings/control',
    );
  });

  it('refuses a selection made against a stale catalogue revision', () => {
    const value = catalogue();
    const compact = value.descriptors()[0];
    expect(compact).toBeDefined();
    expect(() => value.select(compact?.definition_id ?? '', 'stale')).toThrow(ProviderInputError);
    expect(value.select(compact?.definition_id ?? '', value.revision).name).toBe('compact');
  });
});

describe('prompts answered from the app', () => {
  const context = loose<Parameters<CanUseTool>[2]>({
    signal: new AbortController().signal,
    toolUseID: 'tool-1',
  });

  function prompts(): {
    readonly broker: ProviderPrompts;
    readonly seen: string[];
    readonly ids: string[];
  } {
    captureLogs();
    const seen: string[] = [];
    const ids: string[] = [];
    const broker = new ProviderPrompts(new Logger('hub.claude'), (prompt) => {
      seen.push(`${prompt.kind}:${prompt.state}`);
      ids.push(prompt.id);
    });
    return { broker, seen, ids };
  }

  it('turns an AskUserQuestion into a question prompt and returns the chosen answers', async () => {
    const { broker, seen, ids } = prompts();
    const ask = broker.callback(() => 'session');
    const input = {
      questions: [
        {
          question: 'Which database?',
          header: 'DB',
          multiSelect: false,
          options: [{ label: 'SQLite' }, { label: 'Postgres' }],
        },
      ],
    };
    const pending = ask('AskUserQuestion', input, context);
    await vi.waitFor(() => {
      expect(seen).toContain('question:waiting');
    });
    const id = ids[0] ?? '';
    expect(
      broker.answer(id, { decision: 'question', answers: { 'Which database?': 'SQLite' } }),
    ).toBe(true);
    expect(await pending).toMatchObject({ behavior: 'allow' });
    broker.stop();
  });

  it('denies a permission request the user declines', async () => {
    const { broker, seen, ids } = prompts();
    const ask = broker.callback(() => 'session');
    const pending = ask('Bash', { command: 'ls' }, context);
    await vi.waitFor(() => {
      expect(seen.some((entry) => entry.endsWith(':waiting'))).toBe(true);
    });
    const id = ids[0] ?? '';
    broker.answer(id, { decision: 'deny', reason: 'No' });
    expect(await pending).toMatchObject({ behavior: 'deny', message: 'No' });
    broker.stop();
  });
});

describe('owned controls', () => {
  it('sets the permission mode and the model on the running query', async () => {
    const { query, calls } = fakeQuery();
    const controls: ProviderControl[] = [
      { action: 'set_permission_mode', mode: 'plan' },
      { action: 'set_model', model: 'opus' },
    ];
    for (const control of controls) await controlProvider(target(query), control);
    expect(calls).toEqual(['setPermissionMode:plan', 'setModel:opus']);
  });

  it('refuses changes the SDK cannot apply to a running query', async () => {
    const { query } = fakeQuery();
    await expect(
      controlProvider(target(query), { action: 'cancel_message', message_id: 'm' }),
    ).rejects.toThrow(ProviderInputError);
  });
});

describe('job configuration', () => {
  function options(change: Partial<ProviderTurn>): ReturnType<typeof jobOptions> {
    const value = turn(change);
    const tools = { server: { type: 'sdk', name: 'home', instance: {} } };
    return jobOptions({
      options: {
        turn: value,
        cwd: '/work',
        log: new Logger('hub.claude'),
        publish: () => undefined,
      },
      abort: new AbortController(),
      externalServers: {},
      tools: loose<ProviderTools>(tools),
      prompts: new ProviderPrompts(new Logger('hub.claude'), () => undefined),
      dialogs: loose<ProviderDialogs>({ userDialog: vi.fn(), elicitation: vi.fn() }),
      session: () => 'session',
      toolBoundary: () => undefined,
      toolHook: () => Promise.resolve({}),
    });
  }

  it('always lets Claude ask questions and propose plans, and starts a new session by job id', () => {
    const built = options({});
    expect(built.tools).toEqual({ type: 'preset', preset: 'claude_code' });
    expect(built.sessionId).toBe(JOB);
    expect(built.resume).toBeUndefined();
    expect(built.canUseTool).toBeDefined();
  });

  it('resumes an owned session by id', () => {
    expect(options({ session_id: 'owned-session' }).resume).toBe('owned-session');
  });

  it('starts in the chosen permission mode and only allows bypass when asked', () => {
    expect(configurationOptions({ builtin_tools: [], permission_mode: 'plan' })).toMatchObject({
      permissionMode: 'plan',
      allowDangerouslySkipPermissions: false,
    });
    expect(
      configurationOptions({ builtin_tools: [], permission_mode: 'bypassPermissions' }),
    ).toMatchObject({ allowDangerouslySkipPermissions: true });
  });

  it('loads the user and project settings by default and exactly the sources the computer names', () => {
    expect(configurationOptions({ builtin_tools: [] }).settingSources).toEqual(['user', 'project']);
    expect(
      configurationOptions({ builtin_tools: [], setting_sources: ['local'] }).settingSources,
    ).toEqual(['local']);
    expect(configurationOptions({ builtin_tools: [], setting_sources: [] }).settingSources).toEqual(
      [],
    );
  });

  it('passes native sub-agent definitions to the SDK', () => {
    const agents = agentDefinitions({
      builtin_tools: [],
      agents: {
        reviewer: { description: 'Reviews', prompt: 'Review it', tools: ['Read'], model: 'haiku' },
      },
    });
    expect(agents).toEqual({
      reviewer: { description: 'Reviews', prompt: 'Review it', tools: ['Read'], model: 'haiku' },
    });
  });
});

describe('model and effort limits', () => {
  it('accepts only an effort level the Claude model advertises', () => {
    const advertised = model({ supportedEffortLevels: ['low', 'high'] });
    expect(modelOptions(turn({ effort: 'high' }), advertised).effort).toBe('high');
    expect(() => modelOptions(turn({ effort: 'max' }), advertised)).toThrow(ProviderInputError);
  });

  it('refuses adaptive thinking and fast mode on a model without them', () => {
    expect(() =>
      modelOptions(turn({ options: { builtin_tools: [], thinking: 'adaptive' } }), model()),
    ).toThrow('adaptive thinking');
    expect(() =>
      modelOptions(turn({ options: { builtin_tools: [], fast: true } }), model()),
    ).toThrow('fast mode');
  });
});

describe('turn input and results', () => {
  it('sends a slash command as the user message text', () => {
    const message = userMessageOf(
      turn({
        messages: [{ role: 'user', content: [{ type: 'text', text: '/compact keep tests' }] }],
      }),
    );
    expect(message.message.content).toEqual([{ type: 'text', text: '/compact keep tests' }]);
  });

  it('refuses a slash command that would be mixed into replayed history', () => {
    expect(() =>
      userMessageOf(
        turn({
          messages: [
            { role: 'user', content: [{ type: 'text', text: 'earlier' }] },
            { role: 'assistant', content: [{ type: 'text', text: 'reply' }] },
            { role: 'user', content: [{ type: 'text', text: '/compact' }] },
          ],
        }),
      ),
    ).toThrow('slash command');
  });

  it('reports usage and cost for a finished turn, and marks an interrupted one', () => {
    const result = loose<SDKResultMessage>({
      type: 'result',
      subtype: 'success',
      is_error: false,
      result: 'done',
      session_id: 'session',
      total_cost_usd: 0.0123,
      usage: {
        input_tokens: 10,
        output_tokens: 20,
        cache_read_input_tokens: 30,
        cache_creation_input_tokens: 40,
      },
    });
    const [usage, done] = resultEvents(result, false, 42);
    expect(usage).toMatchObject({
      kind: 'usage',
      cost_usd: 0.0123,
      input_tokens: 10,
      context_percent: 42,
    });
    expect(done).toMatchObject({ kind: 'completed', interrupted: false });
    expect(resultEvents(result, true, null)[1]).toMatchObject({
      kind: 'completed',
      interrupted: true,
    });
  });
});
