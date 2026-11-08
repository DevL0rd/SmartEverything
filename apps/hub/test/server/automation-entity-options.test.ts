import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import {
  API_ENDPOINTS,
  PLUGIN_AUTOMATION,
  PLUGIN_MANIFEST,
  type ClientRow,
  type PluginManifestInput,
  type PluginOptionPage,
} from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { withExecutionAuthority } from '../../src/assistant/turn-authority';
import type { ConversationAuthority } from '../../src/harness/authority-contract';
import { DriverNodes } from '../../src/automations/plugin-kinds/driver-nodes';
import { WATCH_AUTOMATION } from '../../src/local/watch-automation';
import { PluginAdmin } from '../../src/plugins/plugin-admin';
import { PluginHost } from '../../src/plugins/host';
import { PluginPeople } from '../../src/plugins/plugin-people';
import { PluginSecrets } from '../../src/plugins/plugin-secrets';
import { PluginSpeakers } from '../../src/plugins/plugin-speakers';
import type { BuiltinPlugin } from '../../src/plugins/builtin/contract';
import type { Caller } from '../../src/server/auth';
import { automationEntityOptionsRoutes } from '../../src/server/handlers/automation-entity-options';
import { SecretStore } from '../../src/secrets/store';
import { Transcripts } from '../../src/transcripts/transcript-service';
import { testLogger } from '../support/logs';
import { testStore, type TestStore } from '../support/store';
import { writeFakeListsPlugin } from '../plugins/fake-lists-plugin';
import { hubLayout } from '../../src/data-layout';

function nothing(): void {
  return undefined;
}

function unused(): never {
  throw new Error(
    'This test runs no feature of the built-in plugin context beyond its option lists.',
  );
}

function now(): Date {
  return new Date();
}

const PAGE = (ids: readonly string[]): PluginOptionPage => ({
  state: 'ready',
  options: ids.map((id) => ({ id, label: `#${id}`, detail: null, color: null, image: null })),
  next: null,
});

const CHATTY: BuiltinPlugin = {
  manifest: {
    id: 'chatty',
    name: 'Chatty',
    version: '1.0.0',
    description: 'A built-in plugin whose lists depend on who asks',
    publisher: 'Tests',
    contributes: {
      automation: {
        entities: [{ id: 'channel', title: 'Channel', plural: 'Channels', options: 'channels' }],
      },
    },
  },
  validate: (): null => null,
  start: (context) => {
    context.options.register('channels', (_query, caller) =>
      Promise.resolve(PAGE(caller.role === 'owner' ? ['general', 'staff'] : ['general'])),
    );
    context.options.register('servers', () => Promise.resolve(PAGE(['home-server'])));
    return Promise.resolve({ ok: true, stop: (): Promise<void> => Promise.resolve() });
  },
};

const ENTITIES = [
  { id: 'thing', title: 'Thing', plural: 'Things', options: 'list_things' },
  { id: 'down', title: 'Down', plural: 'Downs', options: 'list_down' },
  { id: 'bad', title: 'Bad', plural: 'Bads', options: 'list_bad' },
  { id: 'hidden', title: 'Hidden', plural: 'Hiddens', options: 'hidden_list' },
  { id: 'lost', title: 'Lost', plural: 'Losts', options: 'no_such_tool' },
] as const;

let opened: TestStore;
let host: PluginHost;
let routes: ReturnType<typeof automationEntityOptionsRoutes>;
let drivers: DriverNodes;
let owner: ClientRow;
let member: ClientRow;

async function rigged(store: TestStore['store'], directory: string): Promise<PluginHost> {
  const secrets = await SecretStore.open(join(directory, 'secrets'), randomBytes(32));
  return new PluginHost({
    store,
    secrets: new PluginSecrets(secrets),
    builtins: [CHATTY],
    builtin: {
      drivers: {
        registry: { register: (): (() => void) => nothing },
        viewers: { watch: (): (() => void) => nothing, watched: (): boolean => false },
        metrics: { push: nothing },
        sources: { push: nothing },
        deviceIdOf: (): undefined => undefined,
        target: (deviceId): string => `device:${deviceId}`,
      },
      people: new PluginPeople(store),
      speakers: new PluginSpeakers(),
      voice: {
        store,
        host: unused,
        turn: unused,
        chat: unused,
        keys: { changes: (): (() => void) => nothing },
        ears: { open: unused },
        transcripts: new Transcripts({
          store,
          clock: { now, at: (): (() => void) => nothing },
          log: testLogger('transcripts'),
        }),
        transcriber: { transcribe: unused },
        names: (): string[] => [],
        keyPresent: (): boolean => false,
        clock: { now, at: (): (() => void) => nothing },
        log: testLogger('plugin-voice'),
      },
      conversations: {
        forPlugin: () => ({
          settings: unused,
          conversation: unused,
          usage: unused,
          compact: unused,
          startOver: unused,
          stop: unused,
          setModel: unused,
        }),
      },
      attachments: (): string[] => [],
      machineFile: (): Promise<null> => Promise.resolve(null),
      uploadFile: (): Promise<null> => Promise.resolve(null),
      pictureFile: (): Promise<null> => Promise.resolve(null),
      layout: hubLayout(directory, {}),
      submit: (): [] => [],
      signals: { emit: nothing },
      now,
    },
    contributions: {
      signals: { emit: nothing, register: (): (() => void) => nothing },
      inbound: nothing,
      now,
    },
    configure: (): Promise<void> => Promise.resolve(),
    layout: hubLayout(directory, {}),
    mcpUrl: (): string => 'http://127.0.0.1:1',
    now,
    log: testLogger('plugins'),
  });
}

async function addListsPlugin(store: TestStore['store'], directory: string): Promise<void> {
  const script = await writeFakeListsPlugin(directory);
  const input: PluginManifestInput = {
    id: 'lists',
    name: 'Lists',
    version: '1.0.0',
    description: 'An external plugin that lists things',
    publisher: 'Tests',
    mcp: { transport: 'stdio', command: process.execPath, args: [script] },
    permissions: { seAreas: ['devices'], inbound: false },
    contributes: { automation: { entities: [...ENTITIES] } },
  };
  store.plugins.create({
    manifest: PLUGIN_MANIFEST.parse(input),
    source: 'local',
    location: null,
    trusted: true,
  });
  store.plugins.update('lists', { enabled: true, toolSwitches: { hidden_list: false } });
}

beforeEach(async () => {
  opened = await testStore();
  const { store, directory } = opened;
  owner = store.clients.create(
    { name: 'Owner', platform: 'desktop', role: 'owner', tokenHash: 'a'.repeat(64) },
    true,
  );
  member = store.clients.create(
    { name: 'Member', platform: 'android', role: 'member', tokenHash: 'b'.repeat(64) },
    false,
  );
  await addListsPlugin(store, directory);
  host = await rigged(store, directory);
  const admin = new PluginAdmin({
    store,
    secrets: new PluginSecrets(await SecretStore.open(join(directory, 'admin'), randomBytes(32))),
    host: (): PluginHost => host,
    inbox: unused,
    people: new PluginPeople(store),
    validate: (): null => null,
    fetch,
  });
  drivers = new DriverNodes();
  routes = automationEntityOptionsRoutes(
    { store, hub: { automationKinds: { driverNodes: drivers } } },
    admin,
  );
  await host.boot();
  store.plugins.update('chatty', { enabled: true });
  await host.launch('chatty');
});

afterEach(async () => {
  await host.shutdown();
  await opened.close();
});

function ask(
  caller: Caller,
  pluginId: string,
  entity: string,
  query: Record<string, string> = {},
): Promise<unknown> {
  return routes.readAutomationEntityOptions.run(
    caller,
    { params: { pluginId, entity }, query, body: undefined, remote: 'test', headers: {} },
    testLogger(),
  );
}

function authority(role: 'owner' | 'member', hubOsBan: boolean): ConversationAuthority {
  return {
    event_id: '00000000-0000-4000-8000-0000000000b1',
    profile_id: '00000000-0000-4000-8000-000000000003',
    client_id: null,
    kind: 'service',
    role,
    hub_os_ban: hubOsBan,
    tools: null,
    plugin_id: null,
    requester: null,
  };
}

const asOwner = (): Caller => ({ kind: 'client', client: owner });
const asMember = (): Caller => ({ kind: 'client', client: member });

describe('automation entity options', () => {
  it('is a member endpoint while the settings lists stay owner only', () => {
    expect(API_ENDPOINTS.readAutomationEntityOptions.access).toBe('member');
    expect(API_ENDPOINTS.readPluginOptions.access).toBe('owner');
  });

  it('tells a built-in provider who asks, so a member sees less than the owner', async () => {
    const idsOf = (page: unknown): string[] => {
      const parsed = API_ENDPOINTS.readAutomationEntityOptions.response.parse(page);
      return parsed.state === 'ready' ? parsed.options.map((option) => option.id) : [];
    };
    expect(idsOf(await ask(asOwner(), 'chatty', 'channel'))).toEqual(['general', 'staff']);
    expect(idsOf(await ask(asMember(), 'chatty', 'channel'))).toEqual(['general']);
  });

  it('serves the entity lists of a device driver that is no plugin', async () => {
    const stop = drivers.register('watch', PLUGIN_AUTOMATION.parse(WATCH_AUTOMATION.automation), {
      tools: [],
      options: {
        faces: () =>
          Promise.resolve({
            state: 'ready',
            options: [{ id: 'face-1', label: 'Neon', detail: null, color: null, image: null }],
            next: null,
          }),
      },
    });
    expect(await ask(asMember(), 'watch', 'face')).toMatchObject({
      state: 'ready',
      options: [{ id: 'face-1' }],
    });
    stop();
    await expect(ask(asMember(), 'watch', 'face')).rejects.toThrow();
  });

  it('reaches only the lists an entity declares, never a settings-only list', async () => {
    await expect(ask(asMember(), 'chatty', 'servers')).rejects.toMatchObject({
      code: 'not_found',
      message: 'Chatty has no entity named servers.',
    });
  });

  it('calls the list tool of an external plugin with q, after and ids', async () => {
    const page = await ask(asMember(), 'lists', 'thing', { q: 'kit', after: 'c9', ids: 'a,b' });
    expect(page).toMatchObject({
      state: 'ready',
      options: [{ id: 't1', label: JSON.stringify({ q: 'kit', after: 'c9', ids: ['a', 'b'] }) }],
      next: null,
    });
    const bare = await ask(asMember(), 'lists', 'thing');
    expect(bare).toMatchObject({ options: [{ label: '{}' }] });
  });

  it('refuses a hub-originated owner or member list call to an external local process', async () => {
    await expect(
      withExecutionAuthority(authority('owner', true), () => ask(asOwner(), 'lists', 'thing')),
    ).rejects.toMatchObject({ code: 'forbidden' });
    await expect(
      withExecutionAuthority(authority('member', true), () => ask(asMember(), 'lists', 'thing')),
    ).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('still lists for an execution that is not hub-originated', async () => {
    await expect(
      withExecutionAuthority(authority('member', false), () => ask(asMember(), 'lists', 'thing')),
    ).resolves.toMatchObject({ state: 'ready' });
  });

  it('answers unavailable with the reason when the list tool fails', async () => {
    await expect(ask(asMember(), 'lists', 'down')).resolves.toEqual({
      state: 'unavailable',
      message: 'The service is not signed in',
    });
  });

  it('refuses an answer that is not an option page', async () => {
    await expect(ask(asMember(), 'lists', 'bad')).rejects.toMatchObject({
      code: 'upstream_failed',
    });
  });

  it('reports a list tool the plugin does not have', async () => {
    await expect(ask(asMember(), 'lists', 'lost')).rejects.toMatchObject({ code: 'not_found' });
  });

  it('says unavailable when the owner switched the list tool off', async () => {
    await expect(ask(asMember(), 'lists', 'hidden')).resolves.toEqual({
      state: 'unavailable',
      message: 'Lists has its hidden_list tool switched off.',
    });
  });

  it('reports an entity the plugin does not declare', async () => {
    await expect(ask(asMember(), 'lists', 'nothing')).rejects.toMatchObject({
      code: 'not_found',
      message: 'Lists has no entity named nothing.',
    });
  });
});
