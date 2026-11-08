import {
  JSON_VALUE,
  type JsonValue,
  PLUGIN_MANIFEST,
  pluginNodeKindId,
  pluginNodeModes,
  type PluginManifest,
  type PluginOptionPage,
  type PluginOptionQuery,
} from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  failure,
  type HubTool,
  type ToolCaller,
  type ToolSource,
} from '../../../src/ai-tools/hub-tool';
import { ToolHub } from '../../../src/ai-tools/tool-hub';
import { createKindCatalog, syncContribution } from '../../../src/automations/plugin-kinds/catalog';
import { pluginContribution } from '../../../src/automations/plugin-kinds/contributions';
import {
  PLUGIN_NODE_PREFIX,
  pluginNodeEffects,
} from '../../../src/automations/plugin-kinds/perform';
import { readPointer } from '../../../src/automations/world-v3/plugin-values';
import { expectContributionValid } from '../../../src/plugins/builtin/automation-kit';
import type {
  PluginContext,
  PluginOptionProvider,
  PluginStop,
  PluginTool,
} from '../../../src/plugins/builtin/contract';
import { openRgbPlugin } from '../../../src/plugins/builtin/openrgb';
import {
  OPENRGB_STATUS_STREAM,
  PROFILE_PICKER,
  openRgbStatus,
  profileOptions,
  startWithProfiles,
} from '../../../src/plugins/builtin/openrgb/automation';
import {
  OpenRgbRuntime,
  type OpenRgbHost,
  type OpenRgbOptions,
} from '../../../src/plugins/builtin/openrgb/runtime';
import type { OpenRgbSettings } from '../../../src/plugins/builtin/openrgb/settings';
import { openRgbTools } from '../../../src/plugins/builtin/openrgb/tools';
import { testRun } from '../../automations-v3/effects/support';
import { testLogger } from '../../support/logs';
import { testStore, type TestStore } from '../../support/store';
import { memoryRecords } from '../memory-records';
import { board, fakeServer, strip, type FakeServer } from './fake-openrgb';

const MANIFEST: PluginManifest = PLUGIN_MANIFEST.parse(openRgbPlugin.manifest);

const OWNER = { kind: 'plugin', id: 'openrgb' } as const;

const NOW = '2026-10-25T10:00:00.000Z';

const CALLER: ToolCaller = {
  profileId: '1',
  role: 'owner',
  chatId: null,
  via: 'automation',
  clientId: null,
};

const MEMBER: ToolCaller = { ...CALLER, profileId: '2', role: 'member' };

type Host = OpenRgbHost & Pick<PluginContext<OpenRgbSettings>, 'options'>;

interface Published {
  readonly stream: string;
  readonly value: JsonValue;
}

interface Rig {
  readonly server: FakeServer;
  readonly published: Published[];
  readonly providers: Map<string, PluginOptionProvider>;
  readonly tools: PluginTool[];
  readonly lifetime: AbortController;
  readonly stop: PluginStop;
}

function launch(server: FakeServer): Rig {
  const providers = new Map<string, PluginOptionProvider>();
  const tools: PluginTool[] = [];
  const published: Published[] = [];
  const lifetime = new AbortController();
  const host: Host = {
    settings: { host: '127.0.0.1', port: 6742 },
    signal: lifetime.signal,
    log: testLogger('openrgb'),
    tools: {
      register: (registered): void => {
        tools.splice(0, tools.length, ...registered);
      },
    },
    records: () => memoryRecords(),
    data: {
      publish: (stream, value): void => {
        published.push({ stream, value });
      },
    },
    devices: { register: () => () => undefined },
    options: {
      register: (source, provider): (() => void) => {
        providers.set(source, provider);
        return () => {
          providers.delete(source);
        };
      },
    },
  };
  const options: OpenRgbOptions = {
    connect: server.connector,
    pause: (_milliseconds, signal) =>
      new Promise<void>((_resolve, reject) => {
        signal.addEventListener('abort', () => {
          reject(new DOMException('aborted', 'AbortError'));
        });
      }),
  };
  const stop = startWithProfiles(host, (observed) => new OpenRgbRuntime(observed, options).start());
  return { server, published, providers, tools, lifetime, stop };
}

let rig: Rig | null = null;

afterEach(async () => {
  if (rig !== null) {
    rig.lifetime.abort();
    await rig.stop();
    rig = null;
  }
});

function started(server: FakeServer = fakeServer(() => [strip()])): Rig {
  rig = launch(server);
  return rig;
}

function ask(
  from: Rig,
  query: PluginOptionQuery = {},
  caller: ToolCaller = CALLER,
): Promise<PluginOptionPage> {
  const provider = from.providers.get(PROFILE_PICKER);
  if (provider === undefined) throw new Error('the profile picker is not registered');
  return provider(query, caller);
}

async function connected(from: Rig): Promise<void> {
  await vi.waitFor(async () => {
    expect((await ask(from)).state).toBe('ready');
  });
}

function labels(page: PluginOptionPage): readonly string[] {
  if (page.state !== 'ready') throw new Error(`not ready: ${page.message}`);
  return page.options.map((option) => option.label);
}

describe('the OpenRGB automation declaration', () => {
  it('is valid and runs only tools the plugin registers', () => {
    const names = openRgbTools({
      status: () => Promise.resolve({}),
      loadProfile: () => Promise.resolve(),
      saveProfile: () => Promise.resolve(),
    }).map((tool) => tool.name);
    expect(expectContributionValid(openRgbPlugin, { tools: names }).rejections).toEqual([]);
  });

  it('serves the profile node and the status value as kinds of the OpenRGB plugin', () => {
    const catalog = createKindCatalog();
    expect(syncContribution(catalog, pluginContribution(MANIFEST)).rejections).toEqual([]);
    expect(catalog.get(pluginNodeKindId(OWNER, 'profile'))).toMatchObject({ class: 'effect' });
    expect(MANIFEST.contributes.automation.values.map((value) => value.id)).toEqual(['status']);
  });

  it('sends the profile without waiting and lets it wait for the result', () => {
    const [node] = MANIFEST.contributes.automation.nodes;
    if (node === undefined) throw new Error('no node');
    expect(pluginNodeModes(node)).toEqual({
      default: 'fire_and_forget',
      allowed: ['fire_and_forget', 'wait_for_result'],
    });
    expect(node.timeout).toBeDefined();
    expect(node.access).toBeUndefined();
  });

  it('offers the profile picker the plugin registers for its one entity', () => {
    const live = started();
    const { entities } = MANIFEST.contributes.automation;
    expect(entities.map((entity) => entity.options)).toEqual([PROFILE_PICKER]);
    expect([...live.providers.keys()]).toEqual([PROFILE_PICKER]);
    expect(entities[0]).toMatchObject({ id: 'profile' });
    const [node] = MANIFEST.contributes.automation.nodes;
    expect(node?.inputs.map((port) => port.type)).toEqual([{ t: 'entity', of: 'openrgb.profile' }]);
  });

  it('binds the picked profile to an argument the real tool accepts', () => {
    const [node] = MANIFEST.contributes.automation.nodes;
    const tool = openRgbTools({
      status: () => Promise.resolve({}),
      loadProfile: () => Promise.resolve(),
      saveProfile: () => Promise.resolve(),
    }).find((candidate) => candidate.name === node?.run.tool);
    expect(node?.run.args).toEqual({ name: { port: 'profile' } });
    expect(tool?.validate({ name: 'Evening' })).toBeNull();
  });

  it('declares the status stream in the manifest', () => {
    expect(MANIFEST.contributes.data.map((entry) => entry.stream)).toEqual([OPENRGB_STATUS_STREAM]);
  });
});

describe('the OpenRGB status value', () => {
  it('reads connected and the light count from the published stream', () => {
    const value = MANIFEST.contributes.automation.values[0];
    if (value === undefined) throw new Error('no value');
    expect(value.from.stream).toBe(OPENRGB_STATUS_STREAM);
    const reading = JSON_VALUE.parse(openRgbStatus(true, 3));
    expect(
      Object.fromEntries(value.outputs.map((port) => [port.name, readPointer(reading, port.from)])),
    ).toEqual({ connected: true, lights: 3 });
    const offline = JSON_VALUE.parse(openRgbStatus(false, 0));
    expect(readPointer(offline, '/connected')).toBe(false);
  });
});

describe('the OpenRGB status stream driven by the runtime', () => {
  function statuses(from: Rig): readonly JsonValue[] {
    return from.published
      .filter((entry) => entry.stream === OPENRGB_STATUS_STREAM)
      .map((entry) => entry.value);
  }

  it('publishes not connected at start and connected with the light count once the server answers', async () => {
    const live = started(fakeServer(() => [strip(), board()]));
    expect(statuses(live)[0]).toEqual({ connected: false, lights: 0 });
    await vi.waitFor(() => {
      expect(statuses(live).at(-1)).toEqual({ connected: true, lights: 4 });
    });
  });

  it('publishes each change once and not again while nothing changed', async () => {
    const live = started(fakeServer(() => [strip()]));
    await connected(live);
    const before = statuses(live);
    expect(before).toEqual([
      { connected: false, lights: 0 },
      { connected: true, lights: 1 },
    ]);
  });

  it('feeds the status value the automation reads', async () => {
    const live = started(fakeServer(() => [strip(), board()]));
    await vi.waitFor(() => {
      expect(statuses(live).at(-1)).toEqual({ connected: true, lights: 4 });
    });
    const value = MANIFEST.contributes.automation.values[0];
    if (value === undefined) throw new Error('no value');
    const last = JSON_VALUE.parse(statuses(live).at(-1));
    expect(
      Object.fromEntries(value.outputs.map((port) => [port.name, readPointer(last, port.from)])),
    ).toEqual({ connected: true, lights: 4 });
  });

  it('publishes not connected when the server closes the link', async () => {
    const live = started(fakeServer(() => [strip()]));
    await connected(live);
    live.server.links[0]?.close();
    await vi.waitFor(() => {
      expect(statuses(live).at(-1)).toEqual({ connected: false, lights: 0 });
    });
  });
});

describe('the OpenRGB profile picker', () => {
  it('lists the profiles the server has, found by search', async () => {
    const server = fakeServer(
      () => [strip()],
      (link) => {
        Object.assign(link, { profileNames: ['Evening', 'Gaming', 'Movie night'] });
      },
    );
    const live = started(server);
    await connected(live);
    expect(labels(await ask(live))).toEqual(['Evening', 'Gaming', 'Movie night']);
    expect(labels(await ask(live, { q: 'ga' }))).toEqual(['Gaming']);
    const byId = await ask(live, { ids: 'Movie night,Evening,Gone' });
    expect([...labels(byId)].sort()).toEqual(['Evening', 'Movie night']);
  });

  it('pages through every profile with no cap on how many exist', async () => {
    const names = Array.from({ length: 130 }, (_, index) => `Profile ${String(index)}`);
    const server = fakeServer(
      () => [strip()],
      (link) => {
        Object.assign(link, { profileNames: names });
      },
    );
    const live = started(server);
    await connected(live);
    const seen: string[] = [];
    let after: string | undefined;
    do {
      const page = await ask(live, after === undefined ? {} : { after });
      if (page.state !== 'ready') throw new Error('not ready');
      seen.push(...page.options.map((option) => option.label));
      after = page.next ?? undefined;
    } while (after !== undefined);
    expect(seen).toEqual(names);
  });

  it('says why when the server is not connected', async () => {
    const server = fakeServer(() => [strip()]);
    server.refuse(new Error('connection refused'));
    const live = started(server);
    await vi.waitFor(() => {
      expect(server.attempts()).toBeGreaterThan(0);
    });
    expect(await ask(live)).toEqual({
      state: 'unavailable',
      message: 'OpenRGB is not connected. Start its SDK server and check the plugin settings.',
    });
  });

  it('answers a member the same way, since profiles are not owner data', async () => {
    const live = started();
    await connected(live);
    expect(labels(await ask(live, {}, MEMBER))).toEqual(['Evening']);
  });

  it('stops offering the picker when the plugin stops', async () => {
    const live = started();
    await connected(live);
    live.lifetime.abort();
    await live.stop();
    expect(live.providers.size).toBe(0);
  });

  it('skips a name the picker format cannot carry and says so', () => {
    const skipped: string[] = [];
    const long = 'x'.repeat(201);
    expect(
      profileOptions(['Evening', long], (name) => skipped.push(name)).map((o) => o.id),
    ).toEqual(['Evening']);
    expect(skipped).toEqual([long]);
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
    name: `openrgb__${tool.name}`,
    title: tool.title,
    description: tool.description,
    inputSchema: tool.inputSchema,
    annotations: tool.annotations,
    origin: { kind: 'plugin', pluginId: 'openrgb' },
    humanOnly: tool.humanOnly,
  };
}

function performer(
  tools: readonly PluginTool[],
): (params: Record<string, string>, mode?: 'wait_for_result') => Promise<unknown> {
  const byName = new Map(tools.map((tool) => [`openrgb__${tool.name}`, tool]));
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
  return async (params, mode) => {
    const handler = handlers[PLUGIN_NODE_PREFIX];
    if (handler === undefined) throw new Error('no plugin performer');
    return await handler(
      params,
      {
        kind: pluginNodeKindId(OWNER, 'profile'),
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

describe('the OpenRGB profile node in an automation run', () => {
  it('loads the picked profile on the server and waits for the result', async () => {
    const live = started();
    await connected(live);
    const result = await performer(live.tools)({ profile: 'Evening' }, 'wait_for_result');
    expect(result).toMatchObject({ ok: true });
    expect(live.server.links[0]?.calls).toContainEqual({ kind: 'load', name: 'Evening' });
  });

  it('sends the profile without waiting', async () => {
    const live = started();
    await connected(live);
    expect(await performer(live.tools)({ profile: 'Evening' })).toEqual({
      ok: true,
      value: { sent: true },
    });
    await vi.waitFor(() => {
      expect(live.server.links[0]?.calls).toContainEqual({ kind: 'load', name: 'Evening' });
    });
  });

  it('fails with a reason naming the profiles that exist when the profile is gone', async () => {
    const live = started();
    await connected(live);
    const result = await performer(live.tools)({ profile: 'Deleted' }, 'wait_for_result');
    expect(result).toMatchObject({ ok: false });
    expect(JSON.stringify(result)).toContain('Evening');
    expect(live.server.links[0]?.calls.some((call) => call.kind === 'load')).toBe(false);
  });
});
