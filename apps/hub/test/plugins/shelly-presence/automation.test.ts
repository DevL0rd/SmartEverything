import {
  JSON_VALUE,
  PLUGIN_MANIFEST,
  pluginNodeKindId,
  pluginNodeModes,
  pluginToolName,
  pluginTriggerKindId,
  signalMatchesMatcher,
  type DeviceEvent,
  type JsonValue,
  type PluginManifest,
  type PluginOptionPage,
  type PluginOptionQuery,
  type SignalInput,
} from '@smarteverything/domain';
import {
  SHELLY_SNAPSHOT_STREAM,
  type ShellyDevice,
  type ShellySnapshot,
} from '@smarteverything/shelly';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  failure,
  type HubTool,
  type ToolCaller,
  type ToolSource,
} from '../../../src/ai-tools/hub-tool';
import { ToolHub } from '../../../src/ai-tools/tool-hub';
import { eventSignal } from '../../../src/signals/sources/device';
import { createKindCatalog, syncContribution } from '../../../src/automations/plugin-kinds/catalog';
import { pluginContribution } from '../../../src/automations/plugin-kinds/contributions';
import {
  PLUGIN_NODE_PREFIX,
  pluginNodeEffects,
} from '../../../src/automations/plugin-kinds/perform';
import { compileTriggers, signalFire } from '../../../src/automations/triggers-v3/armers';
import {
  pluginValueHandler,
  valueBindingOf,
} from '../../../src/automations/world-v3/plugin-values';
import { expectContributionValid } from '../../../src/plugins/builtin/automation-kit';
import type { PluginOptionProvider, PluginTool } from '../../../src/plugins/builtin/contract';
import { shellyPresencePlugin } from '../../../src/plugins/builtin/shelly-presence';
import {
  SHELLY_SENSOR_PICKER,
  SHELLY_ZONE_PICKER,
  SHELLY_ZONES_STREAM,
} from '../../../src/plugins/builtin/shelly-presence/automation';
import { ShellyCrossings } from '../../../src/plugins/builtin/shelly-presence/crossings';
import { startWithPickers } from '../../../src/plugins/builtin/shelly-presence/pickers';
import {
  shellyTools,
  type ShellyToolPorts,
} from '../../../src/plugins/builtin/shelly-presence/tools';
import { testRun } from '../../automations-v3/effects/support';
import { trigger } from '../../support/automation-fixture';
import { captureLogs, testLogger } from '../../support/logs';
import { testStore, type TestStore } from '../../support/store';
import { sensorFixture } from './sensor-fixture';

const MANIFEST: PluginManifest = PLUGIN_MANIFEST.parse(shellyPresencePlugin.manifest);

const PLUGIN = MANIFEST.id;

const OWNER = { kind: 'plugin', id: PLUGIN } as const;

const NOW = '2026-10-25T10:00:00.000Z';

const CALLER: ToolCaller = {
  profileId: 'p',
  role: 'owner',
  chatId: null,
  via: 'automation',
  clientId: null,
};

const SENSOR = sensorFixture();

const MAIN_ZONE = SENSOR.externalId;

const SIDE_ZONE = `${SENSOR.externalId}:presencezone:201`;

function snapshotOf(devices: readonly ShellyDevice[] = [SENSOR]): ShellySnapshot {
  return { at: NOW, devices: [...devices] };
}

function withZone(
  sensor: ShellyDevice,
  id: string,
  status: ShellyDevice['zones'][number]['status'],
): ShellyDevice {
  return {
    ...sensor,
    zones: sensor.zones.map((zone) => (zone.externalId === id ? { ...zone, status } : zone)),
  };
}

function toolPorts(): ShellyToolPorts {
  return {
    signal: new AbortController().signal,
    snapshot: () => snapshotOf(),
    read: vi.fn(() => Promise.resolve(SENSOR)),
    execute: vi.fn(),
    enroll: vi.fn(),
    forget: vi.fn(),
    track: vi.fn(() => Promise.resolve({ enabled: true })),
  };
}

describe('the Shelly Presence automation declaration', () => {
  it('is valid and runs only tools the plugin registers', () => {
    const assembled = expectContributionValid(shellyPresencePlugin, {
      tools: shellyTools(toolPorts()).map((tool) => tool.name),
    });
    expect(assembled.rejections).toEqual([]);
  });

  it('serves the live tracking node, the zone count value and one trigger per crossing', () => {
    const catalog = createKindCatalog();
    expect(syncContribution(catalog, pluginContribution(MANIFEST)).rejections).toEqual([]);
    expect(catalog.get(pluginNodeKindId(OWNER, 'live_tracking'))).toMatchObject({
      class: 'effect',
    });
    expect(catalog.get(pluginNodeKindId(OWNER, 'zone_count'))).toBeDefined();
    for (const id of ['zone_enter', 'zone_leave']) {
      expect(catalog.get(pluginTriggerKindId(OWNER, id))).toMatchObject({ class: 'trigger' });
    }
    expect(MANIFEST.contributes.automation.nodes.map((node) => node.run.tool)).toEqual([
      'set_live_view',
    ]);
  });

  it('keeps operate for the assistant: no node runs it', () => {
    const tools = MANIFEST.contributes.automation.nodes.map((node) => node.run.tool);
    expect(tools).not.toContain('operate');
    expect(tools).not.toContain('enroll');
    expect(tools).not.toContain('forget');
  });

  it('sends live tracking without waiting and can wait for the sensor to answer', () => {
    const [node] = MANIFEST.contributes.automation.nodes;
    if (node === undefined) throw new Error('no live tracking node');
    expect(pluginNodeModes(node)).toEqual({
      default: 'fire_and_forget',
      allowed: ['fire_and_forget', 'wait_for_result'],
    });
    expect(node.timeout).toBeDefined();
  });

  it('gives each entity the picker the plugin registers and filters the triggers by entity', () => {
    const { entities, triggers } = MANIFEST.contributes.automation;
    expect(entities.map((entity) => entity.options).sort()).toEqual(
      [SHELLY_SENSOR_PICKER, SHELLY_ZONE_PICKER].sort(),
    );
    for (const entry of triggers) {
      expect(typeof entry.event === 'string' ? entry.event : entry.event.deviceEvent).toBe(
        `zone_${entry.id.slice('zone_'.length)}`,
      );
      expect(entry.filters.map((filter) => [filter.name, filter.type])).toEqual([
        ['sensor', { t: 'entity', of: `${PLUGIN}.sensor` }],
        ['zone', { t: 'entity', of: `${PLUGIN}.zone` }],
      ]);
      expect(entry.outputs.map((port) => [port.name, port.type])).toEqual([
        ['zone', { t: 'entity', of: `${PLUGIN}.zone` }],
        ['sensor', { t: 'entity', of: `${PLUGIN}.sensor` }],
        ['room', { t: 'ref', of: 'room' }],
        ['at', { t: 'instant' }],
      ]);
    }
  });

  it('declares the zone readings stream the zone count reads', () => {
    expect(MANIFEST.contributes.data.map((stream) => stream.stream)).toContain(SHELLY_ZONES_STREAM);
    const [value] = MANIFEST.contributes.automation.values;
    expect(value?.from.stream).toBe(SHELLY_ZONES_STREAM);
  });
});

describe('the Shelly Presence zone triggers', () => {
  const ROOM = 'room-hall';

  async function crossing(event: 'enter' | 'leave', component: string): Promise<SignalInput> {
    const published: DeviceEvent[] = [];
    await new ShellyCrossings().observe(
      (published_) => {
        published.push(published_);
        return Promise.resolve('event-1');
      },
      SENSOR,
      { component, event, ts: Date.parse(NOW) / 1000 },
    );
    const [device] = published;
    if (device === undefined) throw new Error('the crossing was not published');
    return eventSignal(
      {
        id: 'event-1',
        deviceId: 'device-1',
        kind: device.kind,
        occurredAt: device.occurredAt,
        details: device.details,
      },
      ROOM,
    );
  }

  function firesOn(id: string, ports: Record<string, string>, signal: SignalInput): unknown {
    const catalog = createKindCatalog();
    syncContribution(catalog, pluginContribution(MANIFEST));
    const compiled = compileTriggers(
      'auto-1',
      [trigger(pluginTriggerKindId(OWNER, id), ports)],
      (kindId) => catalog.matcher(kindId),
    );
    expect(compiled.problems).toEqual([]);
    const [entry] = compiled.signals;
    if (entry === undefined) throw new Error('the trigger did not compile');
    return signalMatchesMatcher(entry.matcher, signal)
      ? signalFire(compiled, signal, entry.triggerId)?.payload
      : undefined;
  }

  it('carries the sensor, the zone and the room the trigger filters and outputs read', async () => {
    const entered = await crossing('enter', 'presencezone:201');
    expect(entered.kind).toBe('zone_enter');
    expect(entered.data).toMatchObject({
      zone: SIDE_ZONE,
      parentExternalId: SENSOR.externalId,
      roomId: ROOM,
    });
  });

  it('fires on the device event it is named for and not on the other one', async () => {
    const entered = await crossing('enter', 'presencezone:201');
    const left = await crossing('leave', 'presencezone:200');
    expect(firesOn('zone_enter', {}, entered)).toEqual({
      zone: SIDE_ZONE,
      sensor: SENSOR.externalId,
      room: ROOM,
      at: entered.at,
    });
    expect(firesOn('zone_enter', {}, left)).toBeUndefined();
    expect(firesOn('zone_leave', {}, left)).toEqual({
      zone: MAIN_ZONE,
      sensor: SENSOR.externalId,
      room: ROOM,
      at: left.at,
    });
    expect(firesOn('zone_leave', {}, entered)).toBeUndefined();
  });

  it('fires for the chosen zone only', async () => {
    const entered = await crossing('enter', 'presencezone:201');
    const left = await crossing('leave', 'presencezone:200');
    expect(firesOn('zone_enter', { zone: SIDE_ZONE }, entered)).toBeDefined();
    expect(firesOn('zone_enter', { zone: MAIN_ZONE }, entered)).toBeUndefined();
    expect(firesOn('zone_leave', { zone: MAIN_ZONE }, left)).toBeDefined();
  });

  it('fires for every zone of the chosen sensor and for no other sensor', async () => {
    const entered = await crossing('enter', 'presencezone:201');
    expect(firesOn('zone_enter', { sensor: SENSOR.externalId }, entered)).toBeDefined();
    expect(firesOn('zone_enter', { sensor: 'shelly-presence:other' }, entered)).toBeUndefined();
    expect(
      firesOn('zone_enter', { sensor: SENSOR.externalId, zone: SIDE_ZONE }, entered),
    ).toBeDefined();
    expect(
      firesOn('zone_enter', { sensor: SENSOR.externalId, zone: MAIN_ZONE }, entered),
    ).toBeUndefined();
  });
});

describe('the Shelly Presence pickers', () => {
  interface Picked {
    readonly providers: Map<string, PluginOptionProvider>;
    readonly publish: (value: JsonValue) => void;
    readonly stop: () => Promise<void>;
    readonly published: { readonly stream: string; readonly value: JsonValue }[];
  }

  async function picked(): Promise<Picked> {
    const providers = new Map<string, PluginOptionProvider>();
    const published: { stream: string; value: JsonValue }[] = [];
    let publishTo: (stream: string, value: JsonValue) => void = () => undefined;
    const stop = await startWithPickers(
      {
        options: {
          register: (source, provider): (() => void) => {
            providers.set(source, provider);
            return () => {
              providers.delete(source);
            };
          },
        },
        data: {
          publish: (stream, value): void => {
            published.push({ stream, value });
          },
        },
        log: testLogger('shelly'),
      },
      (context) => {
        publishTo = context.data.publish;
        return Promise.resolve(() => Promise.resolve());
      },
    );
    return {
      providers,
      published,
      stop,
      publish: (value): void => {
        publishTo(SHELLY_SNAPSHOT_STREAM, value);
      },
    };
  }

  function ask(
    rig: Picked,
    source: string,
    query: PluginOptionQuery = {},
  ): Promise<PluginOptionPage> {
    const provider = rig.providers.get(source);
    if (provider === undefined) throw new Error(`no picker ${source}`);
    return provider(query, CALLER);
  }

  function ready(page: PluginOptionPage): readonly { id: string; label: string }[] {
    if (page.state !== 'ready') throw new Error(`not ready: ${page.message}`);
    return page.options.map(({ id, label }) => ({ id, label }));
  }

  function reasonOf(page: PluginOptionPage): string {
    return page.state === 'unavailable' ? page.message : '';
  }

  function shown(snapshot: ShellySnapshot): JsonValue {
    return JSON_VALUE.parse(snapshot);
  }

  it('says the plugin has not reported before the first snapshot', async () => {
    const rig = await picked();
    for (const source of [SHELLY_SENSOR_PICKER, SHELLY_ZONE_PICKER]) {
      expect(reasonOf(await ask(rig, source))).toContain('has not reported');
    }
  });

  it('lists the sensors and their zones by the ids the triggers and the node use', async () => {
    const rig = await picked();
    rig.publish(shown(snapshotOf()));
    expect(ready(await ask(rig, SHELLY_SENSOR_PICKER))).toEqual([
      { id: SENSOR.externalId, label: 'Hall radar' },
    ]);
    expect(ready(await ask(rig, SHELLY_ZONE_PICKER))).toEqual([
      { id: MAIN_ZONE, label: 'Hall radar · Zone 200' },
      { id: SIDE_ZONE, label: 'Hall radar · Zone 201' },
    ]);
  });

  it('names a zone by the name it was given', async () => {
    const rig = await picked();
    const named = {
      ...SENSOR,
      zones: SENSOR.zones.map((zone) =>
        zone.externalId === SIDE_ZONE
          ? { ...zone, config: { ...zone.config, name: 'Sofa' } }
          : zone,
      ),
    };
    rig.publish(shown(snapshotOf([named])));
    expect(ready(await ask(rig, SHELLY_ZONE_PICKER)).map((entry) => entry.label)).toContain(
      'Hall radar · Sofa',
    );
  });

  it('searches, looks up by id and pages without a fixed list size', async () => {
    const rig = await picked();
    const [first] = SENSOR.zones;
    if (first === undefined) throw new Error('the fixture has no zone');
    const many = {
      ...SENSOR,
      zones: Array.from({ length: 120 }, (_, index) => ({
        ...first,
        externalId: `${SENSOR.externalId}:presencezone:${String(300 + index)}`,
        config: { ...first.config, id: 300 + index, name: `Spot ${String(index)}` },
      })),
    };
    rig.publish(shown(snapshotOf([many])));
    const page = await ask(rig, SHELLY_ZONE_PICKER);
    if (page.state !== 'ready' || page.next === null) throw new Error('expected a first page');
    const second = await ask(rig, SHELLY_ZONE_PICKER, { after: page.next });
    expect(ready(page).length + ready(second).length).toBeGreaterThan(ready(page).length);
    expect(ready(await ask(rig, SHELLY_ZONE_PICKER, { q: 'spot 119' }))).toHaveLength(1);
    const wanted = `${SENSOR.externalId}:presencezone:305`;
    expect(ready(await ask(rig, SHELLY_ZONE_PICKER, { ids: `${wanted},none` }))).toEqual([
      { id: wanted, label: 'Hall radar · Spot 5' },
    ]);
  });

  it('says why nothing is listed while no sensor is added', async () => {
    const rig = await picked();
    rig.publish(shown(snapshotOf([])));
    for (const source of [SHELLY_SENSOR_PICKER, SHELLY_ZONE_PICKER]) {
      expect(reasonOf(await ask(rig, source))).toContain('No Shelly Presence');
    }
  });

  it('says why no zone is listed while the sensors have none', async () => {
    const rig = await picked();
    rig.publish(shown(snapshotOf([{ ...SENSOR, zones: [] }])));
    expect(ready(await ask(rig, SHELLY_SENSOR_PICKER))).toHaveLength(1);
    expect(reasonOf(await ask(rig, SHELLY_ZONE_PICKER))).toContain('zone');
  });

  it('logs a snapshot it cannot read and keeps the last good one', async () => {
    const logs = captureLogs();
    const rig = await picked();
    rig.publish(shown(snapshotOf()));
    rig.publish({ devices: 'broken' });
    expect(logs.events()).toContain('shelly.picker_snapshot_invalid');
    expect(ready(await ask(rig, SHELLY_SENSOR_PICKER))).toHaveLength(1);
  });

  it('passes every publication on and adds the zone readings after each snapshot', async () => {
    const rig = await picked();
    rig.publish(shown(snapshotOf()));
    expect(rig.published.map((entry) => entry.stream)).toEqual([
      SHELLY_SNAPSHOT_STREAM,
      SHELLY_ZONES_STREAM,
    ]);
  });

  it('skips and logs an entry whose id cannot be listed instead of cutting the id', async () => {
    const logs = captureLogs();
    const rig = await picked();
    const longId = `${SENSOR.externalId}:${'x'.repeat(200)}`;
    const [first] = SENSOR.zones;
    if (first === undefined) throw new Error('the fixture has no zone');
    rig.publish(
      shown(snapshotOf([{ ...SENSOR, zones: [first, { ...first, externalId: longId }] }])),
    );
    const ids = ready(await ask(rig, SHELLY_ZONE_PICKER)).map((entry) => entry.id);
    expect(ids).toEqual([first.externalId]);
    expect(ids.some((id) => longId.startsWith(id) && id !== first.externalId)).toBe(false);
    expect(logs.events()).toContain('shelly.option_not_listable');
  });

  it('stops offering the pickers when the plugin stops', async () => {
    const rig = await picked();
    await rig.stop();
    expect(rig.providers.size).toBe(0);
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
  opened.store.plugins.update(PLUGIN, { enabled: true });
});

afterEach(async () => {
  await opened.close();
});

describe('the Shelly Presence zone count', () => {
  function read(zone: string): unknown {
    const value = MANIFEST.contributes.automation.values.find((entry) => entry.id === 'zone_count');
    if (value === undefined) throw new Error('no zone count value');
    const handler = pluginValueHandler(opened.store, valueBindingOf(PLUGIN, value));
    if (handler === undefined) throw new Error('no handler');
    return handler(
      { zone },
      { automationId: 'a', nodeId: 'n', nodeKey: 'n', seed: 1, activation: '0' },
    ).outputs;
  }

  async function publishFrom(devices: readonly ShellyDevice[]): Promise<void> {
    let seen: JsonValue = null;
    await startWithPickers(
      {
        options: { register: (): (() => void) => () => undefined },
        data: {
          publish: (stream, value): void => {
            if (stream === SHELLY_ZONES_STREAM) seen = value;
          },
        },
        log: testLogger('shelly'),
      },
      (context) => {
        context.data.publish(SHELLY_SNAPSHOT_STREAM, JSON_VALUE.parse(snapshotOf(devices)));
        return Promise.resolve(() => Promise.resolve());
      },
    );
    opened.store.pluginData.publish(
      PLUGIN,
      { stream: SHELLY_ZONES_STREAM, at: NOW, value: seen },
      1,
    );
  }

  it('reads whether a zone is occupied and how many people are in it', async () => {
    const busy = withZone(SENSOR, SIDE_ZONE, { id: 201, value: true, num_objects: 2 });
    await publishFrom([busy]);
    expect(read(SIDE_ZONE)).toEqual({ occupied: true, count: 2 });
    expect(read(MAIN_ZONE)).toEqual({ occupied: false, count: 0 });
  });

  it('has no reading for a zone of a sensor that is not connected', async () => {
    await publishFrom([{ ...SENSOR, connection: { state: 'offline', reason: null } }]);
    expect(() => read(SIDE_ZONE)).toThrow(/no entry/);
  });

  it('has no reading for a zone that reports nothing yet', async () => {
    const quiet = withZone(SENSOR, SIDE_ZONE, { id: 201, value: null, num_objects: null });
    await publishFrom([quiet]);
    expect(() => read(SIDE_ZONE)).toThrow(/no entry/);
    expect(read(MAIN_ZONE)).toEqual({ occupied: false, count: 0 });
  });

  it('refuses a zone that is not one of the sensors', async () => {
    await publishFrom([SENSOR]);
    expect(() => read('shelly-presence:nowhere')).toThrow(/no entry/);
  });
});

describe('the Shelly Presence live tracking node', () => {
  function hubToolOf(tool: PluginTool): HubTool {
    return {
      name: pluginToolName(PLUGIN, tool.name),
      title: tool.title,
      description: tool.description,
      inputSchema: tool.inputSchema,
      annotations: tool.annotations,
      origin: { kind: 'plugin', pluginId: PLUGIN },
      humanOnly: tool.humanOnly,
    };
  }

  function performer(
    tools: readonly PluginTool[],
  ): (
    params: Record<string, string | boolean>,
    mode?: 'wait_for_result',
    automationId?: string,
  ) => Promise<unknown> {
    const byName = new Map(tools.map((tool) => [pluginToolName(PLUGIN, tool.name), tool]));
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
    const kind = pluginNodeKindId(OWNER, 'live_tracking');
    return async (params, mode, automationId) => {
      const run = { ...testRun(), ...(automationId === undefined ? {} : { automationId }) };
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
          retry: 'idempotent',
          budget: 'effects',
          ...(mode === undefined ? {} : { mode }),
        },
        run,
      );
    };
  }

  it('holds tracking on the chosen sensor and lets go when On is off', async () => {
    const ports = toolPorts();
    const perform = performer(shellyTools(ports));
    expect(await perform({ sensor: SENSOR.externalId, on: true }, 'wait_for_result')).toMatchObject(
      { ok: true },
    );
    expect(
      await perform({ sensor: SENSOR.externalId, on: false }, 'wait_for_result'),
    ).toMatchObject({ ok: true });
    expect(vi.mocked(ports.track).mock.calls.map(([id, , enabled]) => [id, enabled])).toEqual([
      [SENSOR.externalId, true],
      [SENSOR.externalId, false],
    ]);
  });

  it('holds tracking per automation so one automation cannot release another', async () => {
    const held = new Set<string>();
    const ports = toolPorts();
    vi.mocked(ports.track).mockImplementation((_id, holder, enabled) => {
      if (enabled) held.add(holder);
      else held.delete(holder);
      return Promise.resolve({ enabled: held.size > 0 });
    });
    const perform = performer(shellyTools(ports));
    const both = { sensor: SENSOR.externalId };
    await perform({ ...both, on: true }, 'wait_for_result', 'automation-a');
    await perform({ ...both, on: true }, 'wait_for_result', 'automation-b');
    expect(held.size).toBe(2);
    expect([...held].every((holder) => holder.includes('automation-'))).toBe(true);
    await perform({ ...both, on: false }, 'wait_for_result', 'automation-a');
    expect([...held]).toHaveLength(1);
    expect([...held][0]).toContain('automation-b');
    await perform({ ...both, on: false }, 'wait_for_result', 'automation-b');
    expect(held.size).toBe(0);
  });

  it('continues at once when sending and still reaches the sensor', async () => {
    const ports = toolPorts();
    const result = await performer(shellyTools(ports))({ sensor: SENSOR.externalId, on: true });
    expect(result).toEqual({ ok: true, value: { sent: true } });
    await vi.waitFor(() => {
      expect(ports.track).toHaveBeenCalledTimes(1);
    });
  });

  it('leaves through the error exit when the sensor refuses', async () => {
    const ports = toolPorts();
    vi.mocked(ports.track).mockRejectedValue(new Error('The sensor is not reachable.'));
    const result = await performer(shellyTools(ports))(
      { sensor: SENSOR.externalId, on: true },
      'wait_for_result',
    );
    expect(result).toHaveProperty('ok', false);
    expect(result).toHaveProperty('message', expect.stringContaining('not reachable'));
  });
});
