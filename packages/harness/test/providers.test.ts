import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { Context } from '@deepseek-ai/cordis';
import { credentialKey, credentialRef } from '@deepseek-ai/dsh-credentials';
import { KNOWN_SESSION_EVENT_TYPES } from '@deepseek-ai/dsh-session';
import { DSH_SESSION_EVENT_WRITE } from '@smarteverything/domain';
import { PLUGINS } from '../src/plugins';
import { ApiKeyCredentials } from '../src/plugins/providers';
import { MemoryApiKeyVault } from './support/api-key-vault';
import { DEEPSEEK_KEY_REFERENCE, startMockProvider } from './support/llm-mock-server';
import type { MockProvider } from './support/llm-mock-server';
import { ask, bootProviderLoop, turnEnds } from './support/loop-testkit';
import type { ProviderLoop } from './support/loop-testkit';

let provider: MockProvider | undefined;
let loop: ProviderLoop | undefined;

afterEach(async () => {
  await loop?.dispose();
  await provider?.dispose();
  loop = undefined;
  provider = undefined;
});

async function boot(
  sequence: Parameters<typeof startMockProvider>[0],
  options: Parameters<typeof bootProviderLoop>[0] & { readonly serverKey?: string } = {},
): Promise<ProviderLoop & { readonly mock: MockProvider }> {
  provider = await startMockProvider(
    sequence,
    options.serverKey === undefined ? {} : { apiKey: options.serverKey },
  );
  loop = await bootProviderLoop(options);
  return { ...loop, mock: provider };
}

const SESSION_LOG = z.object({
  dsh_session_log: z.object({ afterSeq: z.number(), throughSeq: z.number() }),
});
const ACCEPTED = z.object({
  type: z.literal('session-log-deepseek/delivery-accepted'),
  data: z.object({ throughSeq: z.number() }),
});

describe('the providers plugin', () => {
  it('is named once in the plugin list', () => {
    expect(PLUGINS.filter((plugin) => plugin.name === 'providers')).toHaveLength(1);
  });

  it('answers through the DeepSeek adapter with the key from the credential seam', async () => {
    const host = await boot(['success'], { key: 'vault-key' });
    const agent = await host.agent('answer');

    await ask(agent, 'hello');

    expect(turnEnds(host.events(agent.session.id))).toStrictEqual([{ kind: 'completed' }]);
    expect(host.mock.server.requests).toHaveLength(1);
    expect(host.mock.server.requests[0]?.headers['x-api-key']).toBe('vault-key');
  });

  it('never falls back to a key in the process environment', async () => {
    vi.stubEnv(DEEPSEEK_KEY_REFERENCE, 'environment-key');
    const host = await boot(['success']);
    const agent = await host.agent('no-env');

    await ask(agent, 'hello');

    expect(
      turnEnds(host.events(agent.session.id)).map((end) => end.kind === 'error' && end.code),
    ).toStrictEqual(['MISSING_CREDENTIAL']);
    expect(host.mock.server.requests).toHaveLength(0);
  });

  it('sends the next request with a key changed in the vault, without a restart', async () => {
    const host = await boot(['success'], { key: 'old-key', serverKey: 'new-key' });
    const agent = await host.agent('rotate');

    await ask(agent, 'first');
    await host.vault.write(DEEPSEEK_KEY_REFERENCE, 'new-key');
    await ask(agent, 'second');

    expect(turnEnds(host.events(agent.session.id)).map((end) => end.kind)).toStrictEqual([
      'error',
      'completed',
    ]);
    expect(host.mock.server.requests.map((request) => request.headers['x-api-key'])).toStrictEqual([
      'new-key',
    ]);
  });

  it('registers no DeepSeek route while the credential seam is absent', async () => {
    const host = await boot(['success'], { credentials: false });
    const agent = await host.agent('inert');

    await ask(agent, 'hello');

    expect(turnEnds(host.events(agent.session.id)).map((end) => end.kind)).toStrictEqual(['error']);
    expect(host.mock.server.requests).toHaveLength(0);
  });

  it('uploads the session log incrementally from the last accepted sequence', async () => {
    const host = await boot(['success', 'success'], { key: 'vault-key' });
    const agent = await host.agent('log');

    await ask(agent, 'first');
    await ask(agent, 'second');

    const accepted = host.events(agent.session.id).flatMap((event) => {
      const parsed = ACCEPTED.safeParse(event);
      return parsed.success ? [parsed.data.data.throughSeq] : [];
    });
    const uploads = host.mock.server.requests.map(
      (request) => SESSION_LOG.parse(request.body).dsh_session_log,
    );
    expect(accepted).toHaveLength(2);
    expect(uploads[0]?.throughSeq).toBe(accepted[0]);
    expect(uploads[1]?.afterSeq).toBe(accepted[0]);
  });

  it('appends only event types the hub stores as known or marked ignorable', async () => {
    const host = await boot(['success'], { key: 'vault-key' });
    const agent = await host.agent('known');

    await ask(agent, 'hello');

    const events = host.events(agent.session.id);
    expect(events.some((event) => event.type === 'session-log-deepseek/delivery-accepted')).toBe(
      true,
    );
    for (const event of events) {
      expect(DSH_SESSION_EVENT_WRITE.safeParse(event).success).toBe(true);
      expect(KNOWN_SESSION_EVENT_TYPES.has(event.type) || event.ignorable === true).toBe(true);
    }
  });
});

describe('the credential provider', () => {
  async function mounted(
    initial: Readonly<Record<string, string>> = {},
  ): Promise<{ readonly ctx: Context; readonly vault: MemoryApiKeyVault }> {
    const ctx = new Context();
    const vault = new MemoryApiKeyVault(initial);
    await ctx.plugin(ApiKeyCredentials, vault);
    return { ctx, vault };
  }
  const ref = credentialRef(DEEPSEEK_KEY_REFERENCE);

  it('resolves a stored key with its source and treats an empty value as absent', async () => {
    const { ctx } = await mounted({ [DEEPSEEK_KEY_REFERENCE]: 'secret', EMPTY_KEY: '' });

    expect(await ctx.credentials.resolve(ref)).toStrictEqual({
      value: 'secret',
      source: 'test-vault',
    });
    expect(await ctx.credentials.resolve(credentialRef('EMPTY_KEY'))).toBeUndefined();
    expect(await ctx.credentials.describe(credentialRef('EMPTY_KEY'))).toStrictEqual({
      configured: false,
      writable: true,
    });
    await ctx.fiber.dispose();
  });

  it('stores, removes and announces a changed reference once', async () => {
    const { ctx } = await mounted();
    const updated: string[] = [];
    ctx.on('credentials/reference-updated', (changed) => {
      updated.push(changed);
    });

    await ctx.credentials.set(ref, 'one');
    await ctx.credentials.unset(ref);

    expect(updated).toStrictEqual([DEEPSEEK_KEY_REFERENCE, DEEPSEEK_KEY_REFERENCE]);
    expect(await ctx.credentials.resolve(ref)).toBeUndefined();
    await expect(ctx.credentials.set(ref, '')).rejects.toThrow(/empty/u);
    await ctx.fiber.dispose();
  });

  it('holds no authorization grants', async () => {
    const { ctx } = await mounted();

    expect(await ctx.credentials.listRecords()).toStrictEqual([]);
    await expect(
      ctx.credentials.modifyRecord(credentialKey('a-owner', 'a-route'), () =>
        Promise.resolve(undefined),
      ),
    ).rejects.toThrow(/not stored/u);
    await ctx.fiber.dispose();
  });
});
