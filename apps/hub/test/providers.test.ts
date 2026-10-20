import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  ApiError,
  type Provider,
  type ProviderCredentials,
  type ProviderLinkRow,
} from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ShownPrompt } from '../src/adapters/contract';
import { ProviderManager } from '../src/providers/manager';
import { linkAccount } from '../src/providers/registry-types';
import { SecretStore } from '../src/secrets/store';
import { EventRouter } from '../src/state/event-router';
import { Inventory } from '../src/state/inventory';
import { StateWriter } from '../src/state/state-writer';
import { testDatabase, type TestDatabase } from './support/database';
import { FakeClock } from './support/fake-clock';
import { LAMP, fakeModule, type FakeModule } from './support/fake-provider';
import { captureLogs, testLogger } from './support/logs';

const CREDENTIALS: ProviderCredentials = {
  provider: 'xiaomi',
  username: 'person@example.com',
  password: 'pw',
  region: 'de',
};

let directory = '';
const databases: TestDatabase[] = [];

const linkOf = (db: TestDatabase, provider: Provider): ProviderLinkRow | undefined =>
  db.store.providers.find(provider);

interface Setup {
  db: TestDatabase;
  fake: FakeModule;
  secrets: SecretStore;
  manager: ProviderManager;
  inventory: Inventory;
  state: StateWriter;
  events: EventRouter;
  accountChanges: { readonly provider: string; readonly label: string | null }[];
}

async function until(condition: () => boolean): Promise<void> {
  while (!condition()) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

async function setup(): Promise<Setup> {
  const db = await testDatabase();
  databases.push(db);
  const fake = fakeModule();
  const secrets = await SecretStore.open(join(directory, 'secrets'), Buffer.alloc(32, 9));
  const inventory = new Inventory(db.database, {
    onlineChanged: (): void => undefined,
    devicesChanged: (): void => undefined,
    lifecycle: (): void => undefined,
  });
  const state = new StateWriter({
    store: db.database,
    inventory,
    clock: new FakeClock('2026-10-08T10:00:00.000Z'),
    log: testLogger(),
    changed: (): void => undefined,
    moved: (): void => undefined,
  });
  const events = new EventRouter({
    store: db.database,
    inventory,
    log: testLogger(),
    recorded: (): void => undefined,
  });
  const accountChanges: Setup['accountChanges'] = [];
  const manager = new ProviderManager({
    registry: { xiaomi: fake.module },
    secrets,
    store: db.database,
    inventory,
    state,
    events,
    dataDirectory: directory,
    accountChanged: (provider, account): Promise<void> => {
      accountChanges.push({ provider, label: account?.label ?? null });
      return Promise.resolve();
    },
    log: testLogger(),
  });
  return { db, fake, secrets, manager, inventory, state, events, accountChanges };
}

beforeEach(async () => {
  captureLogs();
  directory = await mkdtemp(join(tmpdir(), 'hub-providers-'));
});

afterEach(async () => {
  await Promise.all(databases.splice(0).map((db) => db.close()));
  await rm(directory, { recursive: true, force: true });
});

describe('ProviderManager', () => {
  it('links an account from plain credentials, saves it, starts the adapter and reports the link', async () => {
    const { db, fake, secrets, manager, inventory } = await setup();
    fake.adapter.states = [
      {
        externalId: 'lamp-1',
        capability: 'power',
        value: true,
        observedAt: '2026-10-08T00:00:00Z',
      },
    ];
    expect(await manager.link(CREDENTIALS)).toStrictEqual({ provider: 'xiaomi', deviceCount: 1 });
    expect(fake.linked.map((entry) => entry.username)).toStrictEqual(['person@example.com']);
    expect(secrets.read().accounts.xiaomi).toStrictEqual({
      label: 'person@example.com',
      secrets: { token: 'token-none' },
    });
    expect(manager.adapterFor('xiaomi')).toBe(fake.adapter);
    expect(inventory.deviceOf('xiaomi', 'lamp-1')).toBeDefined();
    expect(linkOf(db, 'xiaomi')).toMatchObject({
      status: 'linked',
      prompt: null,
      last_error: null,
      device_count: 1,
      account_label: 'person@example.com',
    });
    expect((await stat(join(directory, 'providers', 'xiaomi'))).isDirectory()).toBe(true);
    expect(fake.started[0]?.context.dataDirectory).toBe(join(directory, 'providers', 'xiaomi'));
  });

  it('hands the account already stored to a later link so it can reuse what it holds', async () => {
    const { fake, secrets, manager } = await setup();
    await manager.link(CREDENTIALS);
    await manager.link(CREDENTIALS);
    expect(fake.linked[0]?.context.stored).toBeUndefined();
    expect(fake.linked[1]?.context.stored).toStrictEqual(secrets.read().accounts.xiaomi);
  });

  it('asks the person through provider_links and continues with the answer', async () => {
    const { db, fake, manager, secrets } = await setup();
    fake.askDuringLink = true;
    const linking = manager.link(CREDENTIALS);
    await until(() => linkOf(db, 'xiaomi')?.prompt !== null);
    expect(linkOf(db, 'xiaomi')?.prompt).toStrictEqual({
      kind: 'verification_code',
      destination: 'p***@example.com',
    });
    await manager.answer('xiaomi', '482913');
    await linking;
    expect(secrets.read().accounts.xiaomi?.secrets).toStrictEqual({ token: 'token-482913' });
    expect(linkOf(db, 'xiaomi')?.prompt).toBeNull();
  });

  it('refuses an answer nobody asked for', async () => {
    const { manager } = await setup();
    const refused = manager.answer('xiaomi', '1');
    await expect(refused).rejects.toThrow(
      'An answer arrived for xiaomi, but xiaomi is not waiting for one.',
    );
    await expect(refused).rejects.toBeInstanceOf(ApiError);
  });

  it('records a failed link as unlinked with the named error and rethrows it', async () => {
    const { db, fake, manager, secrets } = await setup();
    fake.linkFailure = new Error('captcha rejected');
    await expect(manager.link(CREDENTIALS)).rejects.toThrow('captcha rejected');
    expect(linkOf(db, 'xiaomi')).toMatchObject({
      status: 'unlinked',
      last_error: 'Error: captcha rejected',
      prompt: null,
    });
    expect(secrets.read().accounts).toStrictEqual({});
  });

  it('keeps a running account linked and shows the error when a re-link fails', async () => {
    const { db, fake, manager, secrets } = await setup();
    await manager.link(CREDENTIALS);
    fake.linkFailure = new Error('wrong password');
    await expect(manager.link(CREDENTIALS)).rejects.toThrow('wrong password');
    expect(linkOf(db, 'xiaomi')).toMatchObject({
      status: 'linked',
      last_error: 'Error: wrong password',
    });
    expect(secrets.read().accounts.xiaomi?.label).toBe('person@example.com');
    expect(manager.adapterFor('xiaomi')).toBe(fake.adapter);
    expect(fake.adapter.unsubscribed).toBe(0);
  });

  it('marks a stored account that is not running as needs_attention when a re-link fails', async () => {
    const { db, fake, manager, secrets } = await setup();
    await secrets.saveAccount('xiaomi', { label: 'person@example.com', secrets: { token: 'old' } });
    fake.linkFailure = new Error('wrong password');
    await expect(manager.link(CREDENTIALS)).rejects.toThrow('wrong password');
    expect(linkOf(db, 'xiaomi')).toMatchObject({
      status: 'needs_attention',
      last_error: 'Error: wrong password',
    });
    expect(secrets.read().accounts.xiaomi?.secrets).toStrictEqual({ token: 'old' });
  });

  it('stops a first sign-in at its question and stores nothing', async () => {
    const { db, fake, manager, secrets } = await setup();
    fake.askDuringLink = true;
    const linking = manager.link(CREDENTIALS);
    await until(() => linkOf(db, 'xiaomi')?.prompt !== null);
    await manager.cancelLink('xiaomi');
    await expect(linking).rejects.toThrow('was withdrawn');
    expect(linkOf(db, 'xiaomi')).toMatchObject({
      status: 'unlinked',
      prompt: null,
      phase: null,
      last_error: null,
    });
    expect(secrets.read().accounts).toStrictEqual({});
  });

  it('keeps the account and its devices online when a re-sign-in is stopped', async () => {
    const { db, fake, manager, secrets, inventory } = await setup();
    await manager.link(CREDENTIALS);
    fake.askDuringLink = true;
    const relinking = manager.link({ ...CREDENTIALS, password: 'new' });
    await until(() => linkOf(db, 'xiaomi')?.prompt !== null);
    expect(linkOf(db, 'xiaomi')?.status).toBe('linking');
    await manager.cancelLink('xiaomi');
    await expect(relinking).rejects.toThrow('was withdrawn');
    expect(linkOf(db, 'xiaomi')).toMatchObject({ status: 'linked', prompt: null, phase: null });
    expect(secrets.read().accounts.xiaomi?.secrets).toStrictEqual({ token: 'token-none' });
    expect(manager.adapterFor('xiaomi')).toBe(fake.adapter);
    expect(fake.adapter.unsubscribed).toBe(0);
    expect(inventory.deviceOf('xiaomi', 'lamp-1')?.online).toBe(true);
  });

  it('discards a sign-in that finishes after it was stopped', async () => {
    const { db, fake, manager, secrets } = await setup();
    let release: () => void = () => undefined;
    fake.linkGate = new Promise((resolve) => {
      release = resolve;
    });
    const linking = manager.link(CREDENTIALS);
    await until(() => fake.linked.length === 1);
    await manager.cancelLink('xiaomi');
    release();
    await expect(linking).rejects.toThrow('Signing in to xiaomi was stopped');
    expect(secrets.read().accounts).toStrictEqual({});
    expect(manager.adapterFor('xiaomi')).toBeUndefined();
    expect(linkOf(db, 'xiaomi')).toMatchObject({ status: 'unlinked', last_error: null });
  });

  it('puts a stored account that is not running back to needs_attention when stopped', async () => {
    const first = await setup();
    await first.manager.link(CREDENTIALS);
    const { db, manager } = await setup();
    await manager.cancelLink('xiaomi');
    expect(linkOf(db, 'xiaomi')?.status).toBe('needs_attention');
  });

  it('refuses a provider this hub has no module for', async () => {
    const { manager, db } = await setup();
    await expect(
      manager.link({ provider: 'tuya', method: 'smart_life', userCode: 'EU1234' }),
    ).rejects.toThrow('The tuya provider is not configured on this hub.');
    expect(linkOf(db, 'tuya')?.status).toBe('unlinked');
  });

  it('feeds adapter state, events, device lists and failures into the hub', async () => {
    const { db, fake, manager, inventory, state, events } = await setup();
    await manager.link(CREDENTIALS);
    const sink = fake.adapter.sink;
    sink?.state({
      externalId: 'lamp-1',
      capability: 'brightness',
      value: 10,
      observedAt: '2026-10-08T00:00:00Z',
    });
    sink?.event({
      externalId: 'lamp-1',
      kind: 'button',
      occurredAt: '2026-10-08T00:00:00Z',
      details: {},
    });
    sink?.devices([LAMP, { ...LAMP, externalId: 'lamp-2' }]);
    sink?.failure({
      provider: 'xiaomi',
      externalId: 'lamp-1',
      operation: 'poll',
      cause: new Error('timeout'),
    });
    await new Promise((resolve) => setImmediate(resolve));
    await state.settled();
    await events.settled();
    const lampId = inventory.deviceOf('xiaomi', 'lamp-1')?.id ?? '';
    expect(state.valueOf(lampId, 'brightness')).toBe(10);
    expect(db.store.events.list({ limit: 10 }).map((event) => event.kind)).toStrictEqual([
      'button',
    ]);
    expect(inventory.devicesOf('xiaomi')).toHaveLength(2);
    expect(linkOf(db, 'xiaomi')).toMatchObject({
      device_count: 2,
      last_error: 'poll: Error: timeout',
    });
  });

  it('reports every saved, renewed and removed account', async () => {
    const { fake, manager, accountChanges } = await setup();
    await manager.link(CREDENTIALS);
    await fake.started[0]?.context.saveAccount({ label: 'renewed', secrets: {} });
    await manager.handle({ capability: 'hub:unlink_provider', value: { provider: 'xiaomi' } });
    expect(accountChanges).toStrictEqual([
      { provider: 'xiaomi', label: 'person@example.com' },
      { provider: 'xiaomi', label: 'renewed' },
      { provider: 'xiaomi', label: null },
    ]);
  });

  it('saves refreshed accounts and raises attention through the run context', async () => {
    const { db, fake, manager, secrets } = await setup();
    await manager.link(CREDENTIALS);
    const context = fake.started[0]?.context;
    await context?.saveAccount({ label: 'renewed', secrets: { token: 'new' } });
    await context?.needsAttention(new Error('The Xiaomi session expired; link it again.'));
    expect(secrets.read().accounts.xiaomi?.label).toBe('renewed');
    expect(linkOf(db, 'xiaomi')).toMatchObject({
      status: 'needs_attention',
      last_error: 'The Xiaomi session expired; link it again.',
    });
  });

  it('starts every saved account on boot and reports the ones that fail', async () => {
    const first = await setup();
    await first.manager.link(CREDENTIALS);
    const { manager, fake, db } = await setup();
    await manager.startLinked();
    expect(fake.started).toHaveLength(1);
    expect(manager.adapterFor('xiaomi')).toBe(fake.adapter);
    fake.adapter.discover = (): Promise<never> => Promise.reject(new Error('cloud down'));
    await manager.startLinked();
    expect(linkOf(db, 'xiaomi')).toMatchObject({
      status: 'needs_attention',
      last_error: 'Error: cloud down',
    });
    expect(fake.adapter.unsubscribed).toBe(1);
  });

  it('discovers again on request, for one provider or all, and refuses one that is not running', async () => {
    const { fake, manager, inventory } = await setup();
    await expect(
      manager.handle({ capability: 'hub:discover', value: { provider: 'xiaomi' } }),
    ).rejects.toThrow('The xiaomi provider is not linked or not running on this hub.');
    await manager.link(CREDENTIALS);
    fake.adapter.devices = [LAMP, { ...LAMP, externalId: 'lamp-3' }];
    expect(
      await manager.handle({ capability: 'hub:discover', value: { provider: null } }),
    ).toStrictEqual({ xiaomi: 2 });
    expect(
      await manager.handle({ capability: 'hub:discover', value: { provider: 'xiaomi' } }),
    ).toStrictEqual({ xiaomi: 2 });
    expect(inventory.devicesOf('xiaomi')).toHaveLength(2);
  });

  it('unlinks: stops the adapter, forgets the account, marks devices offline and reports it', async () => {
    const { db, fake, manager, secrets, inventory } = await setup();
    await manager.link(CREDENTIALS);
    expect(
      await manager.handle({ capability: 'hub:unlink_provider', value: { provider: 'xiaomi' } }),
    ).toStrictEqual({
      provider: 'xiaomi',
    });
    expect(fake.adapter.unsubscribed).toBe(1);
    expect(manager.adapterFor('xiaomi')).toBeUndefined();
    expect(secrets.read().accounts).toStrictEqual({});
    expect(inventory.deviceOf('xiaomi', 'lamp-1')?.online).toBe(false);
    expect(linkOf(db, 'xiaomi')).toMatchObject({
      status: 'unlinked',
      account_label: null,
      device_count: 1,
    });
    await manager.stopAll();
  });

  it('withdraws a pending question when the link is replaced', async () => {
    const { fake, manager } = await setup();
    fake.askDuringLink = true;
    const first = manager.link(CREDENTIALS);
    await until(() => fake.linked.length === 1);
    const second = manager.link(CREDENTIALS);
    await expect(first).rejects.toThrow(
      'The question for xiaomi was replaced by a newer one before it was answered.',
    );
    await until(() => fake.linked.length === 2);
    await manager.stopAll();
    await expect(second).rejects.toThrow(
      'The question for xiaomi was withdrawn because xiaomi stopped.',
    );
  });

  it('links every provider through its own module', async () => {
    const context = {
      log: testLogger(),
      dataDirectory: directory,
      ask: (): Promise<string> => Promise.resolve(''),
      show: (): Promise<ShownPrompt> =>
        Promise.resolve({ answer: Promise.resolve(''), dismiss: () => Promise.resolve() }),
    };
    const account = { label: 'x', secrets: {} };
    const module = {
      link: (): Promise<typeof account> => Promise.resolve(account),
      start: (): Promise<never> => Promise.reject(new Error('unused')),
    };
    const registry = {
      xiaomi: { ...module, provider: 'xiaomi' as const },
      tuya: { ...module, provider: 'tuya' as const },
      smartthings: { ...module, provider: 'smartthings' as const },
      samsung_tv: { ...module, provider: 'samsung_tv' as const },
    };
    await expect(
      linkAccount(registry, { provider: 'tuya', method: 'smart_life' }, context),
    ).resolves.toBe(account);
    await expect(
      linkAccount(
        registry,
        { provider: 'smartthings', code: 'c', redirectUri: 'https://x.test/cb' },
        context,
      ),
    ).resolves.toBe(account);
    await expect(
      linkAccount(registry, { provider: 'samsung_tv', host: '10.0.0.2', name: 'TV' }, context),
    ).resolves.toBe(account);
    expect(() =>
      linkAccount({}, { provider: 'samsung_tv', host: '10.0.0.2', name: 'TV' }, context),
    ).toThrow('The samsung_tv provider is not configured on this hub.');
  });
});
