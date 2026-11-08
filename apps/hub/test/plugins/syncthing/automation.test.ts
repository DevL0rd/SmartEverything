import {
  JSON_VALUE,
  PLUGIN_MANIFEST,
  SYNCTHING_SNAPSHOT,
  pluginNodeKindId,
  pluginNodeModes,
  pluginSignalSource,
  pluginTriggerKindId,
  signalMatchesMatcher,
  FOLDER_TYPES,
  type JsonValue,
  type PluginManifest,
  type PluginOptionPage,
  type PluginOptionQuery,
  type SignalInput,
  type SyncthingCommand,
  type SyncthingFolder,
  type SyncthingPeer,
  type SyncthingSnapshot,
} from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { failure, type HubTool, type ToolSource } from '../../../src/ai-tools/hub-tool';
import { ToolHub } from '../../../src/ai-tools/tool-hub';
import { createKindCatalog, syncContribution } from '../../../src/automations/plugin-kinds/catalog';
import { pluginContribution } from '../../../src/automations/plugin-kinds/contributions';
import {
  PLUGIN_NODE_PREFIX,
  pluginNodeEffects,
} from '../../../src/automations/plugin-kinds/perform';
import { compileTriggers, signalFire } from '../../../src/automations/triggers-v3/armers';
import { readPointer } from '../../../src/automations/world-v3/plugin-values';
import { expectContributionValid } from '../../../src/plugins/builtin/automation-kit';
import type { PluginOptionProvider, PluginTool } from '../../../src/plugins/builtin/contract';
import { syncthingPlugin } from '../../../src/plugins/builtin/syncthing';
import { SYNCTHING_EVENTS } from '../../../src/plugins/builtin/syncthing/automation-events';
import { alertOf } from '../../../src/plugins/builtin/syncthing/event-plan';
import {
  FOLDER_PICKER,
  INVITE_PICKER,
  PEER_PICKER,
  startWithPickers,
} from '../../../src/plugins/builtin/syncthing/pickers';
import { SNAPSHOT_STREAM } from '../../../src/plugins/builtin/syncthing/runtime';
import { syncthingTools } from '../../../src/plugins/builtin/syncthing/tools';
import { testRun } from '../../automations-v3/effects/support';
import { trigger } from '../../support/automation-fixture';
import { captureLogs } from '../../support/logs';
import { testStore, type TestStore } from '../../support/store';
import { NEW_ID, PEER_ID } from './fake-syncthing';

const MANIFEST: PluginManifest = PLUGIN_MANIFEST.parse(syncthingPlugin.manifest);

const OWNER = { kind: 'plugin', id: 'syncthing' } as const;

const NOW = '2026-10-25T10:00:00.000Z';

const SELF_ID = Array.from({ length: 8 }, () => 'ZZZZZZZ').join('-');

const CALLER = {
  profileId: 'p',
  role: 'owner',
  chatId: null,
  via: 'automation',
  clientId: null,
} as const;

function folderOf(id: string, overrides: Partial<SyncthingFolder> = {}): SyncthingFolder {
  return {
    id,
    label: id === 'docs' ? 'Documents' : id,
    path: `/home/person/${id}`,
    type: FOLDER_TYPES[0],
    paused: false,
    state: 'idle',
    completionPercent: 100,
    needBytes: 0,
    needItems: 0,
    localChanges: 0,
    errors: [],
    errorCount: 0,
    stateError: null,
    sharedWith: [PEER_ID],
    lastScan: null,
    lastFile: null,
    ...overrides,
  };
}

function peerOf(id: string, overrides: Partial<SyncthingPeer> = {}): SyncthingPeer {
  return {
    id,
    name: 'Laptop',
    connected: true,
    paused: false,
    address: null,
    clientVersion: null,
    completionPercent: 80,
    needBytes: 200,
    inBytesPerSecond: 1500,
    outBytesPerSecond: 300,
    lastSeen: NOW,
    overdue: false,
    ...overrides,
  };
}

function snapshotOf(overrides: Partial<SyncthingSnapshot> = {}): SyncthingSnapshot {
  return {
    at: NOW,
    connection: { state: 'online' },
    version: 'v1',
    myId: SELF_ID,
    uptimeSeconds: 10,
    ratesLive: true,
    summary: {
      state: 'syncing',
      needBytes: 200,
      foldersBehind: 1,
      peersOnline: 1,
      peersTotal: 2,
      downloadBytesPerSecond: 1500,
      uploadBytesPerSecond: 300,
    },
    folders: [
      folderOf('docs'),
      folderOf('photos', {
        paused: true,
        state: 'error',
        completionPercent: 42.5,
        needBytes: 9000,
        errorCount: 3,
      }),
    ],
    peers: [
      peerOf(PEER_ID),
      peerOf(NEW_ID, { name: '', connected: false, lastSeen: null, completionPercent: 0 }),
    ],
    pendingDevices: [{ id: NEW_ID, name: 'Tablet', address: null, at: NOW }],
    pendingFolders: [
      {
        id: 'music',
        label: 'Music',
        offeredBy: [{ id: PEER_ID, name: 'Laptop', at: NOW }],
        encrypted: false,
      },
    ],
    attention: [],
    ...overrides,
  };
}

interface Rig {
  readonly tools: readonly PluginTool[];
  readonly commands: SyncthingCommand[];
}

function rigOf(snapshot: SyncthingSnapshot = snapshotOf()): Rig {
  const commands: SyncthingCommand[] = [];
  const tools = syncthingTools({
    snapshot: () => snapshot,
    activity: () => [
      {
        id: 3,
        at: NOW,
        kind: 'added',
        folderId: 'docs',
        path: 'a.txt',
        deviceId: null,
        remote: false,
      },
      {
        id: 2,
        at: NOW,
        kind: 'connected',
        folderId: null,
        path: null,
        deviceId: PEER_ID,
        remote: true,
      },
      {
        id: 1,
        at: NOW,
        kind: 'deleted',
        folderId: 'photos',
        path: 'b.jpg',
        deviceId: PEER_ID,
        remote: true,
      },
    ],
    command: (command) => {
      commands.push(command);
      return Promise.resolve('done');
    },
    importLocal: () => Promise.resolve(),
  });
  return { tools, commands };
}

const noStop = (): (() => Promise<void>) => () => Promise.resolve();

function isList(value: JsonValue | undefined): value is readonly JsonValue[] {
  return Array.isArray(value);
}

function reasonOf(page: PluginOptionPage): string {
  return page.state === 'unavailable' ? page.message : '';
}

function toolOf(rig: Rig, name: string): PluginTool {
  const found = rig.tools.find((tool) => tool.name === name);
  if (found === undefined) throw new Error(`no tool ${name}`);
  return found;
}

function errorOf(result: { readonly response: Readonly<Record<string, unknown>> }): string {
  const error = result.response['error'];
  if (typeof error !== 'string') throw new Error('the tool did not fail');
  return error;
}

describe('the Syncthing automation declaration', () => {
  it('is valid and runs only tools the plugin registers', () => {
    const assembled = expectContributionValid(syncthingPlugin, {
      tools: rigOf().tools.map((tool) => tool.name),
    });
    expect(assembled.rejections).toEqual([]);
  });

  it('serves the nodes, the values and one trigger per event as kinds of the Syncthing plugin', () => {
    const catalog = createKindCatalog();
    expect(syncContribution(catalog, pluginContribution(MANIFEST)).rejections).toEqual([]);
    for (const id of ['pause', 'rescan', 'invite', 'activity']) {
      expect(catalog.get(pluginNodeKindId(OWNER, id))).toMatchObject({ class: 'effect' });
    }
    for (const id of ['folder', 'peer']) {
      expect(catalog.get(pluginNodeKindId(OWNER, id))).toBeDefined();
    }
    const triggers = MANIFEST.contributes.automation.triggers;
    expect(triggers.map((entry) => entry.event).sort()).toEqual(
      SYNCTHING_EVENTS.map((event) => event.kind).sort(),
    );
    for (const entry of triggers) {
      expect(catalog.get(pluginTriggerKindId(OWNER, entry.id))).toMatchObject({
        class: 'trigger',
      });
    }
  });

  it('sends the commands without waiting and lets only the query wait', () => {
    const { nodes } = MANIFEST.contributes.automation;
    const modes = Object.fromEntries(nodes.map((node) => [node.id, pluginNodeModes(node)]));
    for (const id of ['pause', 'rescan', 'invite']) {
      expect(modes[id]).toEqual({
        default: 'fire_and_forget',
        allowed: ['fire_and_forget', 'wait_for_result'],
      });
    }
    expect(modes['activity']).toEqual({
      default: 'wait_for_result',
      allowed: ['wait_for_result'],
    });
    expect(nodes.every((node) => node.timeout !== undefined)).toBe(true);
  });

  it('gives every entity a picker the plugin registers and lets the triggers filter by entity', async () => {
    const sources: string[] = [];
    await startWithPickers(
      {
        options: {
          register: (source): (() => void) => {
            sources.push(source);
            return () => undefined;
          },
        },
        data: { publish: () => undefined },
        log: new Logger('hub.syncthing'),
      },
      noStop,
    );
    const { entities, triggers } = MANIFEST.contributes.automation;
    expect(entities.map((entity) => entity.options).sort()).toEqual([...sources].sort());
    expect(sources.sort()).toEqual([FOLDER_PICKER, INVITE_PICKER, PEER_PICKER].sort());
    const filters = Object.fromEntries(
      triggers.map((entry) => [entry.id, entry.filters.map((filter) => filter.type)]),
    );
    expect(filters['folder_error']).toEqual([{ t: 'entity', of: 'syncthing.folder' }]);
    expect(filters['conflict']).toEqual([{ t: 'entity', of: 'syncthing.folder' }]);
    expect(filters['device_overdue']).toEqual([{ t: 'entity', of: 'syncthing.peer' }]);
    expect(filters['failure']).toEqual([]);
  });

  it('declares only fields the events really carry', () => {
    const declared = Object.fromEntries(
      MANIFEST.contributes.events.map((event) => [event.kind, Object.keys(event.fields).sort()]),
    );
    const carried = (data: unknown, type: string): string[] => {
      const alert = alertOf({ id: 1, type, time: NOW, data });
      return Object.keys(alert?.data ?? {}).sort();
    };
    const files = { folder: 'docs', errors: [{ path: 'x', error: 'denied' }] };
    expect(carried(files, 'FolderErrors')).toEqual(declared['sync_folder_error']);
    expect(
      carried({ folder: 'docs', path: 'a.sync-conflict-1.txt' }, 'LocalChangeDetected'),
    ).toEqual(declared['sync_conflict']);
    expect(carried({ added: [{}] }, 'PendingDevicesChanged')).toEqual(
      declared['sync_device_invite'],
    );
    expect(carried({ added: [{}] }, 'PendingFoldersChanged')).toEqual(
      declared['sync_folder_invite'],
    );
    expect(carried('boom', 'Failure')).toEqual(declared['sync_failure']);
    for (const entry of MANIFEST.contributes.automation.triggers) {
      const fields = Object.keys(
        MANIFEST.contributes.events.find((event) => event.kind === entry.event)?.fields ?? {},
      );
      for (const field of [
        ...entry.filters.map((filter) => filter.match),
        ...entry.outputs.map((port) => port.from),
      ]) {
        expect(fields).toContain(field);
      }
    }
  });
});

describe('the Syncthing triggers', () => {
  function signalOf(kind: string, data: Record<string, string | number>): SignalInput {
    return {
      source: pluginSignalSource('syncthing'),
      kind,
      subject: 'docs',
      field: null,
      value: true,
      previous: null,
      at: NOW,
      profileId: null,
      data,
    };
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

  it('fires for the chosen folder only and hands over the folder and the count', () => {
    const errors = signalOf('sync_folder_error', { folder_id: 'docs', count: 2 });
    expect(firesOn('folder_error', { folder: 'docs' }, errors)).toEqual({
      folder: 'docs',
      count: 2,
      at: NOW,
    });
    expect(firesOn('folder_error', { folder: 'photos' }, errors)).toBeUndefined();
    expect(firesOn('folder_error', {}, errors)).toEqual({ folder: 'docs', count: 2, at: NOW });
  });

  it('fires for a conflict in a folder with the conflicting file', () => {
    const conflict = signalOf('sync_conflict', {
      folder_id: 'docs',
      path: 'a.sync-conflict-1.txt',
    });
    expect(firesOn('conflict', { folder: 'docs' }, conflict)).toEqual({
      folder: 'docs',
      path: 'a.sync-conflict-1.txt',
      at: NOW,
    });
    expect(firesOn('conflict', { folder: 'photos' }, conflict)).toBeUndefined();
  });

  it('fires for an overdue device with when it was last seen', () => {
    const overdue = signalOf('sync_device_overdue', { device_id: PEER_ID, last_seen: NOW });
    expect(firesOn('device_overdue', { peer: PEER_ID }, overdue)).toEqual({
      peer: PEER_ID,
      lastSeen: NOW,
      at: NOW,
    });
    expect(firesOn('device_overdue', { peer: NEW_ID }, overdue)).toBeUndefined();
  });

  it('fires for invitations and failures with their count and message', () => {
    expect(firesOn('device_invite', {}, signalOf('sync_device_invite', { count: 1 }))).toEqual({
      count: 1,
      at: NOW,
    });
    expect(firesOn('folder_invite', {}, signalOf('sync_folder_invite', { count: 2 }))).toEqual({
      count: 2,
      at: NOW,
    });
    expect(firesOn('failure', {}, signalOf('sync_failure', { message: 'disk full' }))).toEqual({
      message: 'disk full',
      at: NOW,
    });
  });
});

describe('the Syncthing values', () => {
  function read(valueId: string, key: string): Record<string, unknown> {
    const value = MANIFEST.contributes.automation.values.find((entry) => entry.id === valueId);
    const select = value?.from.select;
    if (value === undefined || select === undefined) throw new Error(`no selecting ${valueId}`);
    expect(value.from.stream).toBe(SNAPSHOT_STREAM);
    const reading = JSON_VALUE.parse(snapshotOf());
    const list = readPointer(reading, select.list);
    const item = isList(list)
      ? list.find((entry) => readPointer(entry, select.key) === key)
      : undefined;
    if (item === undefined) throw new Error(`no entry ${key}`);
    return Object.fromEntries(
      value.outputs.map((port) => [port.name, readPointer(item, port.from)]),
    );
  }

  it('reads a folder from the published snapshot by the id the picker gave', () => {
    expect(read('folder', 'photos')).toEqual({
      state: 'error',
      percent: 42.5,
      bytesLeft: 9000,
      errors: 3,
      paused: true,
    });
    expect(read('folder', 'docs')).toMatchObject({ state: 'idle', percent: 100, paused: false });
  });

  it('reads a sync device, with no last seen time as nothing', () => {
    expect(read('peer', PEER_ID)).toEqual({
      online: true,
      percent: 80,
      lastSeen: NOW,
      downloadRate: 1500,
      uploadRate: 300,
    });
    expect(read('peer', NEW_ID)).toMatchObject({ online: false, lastSeen: null });
  });
});

describe('the Syncthing pickers', () => {
  interface Picked {
    readonly providers: Map<string, PluginOptionProvider>;
    readonly publish: (value: JsonValue) => void;
    readonly stop: () => Promise<void>;
    readonly published: string[];
  }

  async function picked(): Promise<Picked> {
    const providers = new Map<string, PluginOptionProvider>();
    const published: string[] = [];
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
          publish: (stream): void => {
            published.push(stream);
          },
        },
        log: new Logger('hub.syncthing'),
      },
      (context) => {
        publishTo = context.data.publish;
        return noStop();
      },
    );
    return {
      providers,
      published,
      stop,
      publish: (value): void => {
        publishTo(SNAPSHOT_STREAM, value);
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

  function ready(
    page: PluginOptionPage,
  ): readonly { id: string; label: string; detail: string | null }[] {
    if (page.state !== 'ready') throw new Error(`not ready: ${page.message}`);
    return page.options.map(({ id, label, detail }) => ({ id, label, detail }));
  }

  function shown(snapshot: SyncthingSnapshot): JsonValue {
    return JSON_VALUE.parse(snapshot);
  }

  it('says Syncthing has not reported before the first snapshot', async () => {
    const rig = await picked();
    expect(await ask(rig, FOLDER_PICKER)).toMatchObject({ state: 'unavailable' });
  });

  it('lists folders, devices and invitations from the snapshot the plugin publishes', async () => {
    const rig = await picked();
    rig.publish(shown(snapshotOf()));
    expect(rig.published).toEqual([SNAPSHOT_STREAM]);
    expect(ready(await ask(rig, FOLDER_PICKER))).toEqual([
      { id: 'docs', label: 'Documents', detail: '/home/person/docs' },
      { id: 'photos', label: 'photos', detail: 'Paused' },
    ]);
    expect(ready(await ask(rig, PEER_PICKER))).toEqual([
      { id: PEER_ID, label: 'Laptop', detail: 'Online' },
      { id: NEW_ID, label: 'IIIIIII', detail: 'Offline' },
    ]);
    expect(ready(await ask(rig, INVITE_PICKER))).toEqual([
      { id: `device:${NEW_ID}`, label: 'Tablet', detail: 'Wants to connect' },
      { id: 'folder:music', label: 'Music', detail: 'Offered by Laptop' },
    ]);
  });

  it('searches, resolves stored ids and pages without a cap on the total', async () => {
    const rig = await picked();
    rig.publish(
      shown(
        snapshotOf({
          folders: Array.from({ length: 120 }, (_, index) => folderOf(`f${String(index + 1)}`)),
        }),
      ),
    );
    const first = await ask(rig, FOLDER_PICKER);
    const second =
      first.state === 'ready' && first.next !== null
        ? await ask(rig, FOLDER_PICKER, { after: first.next })
        : first;
    expect(ready(first)).toHaveLength(50);
    expect(ready(second)[0]?.id).toBe('f51');
    expect(ready(await ask(rig, FOLDER_PICKER, { q: 'f12' })).map((entry) => entry.id)).toEqual([
      'f12',
      'f120',
    ]);
    expect(
      ready(await ask(rig, FOLDER_PICKER, { ids: 'f120,f7,none' })).map((entry) => entry.id),
    ).toEqual(['f7', 'f120']);
  });

  it.each([
    [{ state: 'not_set_up' }, 'not set up'],
    [{ state: 'key_rejected' }, 'refused the API key'],
  ] as const)('says why nothing is listed while the connection is %j', async (connection, text) => {
    const rig = await picked();
    rig.publish(shown(snapshotOf({ connection })));
    for (const source of [FOLDER_PICKER, PEER_PICKER, INVITE_PICKER]) {
      expect(reasonOf(await ask(rig, source))).toContain(text);
    }
  });

  it('says why while it is still connecting or unreachable and nothing was ever read', async () => {
    const rig = await picked();
    rig.publish(shown(snapshotOf({ connection: { state: 'connecting' }, myId: null })));
    expect(reasonOf(await ask(rig, FOLDER_PICKER))).toContain('still connecting');
    rig.publish(
      shown(
        snapshotOf({
          connection: { state: 'unreachable', reason: 'timed out', since: NOW },
          myId: null,
        }),
      ),
    );
    expect(reasonOf(await ask(rig, FOLDER_PICKER))).toContain('timed out');
  });

  it('keeps listing the last known folders while Syncthing is unreachable', async () => {
    const rig = await picked();
    rig.publish(
      shown(snapshotOf({ connection: { state: 'unreachable', reason: 'timed out', since: NOW } })),
    );
    expect(ready(await ask(rig, FOLDER_PICKER)).map((entry) => entry.id)).toEqual([
      'docs',
      'photos',
    ]);
  });

  it('logs a snapshot it cannot read and keeps the last good one', async () => {
    const logs = captureLogs();
    const rig = await picked();
    rig.publish(shown(snapshotOf()));
    rig.publish({ folders: 'broken' });
    expect(logs.events()).toContain('syncthing.picker_snapshot_invalid');
    expect(ready(await ask(rig, FOLDER_PICKER))).toHaveLength(2);
    expect(rig.published).toEqual([SNAPSHOT_STREAM, SNAPSHOT_STREAM]);
  });

  it('stops offering the pickers when the plugin stops', async () => {
    const rig = await picked();
    await rig.stop();
    expect(rig.providers.size).toBe(0);
  });

  it('reads the snapshot with the same shape the plugin publishes', () => {
    expect(SYNCTHING_SNAPSHOT.safeParse(shown(snapshotOf())).success).toBe(true);
  });
});

describe('the Syncthing automation tools', () => {
  it('pauses everything, one folder or one device with one flat tool', async () => {
    const rig = rigOf();
    const tool = toolOf(rig, 'pause_syncing');
    await tool.run({ what: 'everything', paused: true }, CALLER);
    await tool.run({ what: 'folder', folderId: 'docs', paused: false }, CALLER);
    await tool.run({ what: 'peer', deviceId: PEER_ID, paused: true }, CALLER);
    expect(rig.commands).toEqual([
      { command: 'set_paused', target: { kind: 'all' }, paused: true },
      { command: 'set_paused', target: { kind: 'folder', id: 'docs' }, paused: false },
      { command: 'set_paused', target: { kind: 'device', id: PEER_ID }, paused: true },
    ]);
  });

  it('refuses a folder or device pause that names none, without calling Syncthing', async () => {
    const rig = rigOf();
    const tool = toolOf(rig, 'pause_syncing');
    expect(errorOf(await tool.run({ what: 'folder', paused: true }, CALLER))).toContain('folder');
    expect(errorOf(await tool.run({ what: 'peer', paused: true }, CALLER))).toContain('device');
    expect(rig.commands).toEqual([]);
  });

  it('rescans one folder, or every folder when none is given', async () => {
    const rig = rigOf();
    const tool = toolOf(rig, 'rescan_folder');
    await tool.run({ folderId: 'docs' }, CALLER);
    await tool.run({}, CALLER);
    expect(rig.commands).toEqual([
      { command: 'rescan', folderId: 'docs' },
      { command: 'rescan', folderId: null },
    ]);
  });

  it('accepts a device with the name it gave and a folder at the default place', async () => {
    const rig = rigOf();
    const tool = toolOf(rig, 'answer_invitation');
    await tool.run({ invite: `device:${NEW_ID}`, answer: 'accept' }, CALLER);
    await tool.run({ invite: 'folder:music', answer: 'accept' }, CALLER);
    expect(rig.commands).toEqual([
      { command: 'accept_device', deviceId: NEW_ID, name: 'Tablet' },
      { command: 'accept_folder', folderId: 'music', path: null },
    ]);
  });

  it('accepts a folder at a chosen place', async () => {
    const rig = rigOf();
    await toolOf(rig, 'answer_invitation').run(
      { invite: 'folder:music', answer: 'accept', path: '/data/music' },
      CALLER,
    );
    expect(rig.commands).toEqual([
      { command: 'accept_folder', folderId: 'music', path: '/data/music' },
    ]);
  });

  it('offers one tool for each job, with no older twin', () => {
    const names = rigOf().tools.map((tool) => tool.name);
    for (const gone of ['set_paused', 'rescan', 'accept_invite', 'ignore_invite']) {
      expect(names).not.toContain(gone);
    }
    expect(names).toEqual(
      expect.arrayContaining(['pause_syncing', 'rescan_folder', 'answer_invitation']),
    );
  });

  it('ignores a device and a folder', async () => {
    const rig = rigOf();
    const tool = toolOf(rig, 'answer_invitation');
    await tool.run({ invite: `device:${NEW_ID}`, answer: 'ignore' }, CALLER);
    await tool.run({ invite: 'folder:music', answer: 'ignore' }, CALLER);
    expect(rig.commands).toEqual([
      { command: 'ignore_device', deviceId: NEW_ID },
      { command: 'ignore_folder', folderId: 'music' },
    ]);
  });

  it('refuses an invitation that is gone or not an invitation', async () => {
    const rig = rigOf();
    const tool = toolOf(rig, 'answer_invitation');
    expect(errorOf(await tool.run({ invite: 'folder:gone', answer: 'accept' }, CALLER))).toContain(
      'no longer offered',
    );
    expect(
      errorOf(await tool.run({ invite: `device:${PEER_ID}`, answer: 'accept' }, CALLER)),
    ).toContain('no longer asking');
    expect(errorOf(await tool.run({ invite: 'music', answer: 'accept' }, CALLER))).toContain(
      'not a Syncthing invitation',
    );
    expect(rig.commands).toEqual([]);
  });

  it('returns the recent activity with its count, for one folder or all', async () => {
    const rig = rigOf();
    const tool = toolOf(rig, 'activity');
    const all = await tool.run({ limit: 50, folderId: null }, CALLER);
    expect(all.response).toMatchObject({ count: 3 });
    const docs = await tool.run({ limit: 50, folderId: 'docs' }, CALLER);
    expect(docs.response).toMatchObject({ count: 1 });
    const one = await tool.run({ limit: 1, folderId: null }, CALLER);
    expect(one.response).toMatchObject({ count: 1 });
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
    name: `syncthing__${tool.name}`,
    title: tool.title,
    description: tool.description,
    inputSchema: tool.inputSchema,
    annotations: tool.annotations,
    origin: { kind: 'plugin', pluginId: 'syncthing' },
    humanOnly: tool.humanOnly,
  };
}

type Params = Record<string, string | number | boolean>;

function performer(
  tools: readonly PluginTool[],
): (kind: string, params: Params, mode?: 'wait_for_result') => Promise<unknown> {
  const byName = new Map(tools.map((tool) => [`syncthing__${tool.name}`, tool]));
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

describe('the Syncthing nodes in an automation run', () => {
  it('sends a pause without waiting and runs the command when it waits', async () => {
    const rig = rigOf();
    const perform = performer(rig.tools);
    const kind = pluginNodeKindId(OWNER, 'pause');
    expect(await perform(kind, { what: 'everything', paused: true })).toEqual({
      ok: true,
      value: { sent: true },
    });
    expect(
      await perform(kind, { what: 'folder', folder: 'docs', paused: false }, 'wait_for_result'),
    ).toMatchObject({ ok: true });
    expect(
      await perform(kind, { what: 'peer', peer: PEER_ID, paused: true }, 'wait_for_result'),
    ).toMatchObject({ ok: true });
    const sent = rig.commands.map((command) => JSON.stringify(command)).sort();
    expect(sent).toEqual(
      [
        { command: 'set_paused', target: { kind: 'all' }, paused: true },
        { command: 'set_paused', target: { kind: 'folder', id: 'docs' }, paused: false },
        { command: 'set_paused', target: { kind: 'device', id: PEER_ID }, paused: true },
      ]
        .map((command) => JSON.stringify(command))
        .sort(),
    );
  });

  it('rescans every folder when the folder is left empty', async () => {
    const rig = rigOf();
    await performer(rig.tools)(pluginNodeKindId(OWNER, 'rescan'), {}, 'wait_for_result');
    expect(rig.commands).toEqual([{ command: 'rescan', folderId: null }]);
  });

  it('answers a picked invitation', async () => {
    const rig = rigOf();
    await performer(rig.tools)(
      pluginNodeKindId(OWNER, 'invite'),
      { invite: `device:${NEW_ID}`, answer: 'accept' },
      'wait_for_result',
    );
    expect(rig.commands).toEqual([{ command: 'accept_device', deviceId: NEW_ID, name: 'Tablet' }]);
  });

  it('hands the recent changes and their count to the next node', async () => {
    const rig = rigOf();
    const perform = performer(rig.tools);
    const result = await perform(pluginNodeKindId(OWNER, 'activity'), {
      folder: 'docs',
      limit: 50,
    });
    expect(result).toMatchObject({
      ok: true,
      value: { count: 1, changes: [{ kind: 'added', path: 'a.txt', folderId: 'docs' }] },
    });
    expect(await perform(pluginNodeKindId(OWNER, 'activity'), { limit: 2 })).toMatchObject({
      ok: true,
      value: { count: 2 },
    });
  });

  it('leaves through the error exit with the reason when a pause names no folder', async () => {
    const rig = rigOf();
    const result = await performer(rig.tools)(
      pluginNodeKindId(OWNER, 'pause'),
      { what: 'folder', paused: true },
      'wait_for_result',
    );
    expect(result).toHaveProperty('ok', false);
    expect(result).toHaveProperty('message', 'Choose the folder to pause or resume');
    expect(rig.commands).toEqual([]);
  });
});
