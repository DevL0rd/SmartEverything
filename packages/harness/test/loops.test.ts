import { afterEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { access } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import type { Context } from '@deepseek-ai/cordis';
import { AI_AGENT_LOOP_SETTINGS, AI_CODE_EXECUTION_TOOL_NAMES } from '@smarteverything/domain';
import type { AiAgentLoopSettings } from '@smarteverything/domain';
import { bindAgentLoopSettings } from '../src/plugins/goals';
import { bootRuntime, spoken, turnsFinished } from './support/runtime';
import type { BootOptions, RuntimeFixture } from './support/runtime';
import type { ScriptedReply } from './support/scripted-model';
import type { HarnessAuthority } from '../src/host/server-policy';

let fixture: RuntimeFixture | undefined;
let anchor: Context | undefined;
afterEach(async () => {
  await fixture?.dispose();
  fixture = undefined;
  anchor = undefined;
});

function captureRoot(ctx: Context): void {
  anchor = ctx;
}

async function boot(options: BootOptions = {}): Promise<RuntimeFixture> {
  fixture = await bootRuntime({ ...options, mount: captureRoot });
  await vi.waitFor(() => {
    expect(anchor?.get('subagents')?.getProvider('spawn')?.name).toBe('spawn');
    expect(anchor?.get('workflowEngine')).toBeDefined();
  });
  return fixture;
}

function lastResult(host: RuntimeFixture, index: number): string {
  const message = host.model.requests[index]?.messages.at(-1);
  return spoken(message === undefined ? [] : [message])[0]?.text ?? '';
}

function settings(loops: Partial<AiAgentLoopSettings>): AiAgentLoopSettings {
  return AI_AGENT_LOOP_SETTINGS.parse(loops);
}

const SERVER_AUTHORITY: HarnessAuthority = { kind: 'manual', profileId: randomUUID() };

function workflowCall(script: string): Record<string, unknown> {
  return {
    meta: { name: 'probe', description: 'Run a probe script.' },
    script,
    args: { a: 2, b: 3 },
  };
}

async function asked(
  host: RuntimeFixture,
  text: string,
  options?: object,
): Promise<{ readonly sessionId: string }> {
  const session = await host.runtime.create({ ...host.sessionOptions(), ...options });
  session.text(text);
  await turnsFinished(host, session, 1);
  return { sessionId: session.id };
}

const TOOL_RESULT = z.object({
  type: z.literal('tool/result'),
  data: z.object({
    message: z.object({
      toolCallId: z.string(),
      isError: z.boolean(),
      content: z.array(z.object({ type: z.string(), text: z.string().optional() })),
    }),
  }),
});

function failedToolResults(
  host: RuntimeFixture,
  sessionId: string,
): readonly { readonly callId: string; readonly text: string }[] {
  return host.persistence.events(sessionId).flatMap((event) => {
    const parsed = TOOL_RESULT.safeParse(event);
    return parsed.success && parsed.data.data.message.isError
      ? [
          {
            callId: parsed.data.data.message.toolCallId,
            text: parsed.data.data.message.content
              .flatMap((block) => (block.text === undefined ? [] : [block.text]))
              .join(''),
          },
        ]
      : [];
  });
}

async function exists(path: string): Promise<boolean> {
  return access(path).then(
    () => true,
    () => false,
  );
}

describe('the workflow tool', () => {
  it('runs a script in a node process and returns its value', async () => {
    const host = await boot();
    host.model.script(
      {
        kind: 'tool',
        id: 'w1',
        name: 'workflow',
        input: workflowCall('return { total: args.a + args.b }'),
      },
      { kind: 'text', text: 'done' },
    );

    await asked(host, 'run a workflow');

    expect(lastResult(host, 1)).toContain('"total": 5');
  });

  it('keeps a script that escapes the script realm inside the session sandbox', async () => {
    const host = await boot();
    const target = join(host.workspace, 'escaped.txt');
    const escape = `const host = agent.constructor.constructor('return process')();
      host.getBuiltinModule('node:fs').writeFileSync(${JSON.stringify(target)}, 'x');
      return 1`;
    host.model.script(
      { kind: 'tool', id: 'w1', name: 'workflow', input: workflowCall(escape) },
      { kind: 'text', text: 'done' },
    );

    await asked(host, 'run a workflow', {
      permission: { sandbox: 'read-only', approval: 'on-request' },
    });

    expect(lastResult(host, 1)).toContain('EROFS');
    expect(await exists(target)).toBe(false);
  });

  it('stops a script that starts more agents than the settings allow', async () => {
    const host = await boot();
    if (anchor === undefined) throw new Error('The test mount did not run.');
    await bindAgentLoopSettings(anchor, settings({ workflow: { max_total_agents: 2 } }));
    const { model } = host;
    const parent: ScriptedReply[] = [
      {
        kind: 'tool',
        id: 'w1',
        name: 'workflow',
        input: workflowCall(
          'return await parallel([() => agent("a"), () => agent("b"), () => agent("c")])',
        ),
      },
      { kind: 'text', text: 'done' },
    ];
    model.guard = (options): void => {
      const own = spoken(options.messages)
        .map((message) => message.text)
        .join('\n');
      const next = own.includes('run a workflow') ? parent.shift() : undefined;
      model.script(next ?? { kind: 'text', text: 'child done' });
    };
    const session = await host.runtime.create(host.sessionOptions());
    session.text('run a workflow');

    await vi.waitFor(() => {
      const results = model.requests.map((request) => {
        const message = request.messages.at(-1);
        return spoken(message === undefined ? [] : [message])[0]?.text ?? '';
      });
      expect(results.some((text) => text.includes('total agent cap (2)'))).toBe(true);
    });
  });
});

describe('the ralph tool', () => {
  it('refuses a round count above the ceiling from the settings', async () => {
    const host = await boot();
    if (anchor === undefined) throw new Error('The test mount did not run.');
    await bindAgentLoopSettings(anchor, settings({ ralph: { max_rounds: 2 } }));
    host.model.script(
      { kind: 'tool', id: 'r1', name: 'ralph', input: { objective: 'Tidy up', maxRounds: 5 } },
      { kind: 'text', text: 'done' },
    );

    await asked(host, 'run a ralph loop');

    const result = lastResult(host, 1);
    expect(result.startsWith('Error:')).toBe(true);
    expect(result).toContain('5');
  });
});

describe('the code runtime', () => {
  const NOISY = "console.log('x'.repeat(4096)); return 1";

  it('applies the output cap from the settings', async () => {
    await boot();
    if (anchor === undefined) throw new Error('The test mount did not run.');
    const before = anchor.get('ptcRuntime');
    const open = await before?.run(before.resolve({ program: NOISY, bindings: [] }));
    await bindAgentLoopSettings(anchor, settings({ code: { max_output_bytes: 256 } }));
    await vi.waitFor(async () => {
      const runtime = anchor?.get('ptcRuntime');
      const capped = await runtime?.run(runtime.resolve({ program: NOISY, bindings: [] }));
      expect(capped?.error?.kind).toBe('output-limit');
    });

    expect(open?.error).toBeUndefined();
  });
});

describe('the code execution gate', () => {
  async function server(native: boolean): Promise<RuntimeFixture> {
    return boot({
      target: { kind: 'server' },
      serverToolAccess: {
        hubToolNames: () => [],
        nativeAccess: () => native,
        deny: () => undefined,
      },
    });
  }

  it('keeps workflow and ralph away from a member of the home', async () => {
    const host = await server(false);
    host.model.script(
      {
        kind: 'tool',
        id: 'w1',
        name: 'workflow',
        input: workflowCall('return { total: args.a + args.b }'),
      },
      { kind: 'text', text: 'done' },
    );

    const { sessionId } = await asked(host, 'run a workflow', { authority: SERVER_AUTHORITY });

    const offered = host.model.requests[0]?.tools?.map((tool) => tool.name) ?? [];
    for (const name of AI_CODE_EXECUTION_TOOL_NAMES) expect(offered).not.toContain(name);
    const failures = failedToolResults(host, sessionId);
    expect(failures.map((failure) => failure.callId)).toStrictEqual(['w1']);
    expect(failures[0]?.text).not.toContain('"total": 5');
  });
});
