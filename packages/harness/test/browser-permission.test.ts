import { afterEach, describe, expect, it } from 'vitest';
import type { Context } from '@deepseek-ai/cordis';
import type { AiHarnessPermission } from '@smarteverything/domain';
import { mountBrowserPermission } from '../src/composition/browser-permission';
import { bootRuntime, spoken, turnsFinished } from './support/runtime';
import type { RuntimeFixture } from './support/runtime';

const FULL: AiHarnessPermission = { sandbox: 'danger-full-access', approval: 'never' };
const WORKSPACE: AiHarnessPermission = { sandbox: 'workspace-write', approval: 'on-request' };
const NAVIGATE = 'mcp__playwright-mcp__browser_navigate';

let fixture: RuntimeFixture | undefined;
afterEach(async () => {
  await fixture?.dispose();
  fixture = undefined;
});

interface Browser {
  readonly host: RuntimeFixture;
  readonly visited: string[];
}

async function withBrowser(approval: 'allowed-once' | 'rejected'): Promise<Browser> {
  const visited: string[] = [];
  const mount = (ctx: Context): void => {
    ctx.inject(['sandboxPolicy'], (active: Context): void => {
      mountBrowserPermission(active);
    });
    ctx.tools.register({
      name: NAVIGATE,
      description: 'Open a page.',
      parameters: {
        type: 'object',
        properties: { url: { type: 'string' } },
        required: ['url'],
        additionalProperties: false,
      },
      output: {
        schema: { type: 'object', additionalProperties: true },
        render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
      },
      execute: (raw) => {
        visited.push(JSON.stringify(raw));
        return Promise.resolve({ opened: true });
      },
    });
  };
  fixture = await bootRuntime({ approval, mount });
  return { host: fixture, visited };
}

async function browse(browser: Browser, permission: AiHarnessPermission): Promise<string> {
  const { host } = browser;
  host.model.script(
    { kind: 'tool', id: 'nav-1', name: NAVIGATE, input: { url: 'https://example.test' } },
    { kind: 'text', text: 'finished' },
  );
  const session = await host.runtime.create({ ...host.sessionOptions(), permission });
  session.text('open the page');
  await turnsFinished(host, session, 1);
  const result = host.model.requests[1]?.messages.at(-1);
  return spoken(result === undefined ? [] : [result])[0]?.text ?? '';
}

describe('the headless browser below Full access', () => {
  it('asks before opening a page and opens it once the user agrees', async () => {
    const browser = await withBrowser('allowed-once');

    await browse(browser, WORKSPACE);

    expect(browser.host.approvals).toHaveLength(1);
    expect(browser.host.approvals[0]?.toolName).toBe(NAVIGATE);
    expect(browser.visited).toHaveLength(1);
  });

  it('does not open the page when the user says no', async () => {
    const browser = await withBrowser('rejected');

    const result = await browse(browser, WORKSPACE);

    expect(browser.host.approvals).toHaveLength(1);
    expect(browser.visited).toHaveLength(0);
    expect(result).toMatch(/rejected/u);
  });

  it('opens it without asking when the chat has Full access', async () => {
    const browser = await withBrowser('rejected');

    await browse(browser, FULL);

    expect(browser.host.approvals).toHaveLength(0);
    expect(browser.visited).toHaveLength(1);
  });
});
