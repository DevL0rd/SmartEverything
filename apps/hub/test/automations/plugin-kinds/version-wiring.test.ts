import {
  AUTOMATION_V4,
  PLUGIN_NODE,
  PLUGIN_TRIGGER,
  type FunctionRow,
  type FunctionV4,
  type JsonValue,
  type NodeKind,
  type PluginManifest,
  type StoredAutomationRow,
} from '@smarteverything/domain';
import { lint, type Finding } from '@smarteverything/flow/check/lint';
import { structuredOf } from '@smarteverything/flow/graph/structured-of';
import { idOf, start } from '@smarteverything/flow/test/graph/graph-fixtures';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createKindCatalog,
  syncContribution,
  type PluginKindCatalog,
} from '../../../src/automations/plugin-kinds/catalog';
import { pluginContribution } from '../../../src/automations/plugin-kinds/contributions';
import { kindLedger, usedKindsOf } from '../../../src/automations/plugin-kinds/ledger';
import { persistPluginKinds } from '../../../src/automations/plugin-kinds/store';
import { lintContextOf } from '../../../src/automations/service-programs-analysis';
import type { Store } from '../../../src/store/store';
import { graphFunction } from '../../automations-v3/support/graph-of';
import { EMPTY_LAYOUT, PLACEHOLDER_HASH } from '../../support/automation-fixture';
import { captureLogs, type CapturedLogs } from '../../support/logs';
import { testStore, type TestStore } from '../../support/store';
import { POSTED_TRIGGER, POST_NODE, manifestWith } from './fixtures';

const POST = 'plugin.chat_hub.post_message';
const POSTED = 'trigger.plugin.chat_hub.message_posted';
const OWNER = 'plugin:chat-hub';

const RENAMED_TRIGGER = {
  ...POSTED_TRIGGER,
  version: 2,
  summary: 'A message in {room}',
  filters: POSTED_TRIGGER.filters.map((filter) => ({ ...filter, name: 'room' })),
  renamed: { channel: 'room' },
};

const RENAMED_NODE = {
  ...POST_NODE,
  version: 2,
  summary: 'Post {text} to {room}',
  inputs: POST_NODE.inputs.map((port) =>
    port.name === 'channel' ? { ...port, name: 'room' } : port,
  ),
  run: { tool: 'post', args: { channelId: { port: 'room' }, body: { port: 'text' } } },
  renamed: { channel: 'room' },
};

const DROPPED_NODE = {
  ...POST_NODE,
  version: 2,
  summary: 'Post to {channel}',
  inputs: POST_NODE.inputs.filter((port) => port.name !== 'text'),
  run: { tool: 'post', args: { channelId: { port: 'channel' } } },
};

let opened: TestStore;
let logs: CapturedLogs;

beforeEach(async () => {
  opened = await testStore();
  logs = captureLogs();
});

afterEach(async () => {
  await opened.close();
});

function hub(): PluginKindCatalog {
  const { store } = opened;
  const catalog: PluginKindCatalog = createKindCatalog(
    undefined,
    kindLedger(store, () => catalog),
  );
  persistPluginKinds(catalog, store.pluginKinds, () => usedKindsOf(store));
  return catalog;
}

interface Declared {
  readonly nodes?: readonly Record<string, unknown>[];
  readonly triggers?: readonly Record<string, unknown>[];
}

function sync(
  catalog: PluginKindCatalog,
  declared: Declared,
  version = '1.2.0',
): ReturnType<typeof syncContribution> {
  const manifest: PluginManifest = {
    ...manifestWith('chat-hub', { ...declared, autoTriggers: false }),
    version,
  };
  return syncContribution(catalog, pluginContribution(manifest));
}

function watcher(
  catalog: PluginKindCatalog,
  ports: Readonly<Record<string, JsonValue>>,
): StoredAutomationRow {
  const literals = Object.fromEntries(Object.entries(ports).map(([name, lit]) => [name, { lit }]));
  return opened.store.automations.create(
    {
      name: 'Watcher',
      enabled: true,
      program: AUTOMATION_V4.parse({
        version: 4,
        kind: 'automation',
        triggers: [{ id: idOf('posted'), key: 'posted', kind: POSTED, ports: literals }],
        inputs: [],
        outputs: [],
        variables: [],
        nodes: [start()],
        policy: { mode: 'single' },
      }),
      layout: EMPTY_LAYOUT,
      planHash: PLACEHOLDER_HASH,
      origin: null,
      author: null,
    },
    catalog,
  );
}

function poster(
  catalog: PluginKindCatalog,
  ports: Readonly<Record<string, JsonValue>>,
): FunctionV4 {
  return graphFunction(
    {
      version: 3,
      kind: 'function',
      flavour: 'action',
      inputs: [],
      outputs: [],
      exits: ['done'],
      variables: [],
      body: {
        nodes: [
          {
            id: idOf('post'),
            key: 'post',
            kind: POST,
            ports: Object.fromEntries(Object.entries(ports).map(([name, lit]) => [name, { lit }])),
          },
        ],
      },
    },
    catalog,
  );
}

function storedFunction(catalog: PluginKindCatalog, program: FunctionV4): FunctionRow {
  return opened.store.automationFunctions.create(
    {
      name: 'Poster',
      program,
      layout: EMPTY_LAYOUT,
      interfaceHash: PLACEHOLDER_HASH,
      compat: 'compatible',
      planHash: PLACEHOLDER_HASH,
      createdBy: null,
      author: null,
    },
    catalog,
  );
}

function inputNames(kind: NodeKind | undefined): string[] {
  return (kind?.inputs ?? []).map((port) => port.name);
}

function lintOf(catalog: PluginKindCatalog, store: Store, id: string): readonly Finding[] {
  const structured = structuredOf(store.automations.byId(id).definition, catalog);
  if (structured.kind === 'unstructured') throw new Error('The program is not a graph.');
  const env = {
    store,
    programs: store.automations,
    functions: store.automationFunctions,
    plans: store.automationPlans,
    secrets: { list: (): never[] => [] },
    kinds: catalog,
  };
  return lint(structured.tree, lintContextOf(env));
}

describe('a new version of a plugin kind is judged before it is published', () => {
  it('rejects an incompatible change into the status detail and keeps the old declaration active', () => {
    const catalog = hub();
    expect(sync(catalog, { nodes: [POST_NODE] }).rejections).toEqual([]);
    const result = sync(catalog, { nodes: [DROPPED_NODE] });
    expect(result.accepted).toEqual([]);
    expect(result.statusDetail).toContain(POST);
    expect(inputNames(catalog.get(POST))).toEqual(['channel', 'text']);
    expect(inputNames(opened.store.pluginKinds.find(POST)?.declaration)).toEqual([
      'channel',
      'text',
    ]);
    expect(opened.store.pluginKinds.find(POST)?.version).toBe('1');
    expect(logs.events()).toContain('plugin_kinds.version_rejected');
  });

  it('compares the kind own version, never the plugin version', () => {
    const catalog = hub();
    sync(catalog, { nodes: [POST_NODE] });
    const bumped = sync(catalog, { nodes: [DROPPED_NODE] }, '9.0.0');
    expect(bumped.statusDetail).toContain('removedPorts');
    const mapped = { ...DROPPED_NODE, removedPorts: ['text'] };
    expect(sync(catalog, { nodes: [{ ...mapped, version: 1 }] }, '9.0.0').statusDetail).toContain(
      'version must be raised',
    );
    expect(sync(catalog, { nodes: [mapped] }, '9.0.0').statusDetail).toBeNull();
    expect(inputNames(catalog.get(POST))).toEqual(['channel']);
    expect(opened.store.pluginKinds.find(POST)?.version).toBe('2');
  });

  it('rewrites stored programs from the declared map and records a new revision', () => {
    const catalog = hub();
    sync(catalog, { triggers: [POSTED_TRIGGER] });
    const saved = watcher(catalog, { channel: 'general' });
    expect(sync(catalog, { triggers: [RENAMED_TRIGGER] }).rejections).toEqual([]);
    const row = opened.store.automations.byId(saved.id);
    expect(row.definition.triggers.map((trigger) => trigger.ports)).toEqual([
      { room: { lit: 'general' } },
    ]);
    expect(row.revision).toBe(saved.revision + 1);
    expect(opened.store.automationRevisions.latest(saved.id)?.revision).toBe(row.revision);
    expect(logs.events()).toContain('plugin_kinds.programs_migrated');
    expect(sync(catalog, { triggers: [RENAMED_TRIGGER] }).rejections).toEqual([]);
    expect(opened.store.automations.byId(saved.id).revision).toBe(row.revision);
  });

  it('rewrites the latest revision and the draft of stored Custom Nodes the same way', () => {
    const catalog = hub();
    sync(catalog, { nodes: [POST_NODE] });
    const saved = storedFunction(catalog, poster(catalog, { channel: 'general' }));
    opened.store.automationFunctions.saveDraft(
      saved.id,
      { program: poster(catalog, { channel: 'drafted' }), layout: EMPTY_LAYOUT },
      saved.latest_revision,
      catalog,
    );
    expect(sync(catalog, { nodes: [RENAMED_NODE] }).rejections).toEqual([]);
    const row = opened.store.automationFunctions.byId(saved.id);
    const latest = opened.store.automationFunctions.latest(saved.id);
    expect(row.latest_revision).toBe(saved.latest_revision + 1);
    const portsOf = (nodes: readonly { key: string; ports?: unknown }[] | undefined): unknown =>
      nodes?.find((node) => node.key === 'post')?.ports;
    expect(portsOf(latest.definition.nodes)).toEqual({ room: { lit: 'general' } });
    expect(portsOf(row.draft?.program.nodes)).toEqual({ room: { lit: 'drafted' } });
    expect(logs.events()).toContain('plugin_kinds.functions_migrated');
    expect(sync(catalog, { nodes: [RENAMED_NODE] }).rejections).toEqual([]);
    expect(opened.store.automationFunctions.byId(saved.id).latest_revision).toBe(
      row.latest_revision,
    );
  });

  it('leaves programs alone when the change needs no rewrite', () => {
    const catalog = hub();
    sync(catalog, { triggers: [POSTED_TRIGGER] });
    const saved = watcher(catalog, { channel: 'general' });
    sync(catalog, { triggers: [{ ...POSTED_TRIGGER, version: 2 }] });
    expect(opened.store.automations.byId(saved.id).revision).toBe(saved.revision);
  });
});

describe('a switched off or removed plugin kind', () => {
  it('lints as advice while the plugin is off and keeps the program loadable', () => {
    const catalog = hub();
    sync(catalog, { triggers: [POSTED_TRIGGER] });
    const saved = watcher(catalog, { channel: 'general' });
    catalog.remove(OWNER);
    expect(opened.store.pluginKinds.find(POSTED)?.status).toBe('off');
    expect(catalog.get(POSTED)?.id).toBe(POSTED);
    const findings = lintOf(catalog, opened.store, saved.id);
    expect(findings.find((entry) => entry.code === 'plugin_off')?.severity).toBe('warning');
    expect(findings.some((entry) => entry.severity === 'error')).toBe(false);
  });

  it('retires a removed kind, errors in lint with the replacement and prunes it once unused', () => {
    const catalog = hub();
    sync(catalog, { triggers: [{ ...POSTED_TRIGGER, replacedBy: 'trigger.presence' }] });
    const saved = watcher(catalog, { channel: 'general' });
    sync(catalog, {});
    expect(opened.store.pluginKinds.find(POSTED)?.status).toBe('retired');
    const retired = lintOf(catalog, opened.store, saved.id).find(
      (entry) => entry.code === 'plugin_kind_retired',
    );
    expect(retired?.severity).toBe('error');
    expect(retired?.message).toContain('trigger.presence');
    opened.store.automations.remove(saved.id);
    sync(catalog, {});
    expect(opened.store.pluginKinds.find(POSTED)).toBeUndefined();
    expect(logs.events()).toContain('plugin_kinds.pruned');
  });

  it('keeps a retired row while any stored program still uses it', () => {
    const catalog = hub();
    sync(catalog, { triggers: [POSTED_TRIGGER] });
    watcher(catalog, { channel: 'general' });
    sync(catalog, {});
    sync(catalog, {});
    expect(opened.store.pluginKinds.find(POSTED)?.status).toBe('retired');
  });
});

describe('the contribution schema carries the migration fields', () => {
  it('accepts renamed, removedPorts and replacedBy and refuses a map that contradicts the ports', () => {
    expect(PLUGIN_TRIGGER.safeParse(RENAMED_TRIGGER).success).toBe(true);
    expect(PLUGIN_NODE.safeParse({ ...POST_NODE, replacedBy: 'notify.person' }).success).toBe(true);
    expect(PLUGIN_NODE.safeParse({ ...POST_NODE, removedPorts: ['text'] }).success).toBe(false);
    expect(PLUGIN_NODE.safeParse({ ...POST_NODE, renamed: { text: 'missing' } }).success).toBe(
      false,
    );
  });
});
