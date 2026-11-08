import { afterEach, describe, expect, it } from 'vitest';
import type { Context } from '@deepseek-ai/cordis';
import { bindHomeWebSearch } from '../src/plugins/home-web-search';
import type { HomeWebSearchPort, HomeWebSearchRequest } from '../src/plugins/home-web-search';
import { bootRuntime, spoken, turnsFinished } from './support/runtime';
import type { RuntimeFixture } from './support/runtime';

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

function portOf(offered: boolean): HomeWebSearchPort & { readonly seen: HomeWebSearchRequest[] } {
  const seen: HomeWebSearchRequest[] = [];
  return {
    seen,
    offered: () => offered,
    search: (request): ReturnType<HomeWebSearchPort['search']> => {
      seen.push(request);
      return Promise.resolve({
        content: 'It is sunny.',
        sources: [{ url: 'https://example.com/a', title: 'Weather A' }],
        truncated: false,
      });
    },
  };
}

function toolNames(host: RuntimeFixture): readonly string[] {
  return host.model.requests[0]?.tools?.map((tool) => tool.name) ?? [];
}

function lastResult(host: RuntimeFixture, request: number): string {
  const message = host.model.requests[request]?.messages.at(-1);
  return spoken(message === undefined ? [] : [message])[0]?.text ?? '';
}

async function ask(host: RuntimeFixture, text: string): Promise<string> {
  const options = host.sessionOptions();
  const session = await host.runtime.create(options);
  session.text(text);
  await turnsFinished(host, session, 1);
  return options.sessionId;
}

describe('home web search', () => {
  it('answers the web_search tool through the bound port for the calling session', async () => {
    const { host, ctx } = await boot();
    const port = portOf(true);
    bindHomeWebSearch(ctx, port);
    host.model.script(
      { kind: 'tool', id: 's1', name: 'web_search', input: { queries: ['weather today'] } },
      { kind: 'text', text: 'done' },
    );

    const sessionId = await ask(host, 'weather?');

    expect(toolNames(host)).toContain('web_search');
    expect(port.seen).toHaveLength(1);
    expect(port.seen[0]).toMatchObject({ sessionId, query: 'weather today' });
    expect(port.seen[0]?.maxResults).toBeGreaterThan(0);
    expect(lastResult(host, 1)).toContain('It is sunny.');
    expect(lastResult(host, 1)).toContain('https://example.com/a');
  });

  it('does not offer the tool to a session the port does not serve', async () => {
    const { host, ctx } = await boot();
    bindHomeWebSearch(ctx, portOf(false));
    host.model.script({ kind: 'text', text: 'hi' });

    await ask(host, 'hello');

    expect(toolNames(host)).not.toContain('web_search');
  });

  it('does not offer the tool before a port is bound and again after it is unbound', async () => {
    const { host, ctx } = await boot();
    host.model.script(
      { kind: 'text', text: 'one' },
      { kind: 'text', text: 'two' },
      { kind: 'text', text: 'three' },
    );
    const session = await host.runtime.create(host.sessionOptions());

    session.text('before');
    await turnsFinished(host, session, 1);
    const unbind = bindHomeWebSearch(ctx, portOf(true));
    session.text('during');
    await turnsFinished(host, session, 2);
    unbind();
    session.text('after');
    await turnsFinished(host, session, 3);

    const offered = host.model.requests.map((request) =>
      (request.tools ?? []).some((tool) => tool.name === 'web_search'),
    );
    expect(offered).toStrictEqual([false, true, false]);
  });
});
