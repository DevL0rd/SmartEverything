import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createSealingKeys,
  seal,
  type ProviderHubCommand,
  type Sealed,
} from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ProviderManager } from '../src/providers/manager';
import { linkAccount } from '../src/providers/registry-types';
import { SecretStore } from '../src/secrets/store';
import { EventRouter } from '../src/state/event-router';
import { Inventory } from '../src/state/inventory';
import { StateWriter } from '../src/state/state-writer';
import { FakeDatabase } from './support/fake-database';
import { LAMP, fakeModule, type FakeModule } from './support/fake-provider';
import { captureLogs, testLogger } from './support/logs';

const KEYS = createSealingKeys();
const CREDENTIALS = {
  provider: 'xiaomi',
  username: 'person@example.com',
  password: 'pw',
  region: 'de',
};

let directory = '';

interface Setup {
  db: FakeDatabase;
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
  const db = new FakeDatabase();
  const fake = fakeModule();
  const secrets = await SecretStore.open(join(directory, 'secrets'), Buffer.alloc(32, 9));
  await secrets.update((current) => ({ ...current, sealingKeys: KEYS }));
  const inventory = new Inventory(db, {
    onlineChanged: (): void => undefined,
    devicesChanged: (): void => undefined,
  });
  const state = new StateWriter({
    store: db,
    inventory,
    log: testLogger(),
    changed: (): void => undefined,
  });
  const events = new EventRouter({
    store: db,
    inventory,
    log: testLogger(),
    recorded: (): void => undefined,
  });
  const accountChanges: Setup['accountChanges'] = [];
  const manager = new ProviderManager({
    registry: { xiaomi: fake.module },
    secrets,
    store: db,
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

function sealed(value: unknown): Sealed {
  return seal(KEYS.publicKey, typeof value === 'string' ? value : JSON.stringify(value));
}

function link(credentials: unknown = CREDENTIALS): ProviderHubCommand {
  return {
    capability: 'hub:link_provider',
    value: { provider: 'xiaomi', credentials: sealed(credentials) },
  };
}

beforeEach(async () => {
  captureLogs();
  directory = await mkdtemp(join(tmpdir(), 'hub-providers-'));
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

describe('ProviderManager', () => {
  it('links an account from sealed credentials, saves it, starts the adapter and reports the link', async () => {
    const { db, fake, secrets, manager, inventory } = await setup();
    fake.adapter.states = [
      {
        externalId: 'lamp-1',
        capability: 'power',
        value: true,
        observedAt: '2026-10-08T00:00:00Z',
      },
    ];
    expect(await manager.handle(link())).toStrictEqual({ provider: 'xiaomi', deviceCount: 1 });
    expect(fake.linked.map((entry) => entry.username)).toStrictEqual(['person@example.com']);
    expect(secrets.read().accounts.xiaomi).toStrictEqual({
      label: 'person@example.com',
      secrets: { token: 'token-none' },
    });
    expect(manager.adapterFor('xiaomi')).toBe(fake.adapter);
    expect(inventory.deviceOf('xiaomi', 'lamp-1')).toBeDefined();
    expect(db.links.get('xiaomi')).toStrictEqual({
      status: 'linked',
      prompt: null,
      lastError: null,
      deviceCount: 1,
      accountLabel: 'person@example.com',
    });
    expect((await stat(join(directory, 'providers', 'xiaomi'))).isDirectory()).toBe(true);
    expect(fake.started[0]?.context.dataDirectory).toBe(join(directory, 'providers', 'xiaomi'));
  });

  it('asks the person through provider_links and continues with the sealed answer', async () => {
    const { db, fake, manager, secrets } = await setup();
    fake.askDuringLink = true;
    const linking = manager.handle(link());
    await until(() => db.links.get('xiaomi')?.prompt !== null);
    expect(db.links.get('xiaomi')?.prompt).toStrictEqual({
      kind: 'verification_code',
      destination: 'p***@example.com',
    });
    await manager.handle({
      capability: 'hub:answer_prompt',
      value: { provider: 'xiaomi', answer: sealed('482913') },
    });
    await linking;
    expect(secrets.read().accounts.xiaomi?.secrets).toStrictEqual({ token: 'token-482913' });
    expect(db.links.get('xiaomi')?.prompt).toBeNull();
  });

  it('refuses an answer nobody asked for', async () => {
    const { manager } = await setup();
    await expect(
      manager.handle({
        capability: 'hub:answer_prompt',
        value: { provider: 'xiaomi', answer: sealed('1') },
      }),
    ).rejects.toThrow('An answer arrived for xiaomi, but xiaomi is not waiting for one.');
  });

  it('records a failed link as unlinked with the named error and rethrows it', async () => {
    const { db, fake, manager, secrets } = await setup();
    fake.linkFailure = new Error('captcha rejected');
    await expect(manager.handle(link())).rejects.toThrow('captcha rejected');
    expect(db.links.get('xiaomi')).toMatchObject({
      status: 'unlinked',
      lastError: 'Error: captcha rejected',
      prompt: null,
    });
    expect(secrets.read().accounts).toStrictEqual({});
  });

  it('refuses credentials sealed for another provider or for another key', async () => {
    const { manager } = await setup();
    await expect(
      manager.handle({
        capability: 'hub:link_provider',
        value: { provider: 'tuya', credentials: sealed(CREDENTIALS) },
      }),
    ).rejects.toThrow('The link command was for tuya, but the sealed credentials are for xiaomi.');
    await expect(
      manager.handle({
        capability: 'hub:link_provider',
        value: {
          provider: 'xiaomi',
          credentials: seal(createSealingKeys().publicKey, JSON.stringify(CREDENTIALS)),
        },
      }),
    ).rejects.toThrow('The sealed message could not be opened with this key');
  });

  it('refuses a provider this hub has no module for', async () => {
    const { manager, db } = await setup();
    const tuya = {
      provider: 'tuya',
      accessId: 'a',
      accessSecret: 's',
      region: 'eu',
      appUserId: 'u',
    };
    await expect(
      manager.handle({
        capability: 'hub:link_provider',
        value: { provider: 'tuya', credentials: sealed(tuya) },
      }),
    ).rejects.toThrow('The tuya provider is not configured on this hub.');
    expect(db.links.get('tuya')?.status).toBe('unlinked');
  });

  it('feeds adapter state, events, device lists and failures into the hub', async () => {
    const { db, fake, manager, inventory, state, events } = await setup();
    await manager.handle(link());
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
    expect(db.events.map((event) => event.kind)).toStrictEqual(['button']);
    expect(inventory.devicesOf('xiaomi')).toHaveLength(2);
    expect(db.links.get('xiaomi')).toMatchObject({
      deviceCount: 2,
      lastError: 'poll: Error: timeout',
    });
  });

  it('reports every saved, renewed and removed account', async () => {
    const { fake, manager, accountChanges } = await setup();
    await manager.handle(link());
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
    await manager.handle(link());
    const context = fake.started[0]?.context;
    await context?.saveAccount({ label: 'renewed', secrets: { token: 'new' } });
    await context?.needsAttention('The Xiaomi session expired; link it again.');
    expect(secrets.read().accounts.xiaomi?.label).toBe('renewed');
    expect(db.links.get('xiaomi')).toMatchObject({
      status: 'needs_attention',
      lastError: 'The Xiaomi session expired; link it again.',
    });
  });

  it('starts every saved account on boot and reports the ones that fail', async () => {
    const first = await setup();
    await first.manager.handle(link());
    const { manager, fake, db } = await setup();
    await manager.startLinked();
    expect(fake.started).toHaveLength(1);
    expect(manager.adapterFor('xiaomi')).toBe(fake.adapter);
    fake.adapter.discover = (): Promise<never> => Promise.reject(new Error('cloud down'));
    await manager.startLinked();
    expect(db.links.get('xiaomi')).toMatchObject({
      status: 'needs_attention',
      lastError: 'Error: cloud down',
    });
    expect(fake.adapter.unsubscribed).toBe(1);
  });

  it('discovers again on request, for one provider or all, and refuses one that is not running', async () => {
    const { fake, manager, inventory } = await setup();
    await expect(
      manager.handle({ capability: 'hub:discover', value: { provider: 'xiaomi' } }),
    ).rejects.toThrow('The xiaomi provider is not linked or not running on this hub.');
    await manager.handle(link());
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
    await manager.handle(link());
    expect(
      await manager.handle({ capability: 'hub:unlink_provider', value: { provider: 'xiaomi' } }),
    ).toStrictEqual({
      provider: 'xiaomi',
    });
    expect(fake.adapter.unsubscribed).toBe(1);
    expect(manager.adapterFor('xiaomi')).toBeUndefined();
    expect(secrets.read().accounts).toStrictEqual({});
    expect(inventory.deviceOf('xiaomi', 'lamp-1')?.online).toBe(false);
    expect(db.links.get('xiaomi')).toMatchObject({
      status: 'unlinked',
      accountLabel: null,
      deviceCount: 1,
    });
    await manager.stopAll();
  });

  it('withdraws a pending question when the link is replaced', async () => {
    const { fake, manager } = await setup();
    fake.askDuringLink = true;
    const first = manager.handle(link());
    await until(() => fake.linked.length === 1);
    const second = manager.handle(link());
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
      linkAccount(
        registry,
        { provider: 'tuya', accessId: 'a', accessSecret: 'b', region: 'eu', appUserId: 'c' },
        context,
      ),
    ).resolves.toBe(account);
    await expect(
      linkAccount(
        registry,
        { provider: 'smartthings', code: 'c', redirectUri: 'https://x.test/cb' },
        context,
      ),
    ).resolves.toBe(account);
    await expect(
      linkAccount(
        registry,
        { provider: 'samsung_tv', host: '10.0.0.2', macAddress: '00:11:22:33:44:55', name: 'TV' },
        context,
      ),
    ).resolves.toBe(account);
    expect(() =>
      linkAccount(
        {},
        { provider: 'samsung_tv', host: '10.0.0.2', macAddress: '00:11:22:33:44:55', name: 'TV' },
        context,
      ),
    ).toThrow('The samsung_tv provider is not configured on this hub.');
  });
});
