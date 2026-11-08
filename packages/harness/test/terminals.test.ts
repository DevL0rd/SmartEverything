import { afterEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { HarnessAuthority } from '../src/host/server-policy';
import { TERMINAL_TOOL_NAMES } from '../src/plugins/terminals';
import { bootRuntime, spoken, statuses } from './support/runtime';
import type { RuntimeFixture } from './support/runtime';

const SETTLE_MS = 20_000;
const AUTHORITY: HarnessAuthority = { kind: 'manual', profileId: randomUUID() };

let fixture: RuntimeFixture | undefined;
afterEach(async () => {
  await fixture?.dispose();
  fixture = undefined;
});

function offered(host: RuntimeFixture): readonly string[] {
  return host.model.requests[0]?.tools?.map((tool) => tool.name) ?? [];
}

function result(host: RuntimeFixture, request: number): string {
  const message = host.model.requests[request]?.messages.at(-1);
  return spoken(message === undefined ? [] : [message])[0]?.text ?? '';
}

async function ask(host: RuntimeFixture, authority?: HarnessAuthority): Promise<void> {
  const session = await host.runtime.create({
    ...host.sessionOptions(),
    ...(authority === undefined ? {} : { authority }),
  });
  session.text('use the terminal');
  await vi.waitFor(
    () => {
      expect(statuses(host.events).filter((status) => status === 'idle')).toHaveLength(1);
    },
    { timeout: SETTLE_MS },
  );
  await session.flush();
}

describe('the persistent terminal tools', () => {
  it('are offered next to the one-shot shell tool', async () => {
    fixture = await bootRuntime();
    fixture.model.script({ kind: 'text', text: 'hi' });
    await ask(fixture);

    expect(offered(fixture)).toStrictEqual(
      expect.arrayContaining(['bash', ...TERMINAL_TOOL_NAMES]),
    );
  });

  it('keep the shell state between calls', async () => {
    fixture = await bootRuntime();
    fixture.model.script(
      { kind: 'tool', id: 'o1', name: 'terminal_open', input: { type: 'shell', name: 'main' } },
      {
        kind: 'tool',
        id: 's1',
        name: 'terminal_send',
        input: { sessionId: 'pty-1', text: 'export SE_KEPT=still-here' },
      },
      {
        kind: 'tool',
        id: 's2',
        name: 'terminal_send',
        input: { sessionId: 'pty-1', text: 'echo "value=$SE_KEPT"' },
      },
      { kind: 'tool', id: 'l1', name: 'terminal_list', input: {} },
      { kind: 'tool', id: 'c1', name: 'terminal_close', input: { sessionId: 'pty-1' } },
      { kind: 'text', text: 'done' },
    );
    await ask(fixture);

    expect(result(fixture, 1)).toContain('pty-1');
    expect(result(fixture, 3)).toContain('value=still-here');
    expect(result(fixture, 4)).toContain('main');
  });

  it('are not offered to a member of the server, who has no machine tools', async () => {
    fixture = await bootRuntime({
      target: { kind: 'server' },
      serverToolAccess: {
        hubToolNames: () => [],
        nativeAccess: () => false,
        deny: () => undefined,
      },
    });
    fixture.model.script({ kind: 'text', text: 'hi' });
    await ask(fixture, AUTHORITY);

    for (const tool of TERMINAL_TOOL_NAMES) expect(offered(fixture)).not.toContain(tool);
  });
});
