import {
  JSON_VALUE,
  PAUSE_MINUTES,
  PLUGIN_MANIFEST,
  QUERY_LOG_PAGE,
  QUERY_LOG_REQUEST,
  pluginNodeKindId,
  pluginSignalSource,
  pluginTriggerKindId,
  signalMatchesMatcher,
  type AdGuardSnapshot,
  type PluginManifest,
  type PluginOptionPage,
  type PluginOptionQuery,
  type SignalInput,
} from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { failure, type HubTool, type ToolSource } from '../../../src/ai-tools/hub-tool';
import { ToolHub } from '../../../src/ai-tools/tool-hub';
import { createKindCatalog, syncContribution } from '../../../src/automations/plugin-kinds/catalog';
import { pluginContribution } from '../../../src/automations/plugin-kinds/contributions';
import {
  PLUGIN_NODE_PREFIX,
  pluginNodeEffects,
} from '../../../src/automations/plugin-kinds/perform';
import { compileTriggers, signalFire } from '../../../src/automations/triggers-v3/armers';
import { AdGuardClient } from '../../../src/plugins/builtin/adguard/adguard-client';
import {
  LOOKUPS_MAX,
  LOOKUPS_MIN,
  MINUTE_MS,
  PAUSE_MAX_MS,
  PAUSE_MIN_MS,
} from '../../../src/plugins/builtin/adguard/automation-tools';
import { adguardPlugin } from '../../../src/plugins/builtin/adguard';
import {
  CLIENT_PICKER,
  FILTER_PICKER,
  clientPicker,
  filterPicker,
  registerAdGuardPickers,
  type PickerWorld,
} from '../../../src/plugins/builtin/adguard/pickers';
import { protectionEvent } from '../../../src/plugins/builtin/adguard/runtime';
import { readPointer } from '../../../src/automations/world-v3/plugin-values';
import { adguardTools, type AdGuardToolPorts } from '../../../src/plugins/builtin/adguard/tools';
import { expectContributionValid } from '../../../src/plugins/builtin/automation-kit';
import type { PluginOptionProvider, PluginTool } from '../../../src/plugins/builtin/contract';
import { testRun } from '../../automations-v3/effects/support';
import { trigger } from '../../support/automation-fixture';
import { testStore, type TestStore } from '../../support/store';
import { fakeHttp } from '../fake-http';

const MANIFEST: PluginManifest = PLUGIN_MANIFEST.parse(adguardPlugin.manifest);

const OWNER = { kind: 'plugin', id: 'adguard' } as const;

const NOW = '2026-10-25T10:00:00.000Z';

const BASE = 'http://adguard.test:3000';

const FILTERS_STATUS = {
  filters: [
    {
      id: 1,
      name: 'AdGuard DNS filter',
      url: 'https://f.test/1.txt',
      enabled: true,
      rules_count: 9,
    },
    { id: 2, name: 'Tracker list', url: 'https://f.test/2.txt', enabled: false, rules_count: 4 },
  ],
  whitelist_filters: [
    { id: -3, name: 'Home allow list', url: 'https://f.test/3.txt', enabled: true, rules_count: 1 },
  ],
  user_rules: ['! note'],
};

const CLIENTS = {
  clients: [{ name: 'Living room TV', ids: ['192.168.1.20', 'aa:bb:cc:dd:ee:ff'] }],
  auto_clients: [
    { ip: '192.168.1.30', name: 'Laptop' },
    { ip: '192.168.1.31', name: '' },
  ],
};

const QUERY_LOG = {
  oldest: '2026-10-25T09:00:00Z',
  data: [
    {
      time: '2026-10-25T09:59:00Z',
      question: { name: 'ads.example.com', type: 'A' },
      client: '192.168.1.30',
      client_info: { name: 'Laptop' },
      reason: 'FilteredBlackList',
      rules: [{ text: '||ads.example.com^' }],
      cached: false,
    },
    {
      time: '2026-10-25T09:58:00Z',
      question: { name: 'good.example.com', type: 'A' },
      client: '192.168.1.31',
      reason: 'NotFilteredNotFound',
      cached: true,
    },
  ],
};

function snapshotOf(overrides: Partial<AdGuardSnapshot> = {}): AdGuardSnapshot {
  return {
    at: NOW,
    url: BASE,
    connection: { state: 'online' },
    cadence: 'slow',
    intervalSeconds: 60,
    status: { version: 'v0.107', running: true, protection: true, pausedUntil: null },
    stats: {
      queries: 100,
      blocked: 20,
      blockedPercent: 20,
      averageMs: 3,
      malware: 0,
      adult: 0,
      topQueried: [],
      topBlocked: [{ name: 'ads.example.com', count: 7 }],
      topClients: [
        { name: 'Laptop', count: 50 },
        { name: '192.168.1.99', count: 9 },
      ],
      history: [],
      historyBlocked: [],
      timeUnit: 'hours',
    },
    filters: [
      {
        id: 1,
        name: 'AdGuard DNS filter',
        url: 'https://f.test/1.txt',
        enabled: true,
        rules: 9,
        updatedAt: null,
        allowList: false,
      },
      {
        id: -3,
        name: 'Home allow list',
        url: 'https://f.test/3.txt',
        enabled: false,
        rules: 1,
        updatedAt: null,
        allowList: true,
      },
    ],
    userRules: [],
    ...overrides,
  };
}

interface Rig {
  readonly tools: readonly PluginTool[];
  readonly calls: ReturnType<typeof fakeHttp>['calls'];
  readonly changed: () => number;
  readonly world: PickerWorld;
}

function rigOf(
  routes: Parameters<typeof fakeHttp>[0] = {},
  snapshot: AdGuardSnapshot = snapshotOf(),
): Rig {
  const { fetcher, calls } = fakeHttp({
    'POST /control/protection': null,
    'POST /control/filtering/set_url': null,
    'POST /control/filtering/set_rules': null,
    'GET /control/filtering/status': FILTERS_STATUS,
    'GET /control/clients': CLIENTS,
    'GET /control/querylog': QUERY_LOG,
    ...routes,
  });
  const client = new AdGuardClient(BASE, { user: 'person', password: 'test-only' }, fetcher);
  let changes = 0;
  const ports: AdGuardToolPorts = {
    snapshot: () => snapshot,
    client: () => client,
    changed: (): void => {
      changes += 1;
    },
    importRouterMonitor: () => Promise.resolve(),
  };
  return { tools: adguardTools(ports), calls, changed: () => changes, world: ports };
}

function errorOf(result: { readonly response: Readonly<Record<string, unknown>> }): string {
  const error = result.response['error'];
  if (typeof error !== 'string') throw new Error('the tool did not fail');
  return error;
}

function toolOf(rig: Rig, name: string): PluginTool {
  const found = rig.tools.find((tool) => tool.name === name);
  if (found === undefined) throw new Error(`no tool ${name}`);
  return found;
}

const CALLER = {
  profileId: 'p',
  role: 'owner',
  chatId: null,
  via: 'automation',
  clientId: null,
} as const;

describe('the AdGuard automation declaration', () => {
  it('is valid and runs only tools the plugin registers', () => {
    const rig = rigOf();
    const assembled = expectContributionValid(adguardPlugin, {
      tools: rig.tools.map((tool) => tool.name),
    });
    expect(assembled.rejections).toEqual([]);
  });

  it('serves the nodes, the trigger and the status value as kinds of the AdGuard plugin', () => {
    const catalog = createKindCatalog();
    expect(syncContribution(catalog, pluginContribution(MANIFEST)).rejections).toEqual([]);
    for (const id of ['protection', 'filter_list', 'domain_rule']) {
      expect(catalog.get(pluginNodeKindId(OWNER, id))).toMatchObject({ class: 'effect' });
    }
    for (const id of ['client_lookups', 'query_log']) {
      expect(catalog.get(pluginNodeKindId(OWNER, id))).toMatchObject({ class: 'effect' });
    }
    expect(catalog.get(pluginNodeKindId(OWNER, 'status'))).toBeDefined();
    expect(catalog.get(pluginTriggerKindId(OWNER, 'protection_changed'))).toMatchObject({
      class: 'trigger',
    });
  });

  it('runs actions in send mode by default and queries in wait mode only', () => {
    const { nodes } = MANIFEST.contributes.automation;
    const kinds = Object.fromEntries(nodes.map((node) => [node.id, node.kind]));
    expect(kinds).toEqual({
      protection: 'action',
      filter_list: 'action',
      domain_rule: 'action',
      client_lookups: 'query',
      query_log: 'query',
    });
    const protection = nodes.find((node) => node.id === 'protection');
    expect(protection?.waitOnly).toEqual(['until']);
    expect(protection?.timeout).toBeDefined();
  });

  it('gives each entity a picker the plugin registers', () => {
    const sources: string[] = [];
    registerAdGuardPickers(
      {
        options: {
          register: (source): (() => void) => {
            sources.push(source);
            return () => undefined;
          },
        },
      },
      rigOf().world,
    );
    expect(MANIFEST.contributes.automation.entities.map((entity) => entity.options).sort()).toEqual(
      [...sources].sort(),
    );
    expect(sources.sort()).toEqual([CLIENT_PICKER, FILTER_PICKER].sort());
  });

  it('reads every status output from the snapshot the plugin publishes', () => {
    const [status] = MANIFEST.contributes.automation.values;
    expect(status?.from.stream).toBe('adguard.snapshot');
    const reading = JSON_VALUE.parse(snapshotOf());
    const read = Object.fromEntries(
      (status?.outputs ?? []).map((port) => [port.name, readPointer(reading, port.from)]),
    );
    expect(read).toEqual({
      enabled: true,
      pausedUntil: null,
      queries: 100,
      blocked: 20,
      blockedPercent: 20,
      averageMs: 3,
      topBlocked: [{ name: 'ads.example.com', count: 7 }],
    });
  });

  it('uses the ranges AdGuard Home and the log request really accept', () => {
    expect(PAUSE_MIN_MS / MINUTE_MS).toBe(1);
    expect(PAUSE_MINUTES.safeParse(PAUSE_MIN_MS / MINUTE_MS).success).toBe(true);
    expect(PAUSE_MINUTES.safeParse(PAUSE_MAX_MS / MINUTE_MS).success).toBe(true);
    expect(PAUSE_MINUTES.safeParse(PAUSE_MAX_MS / MINUTE_MS + 1).success).toBe(false);
    expect(QUERY_LOG_REQUEST.safeParse({ limit: LOOKUPS_MIN }).success).toBe(true);
    expect(QUERY_LOG_REQUEST.safeParse({ limit: LOOKUPS_MAX }).success).toBe(true);
    expect(QUERY_LOG_REQUEST.safeParse({ limit: LOOKUPS_MAX + 1 }).success).toBe(false);
  });
});

describe('the AdGuard automation tools', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(NOW));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('pauses ad blocking for whole minutes and answers when it comes back', async () => {
    const rig = rigOf();
    const result = await toolOf(rig, 'set_protection').run(
      { state: 'pause', duration: 30 * MINUTE_MS },
      CALLER,
    );
    expect(rig.calls.map((call) => call.body)).toEqual([{ enabled: false, duration: 1_800_000 }]);
    expect(result.response).toMatchObject({
      protection: false,
      until: '2026-10-25T10:30:00.000Z',
    });
    expect(rig.changed()).toBe(1);
  });

  it('turns ad blocking on and off with no end time', async () => {
    const rig = rigOf();
    const on = await toolOf(rig, 'set_protection').run({ state: 'on' }, CALLER);
    const off = await toolOf(rig, 'set_protection').run({ state: 'off' }, CALLER);
    expect(rig.calls.map((call) => call.body)).toEqual([{ enabled: true }, { enabled: false }]);
    expect(on.response).toMatchObject({ protection: true });
    expect(on.response).not.toHaveProperty('until');
    expect(off.response).not.toHaveProperty('until');
  });

  it('refuses a pause with no length and a length that is not whole minutes or out of range', async () => {
    const rig = rigOf();
    const tool = toolOf(rig, 'set_protection');
    expect((await tool.run({ state: 'pause' }, CALLER)).response).toMatchObject({
      error: 'Choose how long to pause ad blocking',
    });
    expect(tool.validate({ state: 'pause', duration: 90_000 })).not.toBeNull();
    expect(tool.validate({ state: 'pause', duration: 0 })).not.toBeNull();
    expect(tool.validate({ state: 'pause', duration: PAUSE_MAX_MS + MINUTE_MS })).not.toBeNull();
    expect(tool.validate({ state: 'pause', duration: PAUSE_MAX_MS })).toBeNull();
    expect(rig.calls).toEqual([]);
  });

  it('switches a filter list by the id the picker gave, allow lists included', async () => {
    const rig = rigOf();
    const tool = toolOf(rig, 'set_filter');
    await tool.run({ filter: '2', enabled: true }, CALLER);
    await tool.run({ filter: '-3', enabled: false }, CALLER);
    const writes = rig.calls.filter((call) => call.method === 'POST').map((call) => call.body);
    expect(writes).toEqual([
      {
        url: 'https://f.test/2.txt',
        whitelist: false,
        data: { name: 'Tracker list', url: 'https://f.test/2.txt', enabled: true },
      },
      {
        url: 'https://f.test/3.txt',
        whitelist: true,
        data: { name: 'Home allow list', url: 'https://f.test/3.txt', enabled: false },
      },
    ]);
    expect(tool.validate({ filter: 'abc', enabled: true })).not.toBeNull();
  });

  it('answers a filter list that does not exist with the reason', async () => {
    const rig = rigOf();
    const result = await toolOf(rig, 'set_filter').run({ filter: '99', enabled: true }, CALLER);
    expect(errorOf(result)).toContain('no filter list');
    expect(rig.changed()).toBe(0);
  });

  it('blocks, allows and releases a domain with one tool', async () => {
    const rig = rigOf();
    const tool = toolOf(rig, 'set_domain_rule');
    await tool.run({ domain: 'ads.example.com', rule: 'block' }, CALLER);
    await tool.run({ domain: 'ok.example.com', rule: 'allow' }, CALLER);
    const rules = rig.calls
      .filter((call) => call.path === '/control/filtering/set_rules')
      .map((call) => call.body);
    expect(rules).toEqual([
      { rules: ['! note', '||ads.example.com^'] },
      { rules: ['! note', '@@||ok.example.com^'] },
    ]);
    const missing = await tool.run({ domain: 'none.example.com', rule: 'remove' }, CALLER);
    expect(errorOf(missing)).toContain('no custom rule');
  });

  it('reads recent lookups as a flat list with their count', async () => {
    const rig = rigOf();
    const result = await toolOf(rig, 'find_lookups').run(
      { search: 'example', outcome: 'blocked', limit: 20 },
      CALLER,
    );
    expect(rig.calls[0]?.query).toMatchObject({
      limit: '20',
      response_status: 'filtered',
      search: 'example',
    });
    expect(result.response).toMatchObject({ count: 2 });
    const page = QUERY_LOG_PAGE.parse(result.response['page']);
    expect(page.entries.map((entry) => entry.domain)).toEqual([
      'ads.example.com',
      'good.example.com',
    ]);
    expect(page.entries[0]).toMatchObject({
      client: '192.168.1.30',
      clientName: 'Laptop',
      outcome: 'blocked',
      rule: '||ads.example.com^',
      time: '2026-10-25T09:59:00.000Z',
    });
    expect(page.olderThan).toBeNull();
  });

  it('pages back with the cursor of the previous answer', async () => {
    const rig = rigOf();
    await toolOf(rig, 'find_lookups').run({ olderThan: '2026-10-25T09:58:00.000Z' }, CALLER);
    expect(rig.calls[0]?.query).toMatchObject({ older_than: '2026-10-25T09:58:00.000Z' });
  });

  it('serves one tool per job and none of the single purpose ones', () => {
    const names = rigOf().tools.map((tool) => tool.name);
    expect(names).toEqual(
      expect.arrayContaining(['set_protection', 'set_filter', 'set_domain_rule', 'find_lookups']),
    );
    for (const gone of [
      'resume_protection',
      'pause_protection',
      'turn_off_protection',
      'enable_filter',
      'disable_filter',
      'block_domain',
      'allow_domain',
      'remove_domain_rule',
      'query_log',
    ]) {
      expect(names).not.toContain(gone);
    }
  });

  it('reads with the log defaults when the node leaves the fields empty', async () => {
    const rig = rigOf();
    await toolOf(rig, 'find_lookups').run({}, CALLER);
    expect(rig.calls[0]?.query).toMatchObject({ limit: '50', response_status: 'all' });
  });
});

function asked(
  provider: PluginOptionProvider,
  query: PluginOptionQuery,
): Promise<PluginOptionPage> {
  return provider(query, CALLER);
}

function ready(page: PluginOptionPage): readonly { id: string; label: string }[] {
  if (page.state !== 'ready') throw new Error(`not ready: ${page.message}`);
  return page.options.map(({ id, label }) => ({ id, label }));
}

describe('the AdGuard pickers', () => {
  it('lists the filter lists of the snapshot with their ids, kind and state', async () => {
    const page = await asked(filterPicker(rigOf().world), {});
    expect(page).toMatchObject({
      state: 'ready',
      next: null,
      options: [
        { id: '1', label: 'AdGuard DNS filter', detail: 'Block list' },
        { id: '-3', label: 'Home allow list', detail: 'Allow list · off' },
      ],
    });
  });

  it('searches, resolves stored ids and pages without a cap on the total', async () => {
    const many = snapshotOf({
      filters: Array.from({ length: 120 }, (_, index) => ({
        id: index + 1,
        name: `List ${String(index + 1)}`,
        url: `https://f.test/${String(index + 1)}.txt`,
        enabled: true,
        rules: 1,
        updatedAt: null,
        allowList: false,
      })),
    });
    const picker = filterPicker(rigOf({}, many).world);
    const first = await asked(picker, {});
    const second =
      first.state === 'ready' && first.next !== null
        ? await asked(picker, { after: first.next })
        : first;
    expect(ready(first)).toHaveLength(50);
    expect(ready(second).map((option) => option.id)[0]).toBe('51');
    expect(ready(await asked(picker, { q: 'list 11' })).map((option) => option.label)).toEqual([
      'List 11',
      'List 110',
      'List 111',
      'List 112',
      'List 113',
      'List 114',
      'List 115',
      'List 116',
      'List 117',
      'List 118',
      'List 119',
    ]);
    expect(ready(await asked(picker, { ids: '120,7,500' })).map((option) => option.id)).toEqual([
      '7',
      '120',
    ]);
  });

  it.each([
    [{ state: 'not_set_up' }, 'not set up'],
    [{ state: 'sign_in_needed' }, 'user name and password'],
    [{ state: 'connecting' }, 'still connecting'],
    [{ state: 'refused', reason: 'bad password' }, 'bad password'],
    [{ state: 'unreachable', reason: 'timed out', since: NOW }, 'cannot be reached: timed out'],
  ] as const)(
    'says why the lists are unavailable while the connection is %j',
    async (connection, text) => {
      const world = rigOf({}, snapshotOf({ connection, filters: [] })).world;
      for (const picker of [filterPicker(world), clientPicker(world)]) {
        const page = await asked(picker, {});
        expect(page).toMatchObject({ state: 'unavailable' });
        expect(page.state === 'unavailable' ? page.message : '').toContain(text);
      }
    },
  );

  it('lists configured clients by a comma free id, detected clients and busy clients once', async () => {
    const page = await asked(clientPicker(rigOf().world), {});
    expect(ready(page)).toEqual([
      { id: '192.168.1.20', label: 'Living room TV' },
      { id: '192.168.1.31', label: '192.168.1.31' },
      { id: '192.168.1.30', label: 'Laptop' },
      { id: '192.168.1.99', label: '192.168.1.99' },
    ]);
    expect(
      ready(await asked(clientPicker(rigOf().world), { ids: '192.168.1.20,192.168.1.30' })),
    ).toEqual([
      { id: '192.168.1.20', label: 'Living room TV' },
      { id: '192.168.1.30', label: 'Laptop' },
    ]);
    expect(ready(await asked(clientPicker(rigOf().world), { q: 'ff' }))).toEqual([
      { id: '192.168.1.20', label: 'Living room TV' },
    ]);
  });

  it('says what went wrong when AdGuard Home would not list its clients', async () => {
    const rig = rigOf({ 'GET /control/clients': () => ({ clients: 7 }) });
    const page = await asked(clientPicker(rig.world), {});
    expect(page).toMatchObject({ state: 'unavailable' });
    expect(page.state === 'unavailable' ? page.message : '').toContain(
      'would not list its clients',
    );
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
});

afterEach(async () => {
  await opened.close();
});

function hubToolOf(tool: PluginTool): HubTool {
  return {
    name: `adguard__${tool.name}`,
    title: tool.title,
    description: tool.description,
    inputSchema: tool.inputSchema,
    annotations: tool.annotations,
    origin: { kind: 'plugin', pluginId: 'adguard' },
    humanOnly: tool.humanOnly,
  };
}

type Params = Record<string, string | number | boolean>;

function performer(
  tools: readonly PluginTool[],
): (kind: string, params: Params, mode?: 'wait_for_result') => Promise<unknown> {
  const byName = new Map(tools.map((tool) => [`adguard__${tool.name}`, tool]));
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
  return async (kind, params, mode) => {
    const handler = handlers[PLUGIN_NODE_PREFIX];
    if (handler === undefined) throw new Error('no plugin performer');
    return await handler(
      params,
      {
        kind,
        node: { id: 'n', key: 'n' },
        path: 'n',
        activation: '0',
        key: 'n',
        params,
        retry: 'external',
        budget: 'effects',
        ...(mode === undefined ? {} : { mode }),
      },
      run,
    );
  };
}

describe('the AdGuard nodes in an automation run', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(NOW));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('sends the protection change without waiting and hands the end time over when it waits', async () => {
    const rig = rigOf();
    const perform = performer(rig.tools);
    const kind = pluginNodeKindId(OWNER, 'protection');
    const sent = await perform(kind, { state: 'pause', for: 600_000 });
    expect(sent).toEqual({ ok: true, value: { sent: true } });
    const waited = await perform(kind, { state: 'pause', for: 600_000 }, 'wait_for_result');
    expect(waited).toMatchObject({ ok: true, value: { until: '2026-10-25T10:10:00.000Z' } });
    await vi.waitFor(() => {
      expect(rig.calls.filter((call) => call.path === '/control/protection')).toHaveLength(2);
    });
    expect(rig.calls.map((call) => call.body)).toEqual([
      { enabled: false, duration: 600_000 },
      { enabled: false, duration: 600_000 },
    ]);
  });

  it('turns a picked filter list off and a domain rule on through the plugin tools', async () => {
    const rig = rigOf();
    const perform = performer(rig.tools);
    await perform(
      pluginNodeKindId(OWNER, 'filter_list'),
      { list: '1', on: false },
      'wait_for_result',
    );
    await perform(
      pluginNodeKindId(OWNER, 'domain_rule'),
      { domain: 'ads.example.com', rule: 'block' },
      'wait_for_result',
    );
    expect(rig.calls.filter((call) => call.method === 'POST').map((call) => call.path)).toEqual([
      '/control/filtering/set_url',
      '/control/filtering/set_rules',
    ]);
  });

  it('hands the lookups and their count to the next node', async () => {
    const perform = performer(rigOf().tools);
    const result = await perform(pluginNodeKindId(OWNER, 'query_log'), { outcome: 'all' });
    expect(result).toMatchObject({
      ok: true,
      value: { count: 2, lookups: [{ domain: 'ads.example.com' }, { domain: 'good.example.com' }] },
    });
  });

  it('hands the name and lookups of a picked client to the next node', async () => {
    const rig = rigOf({
      'GET /control/clients': CLIENTS,
    });
    const perform = performer(rig.tools);
    const result = await perform(pluginNodeKindId(OWNER, 'client_lookups'), {
      client: '192.168.1.30',
    });
    expect(result).toMatchObject({ ok: true, value: { name: 'Laptop', queries: 50 } });
  });

  it('leaves through the error exit with the reason when AdGuard Home refuses', async () => {
    const rig = rigOf({ 'GET /control/querylog': () => ({ data: 'broken' }) });
    const result = await performer(rig.tools)(pluginNodeKindId(OWNER, 'query_log'), {});
    expect(result).toHaveProperty('ok', false);
    expect(result).toHaveProperty('class');
  });
});

describe('the ad blocking trigger', () => {
  function fireOf(protection: boolean, pausedUntil: string | null): SignalInput {
    const event = protectionEvent({ version: null, running: true, protection, pausedUntil });
    return {
      source: pluginSignalSource('adguard'),
      kind: event.kind,
      subject: event.subject,
      field: null,
      value: true,
      previous: null,
      at: NOW,
      profileId: null,
      data: event.data,
    };
  }

  function firesOn(ports: Record<string, string>, signal: SignalInput): unknown {
    const catalog = createKindCatalog();
    syncContribution(catalog, pluginContribution(MANIFEST));
    const compiled = compileTriggers(
      'auto-1',
      [trigger(pluginTriggerKindId(OWNER, 'protection_changed'), ports)],
      (id) => catalog.matcher(id),
    );
    expect(compiled.problems).toEqual([]);
    const [entry] = compiled.signals;
    if (entry === undefined) throw new Error('the trigger did not compile');
    return signalMatchesMatcher(entry.matcher, signal)
      ? signalFire(compiled, signal, entry.triggerId)?.payload
      : undefined;
  }

  it('fires for the state it was set to and hands over the end of a pause', () => {
    const off = fireOf(false, '2026-10-25T11:00:00.000Z');
    expect(firesOn({ to: 'off' }, off)).toEqual({
      enabled: false,
      until: '2026-10-25T11:00:00.000Z',
      at: NOW,
    });
    expect(firesOn({ to: 'on' }, off)).toBeUndefined();
    expect(firesOn({ to: 'on' }, fireOf(true, null))).toEqual({ enabled: true, at: NOW });
  });

  it('fires for either change when no state is chosen', () => {
    expect(firesOn({}, fireOf(true, null))).toEqual({ enabled: true, at: NOW });
    expect(firesOn({}, fireOf(false, null))).toEqual({ enabled: false, at: NOW });
  });

  it('declares only fields the event really carries, until only while paused', () => {
    const event = MANIFEST.contributes.events.find((entry) => entry.kind === 'protection_changed');
    const keysOf = (protection: boolean, pausedUntil: string | null): string[] =>
      Object.keys(protectionEvent({ version: null, running: true, protection, pausedUntil }).data);
    expect(keysOf(true, null).sort()).toEqual(['enabled', 'state']);
    const paused = keysOf(false, NOW).sort();
    expect(paused).toEqual(['enabled', 'state', 'until']);
    expect(Object.keys(event?.fields ?? {}).sort()).toEqual(paused);
  });
});
