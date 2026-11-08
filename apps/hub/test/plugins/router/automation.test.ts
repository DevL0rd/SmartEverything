import {
  isShippedKind,
  JSON_VALUE,
  PLUGIN_MANIFEST,
  pluginNodeKindId,
  pluginNodeModes,
  pluginTriggerKindId,
  type NetworkClient,
  type PluginEvent,
  type PluginOptionPage,
  type PluginOptionQuery,
  type PresencePerson,
  type RouterCommand,
  type RouterSnapshot,
  type SpeedTestResult,
} from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  failure,
  type HubTool,
  type ToolCaller,
  type ToolSource,
} from '../../../src/ai-tools/hub-tool';
import { ToolHub } from '../../../src/ai-tools/tool-hub';
import { assembleContribution } from '../../../src/automations/plugin-kinds/assemble';
import { createKindCatalog, syncContribution } from '../../../src/automations/plugin-kinds/catalog';
import { pluginContribution } from '../../../src/automations/plugin-kinds/contributions';
import {
  PLUGIN_NODE_PREFIX,
  pluginNodeEffects,
} from '../../../src/automations/plugin-kinds/perform';
import {
  pluginValueHandler,
  valueBindingOf,
} from '../../../src/automations/world-v3/plugin-values';
import { expectContributionValid } from '../../../src/plugins/builtin/automation-kit';
import type { PluginOptionProvider, PluginTool } from '../../../src/plugins/builtin/contract';
import { routerPlugin } from '../../../src/plugins/builtin/router';
import { CLIENT_PICKER, PEOPLE_PICKER } from '../../../src/plugins/builtin/router/automation';
import { ClientRegistry } from '../../../src/plugins/builtin/router/client-registry';
import { registerRouterPickers } from '../../../src/plugins/builtin/router/pickers';
import { routerTools } from '../../../src/plugins/builtin/router/tools';
import { testRun } from '../../automations-v3/effects/support';
import { testStore, type TestStore } from '../../support/store';
import { memoryRecords } from '../memory-records';

const MANIFEST = PLUGIN_MANIFEST.parse(routerPlugin.manifest);

const OWNER = { kind: 'plugin', id: 'router' } as const;

const NOW = '2026-10-25T10:00:00.000Z';

const ANNA = '10000000-0000-4000-8000-000000000001';
const BEN = '10000000-0000-4000-8000-000000000002';
const LAPTOP = 'aa:bb:cc:00:00:01';
const PHONE = 'aa:bb:cc:00:00:02';
const TV = 'aa:bb:cc:00:00:03';

const CALLER: ToolCaller = {
  profileId: ANNA,
  role: 'owner',
  chatId: null,
  via: 'automation',
  clientId: null,
};

function client(mac: string, patch: Partial<NetworkClient> = {}): NetworkClient {
  return {
    mac,
    name: mac,
    ip: null,
    connection: null,
    band: null,
    connected: false,
    blocked: false,
    trafficBytesPerSecond: null,
    profileId: null,
    personId: null,
    firstSeen: null,
    lastSeen: null,
    ...patch,
  };
}

function person(id: string, name: string, patch: Partial<PresencePerson> = {}): PresencePerson {
  return {
    id,
    name,
    profile: true,
    tracked: true,
    home: false,
    since: null,
    viaPhone: false,
    devices: [],
    ...patch,
  };
}

function snapshot(patch: Partial<RouterSnapshot> = {}): RouterSnapshot {
  return {
    at: NOW,
    connection: { state: 'online' },
    cadence: 'slow',
    intervalSeconds: null,
    info: null,
    system: null,
    network: null,
    radios: [],
    stations: [],
    clients: [],
    people: [],
    ...patch,
  };
}

const HOUSE = snapshot({
  clients: [
    client(LAPTOP, {
      name: 'Anna laptop',
      ip: '192.168.1.20',
      connection: 'wifi',
      band: '5GHz',
      connected: true,
      profileId: ANNA,
      lastSeen: NOW,
    }),
    client(PHONE, {
      name: 'Ben phone',
      ip: '192.168.1.21',
      connection: 'wired',
      connected: true,
      personId: BEN,
    }),
    client(TV, { name: 'Living room TV', connected: false }),
  ],
  stations: [
    {
      mac: LAPTOP,
      band: '5GHz',
      rssiDbm: -58,
      txMbps: 400,
      rxMbps: 380,
      phyMbps: 1200,
      trafficBytesPerSecond: 0,
    },
  ],
  people: [person(ANNA, 'Anna', { home: true }), person(BEN, 'Ben', { profile: false })],
});

const SPEED: SpeedTestResult = {
  id: '20000000-0000-4000-8000-000000000001',
  at: NOW,
  server: 'Cloudflare',
  downloadMbps: 481.5,
  uploadMbps: 52.25,
  pingMs: 11.5,
  jitterMs: 1.5,
  packetLossPercent: 0,
};

interface Rig {
  readonly tools: PluginTool[];
  readonly commands: RouterCommand[];
  readonly speedRuns: () => number;
}

function rigOf(current: () => RouterSnapshot, tests: readonly SpeedTestResult[] = [SPEED]): Rig {
  const commands: RouterCommand[] = [];
  let runs = 0;
  const tools = routerTools({
    snapshot: current,
    people: {
      list: () => [],
      manage: () => {
        throw new Error('unused');
      },
      link: () => {
        throw new Error('unused');
      },
    },
    command: (command) => {
      commands.push(command);
      return Promise.resolve('done');
    },
    speedTest: () => {
      runs += 1;
      return Promise.resolve(SPEED);
    },
    speedTests: () => tests,
    setPaused: () => Promise.resolve(),
    importRouterMonitor: () => Promise.resolve(),
  });
  return { tools, commands, speedRuns: () => runs };
}

describe('the router automation declaration', () => {
  it('is valid and runs only tools the plugin registers', () => {
    const names = rigOf(() => HOUSE).tools.map((tool) => tool.name);
    expect(names).toEqual(expect.arrayContaining(['client_access', 'restart', 'update_client']));
    expect(names).toEqual(
      expect.not.arrayContaining([
        'cut_off_client',
        'restart_wifi',
        'reboot',
        'find_clients',
        'latest_speed_test',
      ]),
    );
    expect(expectContributionValid(routerPlugin, { tools: names }).rejections).toEqual([]);
  });

  it('serves every node, value and trigger as a kind of the router plugin', () => {
    const catalog = createKindCatalog();
    expect(syncContribution(catalog, pluginContribution(MANIFEST)).rejections).toEqual([]);
    const ids = [
      'speed_test',
      'client_access',
      'restart',
      'rename_client',
      'clients',
      'last_speed_test',
      'client',
      'wifi_link',
    ].map((local) => pluginNodeKindId(OWNER, local));
    expect(ids.map((id) => catalog.get(id)?.id)).toEqual(ids);
    const triggers = ['client_joined', 'client_left'].map((local) =>
      pluginTriggerKindId(OWNER, local),
    );
    expect(triggers.map((id) => catalog.get(id)?.class)).toEqual(['trigger', 'trigger']);
  });

  it('hides the router person triggers and points to the core presence trigger', () => {
    const catalog = createKindCatalog();
    syncContribution(catalog, pluginContribution(MANIFEST));
    const person = ['person_arrived', 'person_left'].map((local) =>
      pluginTriggerKindId(OWNER, local),
    );
    for (const id of person) {
      const kind = catalog.get(id);
      expect(kind).toMatchObject({
        class: 'trigger',
        hidden: true,
        replacedBy: 'trigger.presence',
      });
      expect(kind === undefined ? true : isShippedKind(kind)).toBe(false);
    }
    const shown = ['client_joined', 'client_left'].map((local) =>
      catalog.get(pluginTriggerKindId(OWNER, local)),
    );
    expect(shown.map((kind) => (kind === undefined ? false : isShippedKind(kind)))).toEqual([
      true,
      true,
    ]);
    expect(MANIFEST.contributes.events.map((event) => event.kind)).toEqual(
      expect.arrayContaining(['person_arrived', 'person_left']),
    );
  });

  it('waits for a speed test and sends the router commands by default', () => {
    const nodes = new Map(MANIFEST.contributes.automation.nodes.map((node) => [node.id, node]));
    const modes = (id: string): unknown => {
      const node = nodes.get(id);
      if (node === undefined) throw new Error(`no node ${id}`);
      return pluginNodeModes(node);
    };
    expect(modes('speed_test')).toEqual({
      default: 'wait_for_result',
      allowed: ['wait_for_result'],
    });
    expect(nodes.get('speed_test')?.timeout?.default).toBe(60_000);
    for (const id of ['client_access', 'restart', 'rename_client']) {
      expect(modes(id)).toEqual({
        default: 'fire_and_forget',
        allowed: ['fire_and_forget', 'wait_for_result'],
      });
    }
    for (const id of ['clients', 'last_speed_test']) {
      expect(modes(id)).toEqual({ default: 'wait_for_result', allowed: ['wait_for_result'] });
    }
  });

  it('marks the access, restart and rename nodes owner only', () => {
    const access = Object.fromEntries(
      MANIFEST.contributes.automation.nodes.map((node) => [node.id, node.access]),
    );
    expect(access).toEqual({
      speed_test: 'member',
      client_access: 'owner',
      restart: 'owner',
      rename_client: 'owner',
      clients: 'member',
      last_speed_test: 'member',
    });
  });

  it('gives every device and person port an entity picker the plugin registers', () => {
    const { entities, nodes, triggers, values } = MANIFEST.contributes.automation;
    expect(entities.map((entry) => [entry.id, entry.options])).toEqual([
      ['client', CLIENT_PICKER],
      ['person', PEOPLE_PICKER],
    ]);
    const providers = new Map<string, PluginOptionProvider>();
    registerRouterPickers(
      {
        options: {
          register: (source, provider): (() => void) => {
            providers.set(source, provider);
            return () => undefined;
          },
        },
      },
      { snapshot: () => HOUSE },
    );
    expect([...providers.keys()].sort()).toEqual([CLIENT_PICKER, PEOPLE_PICKER].sort());
    const entityOf = (port: { readonly type: { readonly t: string } }): unknown => port.type;
    const ports = [
      ...nodes.flatMap((node) => node.inputs),
      ...triggers.flatMap((trigger) => trigger.filters),
      ...values.flatMap((value) => value.inputs),
    ].filter((port) => port.name === 'device' || port.name === 'person');
    expect(ports.length).toBeGreaterThan(0);
    for (const port of ports) {
      expect(entityOf(port)).toMatchObject({
        t: 'entity',
        of: port.name === 'device' ? 'router.client' : 'router.person',
      });
    }
  });
});

describe('the router client triggers', () => {
  const assembled = assembleContribution(pluginContribution(MANIFEST));

  it('listen to the joined and left events and filter by device and person', () => {
    for (const [local, event] of [
      ['client_joined', 'network_client_joined'],
      ['client_left', 'network_client_left'],
    ] as const) {
      const mapping = assembled.matchers[pluginTriggerKindId(OWNER, local)];
      expect(mapping?.variants['']).toMatchObject({ source: 'plugin_router', kind: event });
      expect(mapping?.matchPorts).toEqual({ device: 'mac', person: 'person_id' });
      expect(mapping?.outputs).toEqual({ mac: 'mac', name: 'name', person: 'profile_id' });
    }
    expect(
      MANIFEST.contributes.events.find((event) => event.kind === 'network_client_joined')?.fields,
    ).toEqual({ mac: 'string', name: 'string', profile_id: 'string', person_id: 'string' });
  });

  it('fire with the person who owns the device, for a profile and for a named person', () => {
    const events: PluginEvent[] = [];
    const registry = new ClientRegistry(
      memoryRecords(),
      (event) => events.push(event),
      new Logger('hub.router'),
    );
    const t0 = new Date(NOW);
    registry.observe([client(LAPTOP, { name: 'Anna laptop', connected: true })], t0);
    registry.observe([client(PHONE, { name: 'Ben phone', connected: true })], t0);
    registry.assign(LAPTOP, { profileId: ANNA, personId: null });
    registry.assign(PHONE, { profileId: null, personId: BEN });
    const gone = [client(LAPTOP), client(PHONE)];
    registry.observe(gone, t0);
    registry.observe(gone, new Date(t0.getTime() + 5 * 60 * 1000));
    const left = events.filter((event) => event.kind === 'network_client_left');
    expect(left.map((event) => event.data)).toEqual([
      { mac: LAPTOP, name: 'Anna laptop', profile_id: ANNA, person_id: ANNA },
      { mac: PHONE, name: 'Ben phone', profile_id: null, person_id: BEN },
    ]);
    const joined = events.filter((event) => event.kind === 'network_client_joined');
    expect(joined.map((event) => event.data['mac'])).toEqual([LAPTOP, PHONE]);
  });
});

describe('the router device pickers', () => {
  function pickers(current: () => RouterSnapshot): ReadonlyMap<string, PluginOptionProvider> {
    const providers = new Map<string, PluginOptionProvider>();
    registerRouterPickers(
      {
        options: {
          register: (source, provider): (() => void) => {
            providers.set(source, provider);
            return () => undefined;
          },
        },
      },
      { snapshot: current },
    );
    return providers;
  }

  function ask(
    providers: ReadonlyMap<string, PluginOptionProvider>,
    source: string,
    query: PluginOptionQuery = {},
  ): Promise<PluginOptionPage> {
    const provider = providers.get(source);
    if (provider === undefined) throw new Error(`no picker ${source}`);
    return provider(query, CALLER);
  }

  function ready(page: PluginOptionPage): readonly { id: string; label: string }[] {
    if (page.state !== 'ready') throw new Error(`not ready: ${page.message}`);
    return page.options.map(({ id, label }) => ({ id, label }));
  }

  it('lists connected devices first, then the ones that are gone, with how they connect', async () => {
    const providers = pickers(() => HOUSE);
    const page = await ask(providers, CLIENT_PICKER);
    expect(ready(page).map((entry) => entry.label)).toEqual([
      'Anna laptop',
      'Ben phone',
      'Living room TV',
    ]);
    if (page.state !== 'ready') throw new Error('not ready');
    expect(page.options.map((entry) => entry.detail)).toEqual([
      '192.168.1.20 · Wi-Fi 5GHz',
      '192.168.1.21 · wired',
      'offline',
    ]);
    expect(page.options.map((entry) => entry.id)).toEqual([LAPTOP, PHONE, TV]);
  });

  it('finds a device by name, address or MAC and resolves chosen ids', async () => {
    const providers = pickers(() => HOUSE);
    expect(ready(await ask(providers, CLIENT_PICKER, { q: 'living' })).map((e) => e.id)).toEqual([
      TV,
    ]);
    expect(
      ready(await ask(providers, CLIENT_PICKER, { q: '192.168.1.21' })).map((e) => e.id),
    ).toEqual([PHONE]);
    const byId = await ask(providers, CLIENT_PICKER, { ids: `${TV},${LAPTOP},aa:bb:cc:99:99:99` });
    expect(ready(byId).map((entry) => entry.id)).toEqual([LAPTOP, TV]);
  });

  it('pages through every device with no cap on how many the router knows', async () => {
    const many = Array.from({ length: 130 }, (_, index) =>
      client(`aa:bb:cc:01:00:${index.toString(16).padStart(2, '0')}`, {
        name: `Device ${String(index).padStart(3, '0')}`,
        connected: true,
      }),
    );
    const providers = pickers(() => snapshot({ clients: many }));
    const seen: string[] = [];
    let after: string | undefined;
    do {
      const page = await ask(providers, CLIENT_PICKER, after === undefined ? {} : { after });
      if (page.state !== 'ready') throw new Error('not ready');
      seen.push(...page.options.map((entry) => entry.id));
      after = page.next ?? undefined;
    } while (after !== undefined);
    expect(seen).toEqual(many.map((entry) => entry.mac));
  });

  it('lists the people the router tracks and whether they are home', async () => {
    const providers = pickers(() => HOUSE);
    const page = await ask(providers, PEOPLE_PICKER);
    if (page.state !== 'ready') throw new Error('not ready');
    expect(page.options.map((entry) => [entry.id, entry.label, entry.detail])).toEqual([
      [ANNA, 'Anna', 'Home'],
      [BEN, 'Ben', 'Away'],
    ]);
  });

  it('says why when the router is not set up', async () => {
    const providers = pickers(() => snapshot({ connection: { state: 'not_set_up' } }));
    for (const source of [CLIENT_PICKER, PEOPLE_PICKER]) {
      expect(await ask(providers, source)).toEqual({
        state: 'unavailable',
        message: 'The router is not set up yet. Add its address in the plugin settings.',
      });
    }
  });
});

let opened: TestStore;

beforeEach(async () => {
  opened = await testStore();
  opened.store.plugins.create({
    manifest: MANIFEST,
    source: 'builtin',
    location: 'builtin',
    trusted: true,
  });
  opened.store.plugins.update('router', { enabled: true });
});

afterEach(async () => {
  await opened.close();
});

describe('the router client values', () => {
  function read(id: string, device: string): unknown {
    const value = MANIFEST.contributes.automation.values.find((entry) => entry.id === id);
    if (value === undefined) throw new Error(`no value ${id}`);
    opened.store.pluginData.publish(
      'router',
      { stream: 'router.snapshot', at: NOW, value: JSON_VALUE.parse(HOUSE) },
      1,
    );
    const handler = pluginValueHandler(opened.store, valueBindingOf('router', value));
    if (handler === undefined) throw new Error('no handler');
    return handler(
      { device },
      { automationId: 'a', nodeId: 'n', nodeKey: 'n', seed: 1, activation: '0' },
    ).outputs;
  }

  it('reads one device from the router snapshot stream', () => {
    expect(read('client', LAPTOP)).toEqual({
      online: true,
      name: 'Anna laptop',
      ip: '192.168.1.20',
      connection: 'wifi',
      lastSeen: NOW,
      person: ANNA,
    });
    expect(read('client', TV)).toEqual({
      online: false,
      name: 'Living room TV',
      ip: null,
      connection: null,
      lastSeen: null,
      person: null,
    });
  });

  it('reads the Wi-Fi signal of a device that is on Wi-Fi and fails for one that is not', () => {
    expect(read('wifi_link', LAPTOP)).toEqual({ signal: -58, band: '5GHz' });
    expect(() => read('wifi_link', PHONE)).toThrow(/no entry for the chosen device/);
  });
});

function hubToolOf(tool: PluginTool): HubTool {
  return {
    name: `router__${tool.name}`,
    title: tool.title,
    description: tool.description,
    inputSchema: tool.inputSchema,
    annotations: tool.annotations,
    origin: { kind: 'plugin', pluginId: 'router' },
    humanOnly: tool.humanOnly,
  };
}

function performer(
  tools: readonly PluginTool[],
): (
  local: string,
  params: Record<string, string | boolean>,
  mode?: 'wait_for_result',
) => Promise<unknown> {
  const byName = new Map(tools.map((tool) => [`router__${tool.name}`, tool]));
  const source: ToolSource = {
    tools: () => tools.map(hubToolOf),
    call: (tool, args, caller) => {
      const found = byName.get(tool.name);
      return found === undefined
        ? Promise.resolve(failure(`no tool ${tool.name}`))
        : found.run(args, caller);
    },
    validate: (tool, args) => byName.get(tool.name)?.validate(args) ?? null,
    changes: () => () => undefined,
  };
  const handlers = pluginNodeEffects({
    store: opened.store,
    events: { record: (): void => undefined },
    clock: { now: (): Date => new Date(NOW) },
    signals: { subscribe: (): (() => void) => () => undefined },
    tools: () => new ToolHub([source]),
  });
  const run = testRun();
  return async (local, params, mode) => {
    const handler = handlers[PLUGIN_NODE_PREFIX];
    if (handler === undefined) throw new Error('no plugin performer');
    return await handler(
      params,
      {
        kind: pluginNodeKindId(OWNER, local),
        node: { id: 'n', key: 'n' },
        path: 'n',
        activation: '0',
        key: 'n',
        params,
        retry: 'idempotent',
        budget: 'effects',
        ...(mode === undefined ? {} : { mode }),
      },
      run,
    );
  };
}

describe('the router nodes in an automation run', () => {
  it('blocks, disconnects and unblocks a device through the one access node', async () => {
    const rig = rigOf(() => HOUSE);
    const run = performer(rig.tools);
    for (const action of ['block', 'disconnect', 'unblock']) {
      expect(await run('client_access', { device: LAPTOP, action }, 'wait_for_result')).toEqual({
        ok: true,
        value: {},
      });
    }
    expect(rig.commands).toEqual([
      { command: 'client', client: { action: 'block', mac: LAPTOP } },
      { command: 'client', client: { action: 'disconnect', mac: LAPTOP } },
      { command: 'client', client: { action: 'unblock', mac: LAPTOP } },
    ]);
  });

  it('sends the access change without waiting for the router', async () => {
    const rig = rigOf(() => HOUSE);
    expect(await performer(rig.tools)('client_access', { device: TV, action: 'block' })).toEqual({
      ok: true,
      value: { sent: true },
    });
    await vi.waitFor(() => {
      expect(rig.commands).toEqual([{ command: 'client', client: { action: 'block', mac: TV } }]);
    });
  });

  it('restarts Wi-Fi or the whole router', async () => {
    const rig = rigOf(() => HOUSE);
    const run = performer(rig.tools);
    await run('restart', { what: 'wifi' }, 'wait_for_result');
    await run('restart', { what: 'router' }, 'wait_for_result');
    expect(rig.commands).toEqual([{ command: 'restart_wifi' }, { command: 'reboot' }]);
  });

  it('renames a device with the real update tool', async () => {
    const rig = rigOf(() => HOUSE);
    await performer(rig.tools)(
      'rename_client',
      { device: PHONE, name: 'Ben iPhone' },
      'wait_for_result',
    );
    expect(rig.commands).toEqual([
      { command: 'client', client: { action: 'rename', mac: PHONE, name: 'Ben iPhone' } },
    ]);
  });

  it('refuses a name the router would reject, naming the problem', async () => {
    const rig = rigOf(() => HOUSE);
    const result = await performer(rig.tools)(
      'rename_client',
      { device: PHONE, name: '<script>' },
      'wait_for_result',
    );
    expect(result).toMatchObject({ ok: false });
    expect(JSON.stringify(result)).toContain('client.name');
    expect(rig.commands).toEqual([]);
  });

  it('runs a speed test and waits for download, upload, latency, jitter and time', async () => {
    const rig = rigOf(() => HOUSE);
    const result = await performer(rig.tools)('speed_test', {}, 'wait_for_result');
    expect(result).toEqual({
      ok: true,
      value: { download: 481.5, upload: 52.25, latency: 11.5, jitter: 1.5, at: NOW },
    });
    expect(rig.speedRuns()).toBe(1);
  });

  it('reads the newest finished speed test and fails clearly when none ran', async () => {
    const latest = await performer(rigOf(() => HOUSE).tools)(
      'last_speed_test',
      {},
      'wait_for_result',
    );
    expect(latest).toEqual({
      ok: true,
      value: { download: 481.5, upload: 52.25, latency: 11.5, jitter: 1.5, at: NOW },
    });
    const none = await performer(rigOf(() => HOUSE, []).tools)(
      'last_speed_test',
      {},
      'wait_for_result',
    );
    expect(none).toMatchObject({ ok: false, code: 'missing_output' });
  });

  it('lists the devices on the network, only the online ones or one person’s', async () => {
    const run = performer(rigOf(() => HOUSE).tools);
    const everyone = await run('clients', {}, 'wait_for_result');
    expect(everyone).toMatchObject({ ok: true, value: { count: 3 } });
    const online = await run('clients', { onlyOnline: true }, 'wait_for_result');
    expect(online).toMatchObject({ ok: true, value: { count: 2 } });
    const anna = await run('clients', { person: ANNA }, 'wait_for_result');
    expect(anna).toEqual({
      ok: true,
      value: {
        count: 1,
        devices: [
          expect.objectContaining({
            mac: LAPTOP,
            name: 'Anna laptop',
            connected: true,
            ip: '192.168.1.20',
            connection: 'wifi',
            lastSeen: NOW,
            profileId: ANNA,
          }),
        ],
      },
    });
    const ben = await run('clients', { person: BEN, onlyOnline: true }, 'wait_for_result');
    expect(ben).toMatchObject({ ok: true, value: { count: 1 } });
  });

  it('fails with the unreachable class when the router is not set up', async () => {
    const rig = rigOf(() => snapshot({ connection: { state: 'not_set_up' } }));
    const run = performer(rig.tools);
    for (const [local, params] of [
      ['client_access', { device: LAPTOP, action: 'block' }],
      ['restart', { what: 'wifi' }],
      ['clients', {}],
    ] as const) {
      expect(await run(local, params, 'wait_for_result')).toMatchObject({
        ok: false,
        class: 'Unreachable',
        code: 'not_set_up',
      });
    }
    expect(rig.commands).toEqual([]);
  });
});
