import { randomBytes } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AutomationSecretUser } from '@smarteverything/domain';
import { automationSecrets, type AutomationSecrets } from '../../src/automations/secrets-v3';
import { automationSecretRoutes } from '../../src/server/handlers/automation-secrets';
import { SecretStore } from '../../src/secrets/store';
import type { Caller } from '../../src/server/auth';
import { testLogger } from '../support/logs';
import { testStore, type TestStore } from '../support/store';

const KEY = randomBytes(32);
const USED = '6f1c1f58-71a3-4d50-8f3e-0d9f5a2d9c11';
const USER: AutomationSecretUser = {
  automationId: '0b6c7d5e-2a1f-4c53-9a9e-8d1b7e4f6a22',
  name: 'Porch light',
};
const NOW = new Date('2026-10-18T10:00:00.000Z');

let directory = '';
let path = '';
let store: SecretStore;
let users: Record<string, AutomationSecretUser[]> = {};
let secrets: AutomationSecrets;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'automation-secrets-'));
  path = join(directory, 'secrets.json');
  store = await SecretStore.open(path, KEY);
  users = {};
  secrets = automationSecrets(
    store,
    (id) => users[id] ?? [],
    () => NOW,
  );
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

describe('automation secrets in the store', () => {
  it('opens a secrets file without the section and leaves it absent until the first write', async () => {
    expect(store.read().automationSecrets).toBeUndefined();
    await store.saveDeviceKey('abc', 'a'.repeat(32));
    const reopened = await SecretStore.open(path, KEY);
    expect(reopened.read().automationSecrets).toBeUndefined();
    expect(reopened.deviceKey('abc')).toBe('a'.repeat(32));
  });

  it('keeps the section across a reopen and keeps other sections', async () => {
    await store.saveDeviceKey('abc', 'b'.repeat(32));
    await store.saveAutomationSecret(USED, {
      name: 'Hook',
      value: 'v',
      createdAt: NOW.toISOString(),
      updatedAt: NOW.toISOString(),
    });
    const reopened = await SecretStore.open(path, KEY);
    expect(reopened.read().automationSecrets?.[USED]?.value).toBe('v');
    expect(reopened.deviceKey('abc')).toBe('b'.repeat(32));
    await reopened.removeAutomationSecret(USED);
    expect(reopened.read().automationSecrets).toStrictEqual({});
  });

  it('never writes a value in plain text', async () => {
    await secrets.set({ name: 'Hook', value: 'plain-text-marker-value' });
    expect(await readFile(path, 'utf8')).not.toContain('plain-text-marker-value');
  });
});

describe('automation secrets service', () => {
  it('creates, lists without values and resolves', async () => {
    const entry = await secrets.set({ name: 'Webhook', value: 'one' });
    expect(entry).toStrictEqual({
      id: entry.id,
      name: 'Webhook',
      createdAt: NOW.toISOString(),
      updatedAt: NOW.toISOString(),
    });
    expect(secrets.list()).toStrictEqual([entry]);
    expect(JSON.stringify(secrets.list())).not.toContain('one');
    expect(secrets.resolve(entry.id)).toBe('one');
    expect(secrets.resolve(USED)).toBeNull();
  });

  it('replaces the value of a secret with the same name and keeps its id and creation date', async () => {
    const first = await secrets.set({ name: 'Webhook', value: 'one' });
    const later = automationSecrets(
      store,
      () => [],
      () => new Date('2026-10-19T00:00:00.000Z'),
    );
    const second = await later.set({ name: 'Webhook', value: 'two' });
    expect(second.id).toBe(first.id);
    expect(second.createdAt).toBe(first.createdAt);
    expect(second.updatedAt).toBe('2026-10-19T00:00:00.000Z');
    expect(later.resolve(first.id)).toBe('two');
    expect(later.list()).toHaveLength(1);
  });

  it('lists in name order', async () => {
    await secrets.set({ name: 'b', value: '1' });
    await secrets.set({ name: 'a', value: '1' });
    expect(secrets.list().map((entry) => entry.name)).toStrictEqual(['a', 'b']);
  });

  it('removes an unused secret and refuses an unknown one', async () => {
    const entry = await secrets.set({ name: 'Webhook', value: 'one' });
    await secrets.remove(entry.id);
    expect(secrets.list()).toStrictEqual([]);
    await expect(secrets.remove(entry.id)).rejects.toThrow('no such secret');
  });

  it('refuses to remove a secret a published revision uses and names the users', async () => {
    const entry = await secrets.set({ name: 'Webhook', value: 'one' });
    users[entry.id] = [USER];
    await expect(secrets.remove(entry.id)).rejects.toThrow('Porch light');
    expect(secrets.resolve(entry.id)).toBe('one');
  });
});

describe('automation secret routes', () => {
  let rig: TestStore;
  let owner: Caller;
  let member: Caller;
  let routes: ReturnType<typeof automationSecretRoutes>;

  const call = (
    name: keyof typeof routes,
    caller: Caller,
    raw: { params?: unknown; body?: unknown } = {},
  ): Promise<unknown> =>
    routes[name].run(
      caller,
      { params: raw.params ?? {}, query: {}, body: raw.body, remote: '127.0.0.1' },
      testLogger('automation-secrets'),
    );

  beforeEach(async () => {
    rig = await testStore();
    owner = {
      kind: 'client',
      client: rig.store.clients.create({
        name: 'Owner',
        platform: 'android',
        role: 'owner',
        tokenHash: 'a'.repeat(64),
      }),
    };
    member = {
      kind: 'client',
      client: rig.store.clients.create({
        name: 'Member',
        platform: 'android',
        role: 'member',
        tokenHash: 'b'.repeat(64),
      }),
    };
    routes = automationSecretRoutes(secrets);
  });

  it('is owner only', async () => {
    await expect(call('listAutomationSecrets', member)).rejects.toMatchObject({
      code: 'forbidden',
    });
    await expect(
      call('setAutomationSecret', member, { body: { name: 'x', value: 'y' } }),
    ).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('sets, lists and removes without ever returning a value', async () => {
    const entry = await call('setAutomationSecret', owner, {
      body: { name: 'Webhook', value: 'topsecret' },
    });
    expect(JSON.stringify(entry)).not.toContain('topsecret');
    expect(JSON.stringify(await call('listAutomationSecrets', owner))).not.toContain('topsecret');
    const id = secrets.list()[0]?.id ?? '';
    users[id] = [USER];
    await expect(
      call('removeAutomationSecret', owner, { params: { secretId: id } }),
    ).rejects.toMatchObject({ code: 'conflict' });
    users[id] = [];
    await expect(
      call('removeAutomationSecret', owner, { params: { secretId: id } }),
    ).resolves.toStrictEqual({
      ok: true,
    });
    await expect(
      call('removeAutomationSecret', owner, { params: { secretId: id } }),
    ).rejects.toMatchObject({ code: 'not_found' });
  });

  it('rejects an empty value', async () => {
    await expect(
      call('setAutomationSecret', owner, { body: { name: 'x', value: '' } }),
    ).rejects.toMatchObject({ code: 'invalid_request' });
  });
});
