import type { IncomingHttpHeaders } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AI_DEEPSEEK_ENDPOINTS as E, DEEPSEEK_KEY_REFERENCE } from '@smarteverything/domain';
import type { ClientRow } from '@smarteverything/domain';
import { SecretApiKeyVault } from '../../src/harness/api-key-vault';
import { deepSeekRoutes } from '../../src/harness/deepseek-routes';
import { SecretStore } from '../../src/secrets/store';
import type { Caller } from '../../src/server/auth';
import { testLogger } from '../support/logs';
import { testStore, type TestStore } from '../support/store';

const KEY = 'sk-0123456789abcdef0123456789abcdef';
const SEALED = 'secrets.json.enc';

let directory = '';
let opened: TestStore;
let owner: Caller;
let member: Caller;
let secrets: SecretStore;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'deepseek-key-'));
  secrets = await SecretStore.open(join(directory, SEALED), Buffer.alloc(32, 7));
  opened = await testStore();
  const row = (role: ClientRow['role'], hash: string): ClientRow =>
    opened.store.clients.create(
      { name: role, platform: 'desktop', role, tokenHash: hash.repeat(64) },
      role === 'owner',
    );
  owner = { kind: 'client', client: row('owner', 'a') };
  member = { kind: 'client', client: row('member', 'b') };
});

afterEach(async () => {
  await opened.close();
  await rm(directory, { recursive: true, force: true });
});

function routes(): ReturnType<typeof deepSeekRoutes> {
  return deepSeekRoutes(new SecretApiKeyVault(secrets));
}

function raw(body?: unknown): {
  readonly params: object;
  readonly query: object;
  readonly body: unknown;
  readonly remote: string;
  readonly headers: IncomingHttpHeaders;
} {
  return { params: {}, query: {}, body, remote: 'test', headers: {} };
}

describe('the DeepSeek key routes', () => {
  it('reports a missing key, then a saved one, and never returns the key', async () => {
    const { readDeepSeek, setDeepSeekKey } = routes();

    expect(await readDeepSeek.run(owner, raw(), testLogger())).toStrictEqual({ key: 'missing' });
    const saved = await setDeepSeekKey.run(owner, raw({ key: `  ${KEY} ` }), testLogger());

    expect(saved).toStrictEqual({ key: 'set' });
    expect(JSON.stringify(saved)).not.toContain(KEY);
    expect(await readDeepSeek.run(member, raw(), testLogger())).toStrictEqual({ key: 'set' });
    expect(secrets.apiKey(DEEPSEEK_KEY_REFERENCE)).toBe(KEY);
  });

  it('keeps the key sealed on disk and forgets it on removal', async () => {
    const { setDeepSeekKey, removeDeepSeekKey, readDeepSeek } = routes();

    await setDeepSeekKey.run(owner, raw({ key: KEY }), testLogger());
    expect(await readFile(join(directory, SEALED), 'utf8')).not.toContain(KEY);
    const reopened = await SecretStore.open(join(directory, SEALED), Buffer.alloc(32, 7));
    expect(reopened.apiKey(DEEPSEEK_KEY_REFERENCE)).toBe(KEY);

    expect(await removeDeepSeekKey.run(owner, raw(), testLogger())).toStrictEqual({
      key: 'missing',
    });
    expect(await readDeepSeek.run(owner, raw(), testLogger())).toStrictEqual({ key: 'missing' });
    expect(secrets.apiKey(DEEPSEEK_KEY_REFERENCE)).toBeNull();
  });

  it('lets only an owner save or remove the key', async () => {
    const { setDeepSeekKey, removeDeepSeekKey } = routes();

    await expect(setDeepSeekKey.run(member, raw({ key: KEY }), testLogger())).rejects.toMatchObject(
      { code: 'forbidden' },
    );
    await expect(removeDeepSeekKey.run(member, raw(), testLogger())).rejects.toMatchObject({
      code: 'forbidden',
    });
    expect(E.setDeepSeekKey.access).toBe('owner');
    expect(E.removeDeepSeekKey.access).toBe('owner');
  });

  it('refuses a key with spaces inside or an empty one', async () => {
    const { setDeepSeekKey } = routes();

    await expect(
      setDeepSeekKey.run(owner, raw({ key: 'sk-01 23' }), testLogger()),
    ).rejects.toMatchObject({ code: 'invalid_request' });
    await expect(
      setDeepSeekKey.run(owner, raw({ key: '   ' }), testLogger()),
    ).rejects.toMatchObject({ code: 'invalid_request' });
    expect(secrets.apiKey(DEEPSEEK_KEY_REFERENCE)).toBeNull();
  });

  it('tells a watcher which reference changed', async () => {
    const vault = new SecretApiKeyVault(secrets);
    const seen: string[] = [];
    const stop = vault.watch((reference) => {
      seen.push(reference);
    });

    await vault.write(DEEPSEEK_KEY_REFERENCE, KEY);
    await vault.remove(DEEPSEEK_KEY_REFERENCE);
    stop();
    await vault.write(DEEPSEEK_KEY_REFERENCE, KEY);

    expect(seen).toStrictEqual([DEEPSEEK_KEY_REFERENCE, DEEPSEEK_KEY_REFERENCE]);
  });
});
