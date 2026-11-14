import { afterEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { Context } from '@deepseek-ai/cordis';
import type { HarnessAuthority } from '../src/host/server-policy';
import { bindHomeWebSearch } from '../src/plugins/home-web-search';
import { TERMINAL_TOOL_NAMES } from '../src/plugins/terminals';
import { WORKSPACE_TOOL_NAMES } from '../src/plugins/workspace';
import { bootRuntime, spoken, turnsFinished } from './support/runtime';
import type { RuntimeFixture } from './support/runtime';

const AUTHORITY: HarnessAuthority = { kind: 'manual', profileId: randomUUID() };
const WITHHELD_FROM_SERVERS: readonly string[] = [...TERMINAL_TOOL_NAMES, ...WORKSPACE_TOOL_NAMES];
const MEMBER_ONLY_MACHINE_TOOLS: readonly string[] = [
  'bash',
  'job_output',
  'job_list',
  'job_kill',
  'set_working_directory',
  'workflow',
  'ralph',
];

let fixture: RuntimeFixture | undefined;
afterEach(async () => {
  await fixture?.dispose();
  fixture = undefined;
});

async function serverChat(
  qualifies: boolean,
  native: boolean,
): Promise<{ readonly host: RuntimeFixture; readonly ctx: Context }> {
  let captured: Context | undefined;
  fixture = await bootRuntime({
    target: { kind: 'server' },
    serverToolAccess: {
      hubToolNames: () => [],
      nativeAccess: () => native,
      deny: () => undefined,
    },
    mount: (ctx) => {
      captured = ctx;
    },
  });
  if (captured === undefined) throw new Error('The runtime never mounted the test route.');
  const unbind = bindHomeWebSearch(captured, {
    offered: () => qualifies,
    search: () =>
      Promise.resolve({
        content: 'It is sunny.',
        sources: [{ url: 'https://example.com/a', title: 'Weather A' }],
        truncated: false,
      }),
  });
  captured.effect(() => unbind);
  return { host: fixture, ctx: captured };
}

async function ask(host: RuntimeFixture): Promise<void> {
  const session = await host.runtime.create({ ...host.sessionOptions(), authority: AUTHORITY });
  session.text('search the web');
  await turnsFinished(host, session, 1);
}

function offered(host: RuntimeFixture): readonly string[] {
  return host.model.requests[0]?.tools?.map((tool) => tool.name) ?? [];
}

function lastResult(host: RuntimeFixture, request: number): string {
  const message = host.model.requests[request]?.messages.at(-1);
  return spoken(message === undefined ? [] : [message])[0]?.text ?? '';
}

describe('web search in a server conversation', () => {
  it('is offered and answered when the chat qualifies', async () => {
    const { host } = await serverChat(true, false);
    host.model.script(
      { kind: 'tool', id: 's1', name: 'web_search', input: { queries: ['weather today'] } },
      { kind: 'text', text: 'done' },
    );
    await ask(host);

    expect(offered(host)).toContain('web_search');
    expect(lastResult(host, 1)).toContain('It is sunny.');
  });

  it('is neither offered nor executed when the chat does not qualify', async () => {
    const { host } = await serverChat(false, false);
    host.model.script(
      { kind: 'tool', id: 's1', name: 'web_search', input: { queries: ['weather today'] } },
      { kind: 'text', text: 'done' },
    );
    await ask(host);

    expect(offered(host)).not.toContain('web_search');
    expect(lastResult(host, 1)).toContain('Web search is not available in this chat.');
    expect(lastResult(host, 1)).not.toContain('It is sunny.');
  });
});

describe('the server tool policy against the registered tools', () => {
  it.each([false, true])(
    'offers every registered tool except the machine tools and the deliberately withheld ones (native %s)',
    async (native) => {
      const { host, ctx } = await serverChat(true, native);
      host.model.script({ kind: 'text', text: 'hi' });
      await ask(host);

      const registered = ctx.tools.schemas().map((tool) => tool.name);
      const dropped = registered.filter((name) => !offered(host).includes(name));
      const expected = [
        ...WITHHELD_FROM_SERVERS,
        ...(native ? [] : MEMBER_ONLY_MACHINE_TOOLS),
      ].sort();
      expect(dropped.sort()).toStrictEqual(expected.filter((name) => registered.includes(name)));
      expect(registered).toStrictEqual(expect.arrayContaining([...WITHHELD_FROM_SERVERS]));
    },
  );
});
