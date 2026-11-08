import { describe, expect, it } from 'vitest';
import { STATIC_KIND_LOOKUP, type NodeKindLookup } from '@smarteverything/domain';
import type { TableRow, TriggerNode } from '@smarteverything/domain';
import { kindLookupOf } from '../features/automations/data/kind-lookup';
import { ARRIVED_KIND_ID, arrivedKind, kindRow } from '../test-support/plugin-kinds';
import { emptyState, makeTable } from '../store/state';
import { nodeId, storedAutomationRow } from '../test-support/automation-rows';
import { automationRuntimePages } from './automation-runtime-pages';
import { routinesOf } from './routines';
import { sourcesOf, type SearchTables, type SourceLinks } from './sources';

const TRIGGER: TriggerNode = {
  id: nodeId(1),
  key: 't1',
  kind: ARRIVED_KIND_ID,
  ports: { where: { lit: { group: 'kitchen' } } },
};

const ROW: TableRow<'automations'> = storedAutomationRow({
  index: 1,
  name: 'Welcome',
  triggers: [TRIGGER],
  nodes: [],
});

const LOOKUP = kindLookupOf([kindRow('active', arrivedKind())]);

const AUTOMATIONS = makeTable({ [ROW.id]: ROW }, [ROW.id], 1);

const KIND_ROW = kindRow('active', arrivedKind());

const ENV = {
  owner: true,
  platform: 'android',
  developer: false,
  availability: {
    hasDevices: true,
    hasClimate: false,
    hasCameras: false,
    hasHealth: false,
    hasScenes: false,
    hasEnergy: false,
    hasSecurity: false,
    hasIr: false,
    hasWatch: false,
    needsAttention: false,
  },
} as const;

function searchTables(): SearchTables {
  const { tables } = emptyState();
  return {
    devices: tables.devices,
    rooms: tables.rooms,
    deviceGroups: tables.device_groups,
    scenes: tables.scenes,
    automations: AUTOMATIONS,
    scheduled: tables.scheduled_actions,
    plugins: tables.plugins,
    pluginStreams: tables.plugin_streams,
    pluginUi: tables.plugin_ui,
    automationPluginKinds: tables.automation_plugin_kinds,
    chats: [],
    homeMaps: [],
    modelCategories: [],
    extensions: undefined,
    configuration: undefined,
    inventory: undefined,
  };
}

function linksOf(): SourceLinks {
  return { links: new Map(), icons: new Map(), parents: new Map(), plugins: new Set() };
}

describe('search over automations with plugin kinds', () => {
  it('indexes the keywords of a plugin trigger once the lookup knows its kind', () => {
    const tables = { scenes: emptyState().tables.scenes, automations: AUTOMATIONS };
    expect(routinesOf(tables, LOOKUP).automations[0]?.triggerKeywords).toContain('arrive');
    expect(routinesOf(tables, STATIC_KIND_LOOKUP).automations[0]?.triggerKeywords).not.toContain(
      'arrive',
    );
  });

  it('adds a page for the plugin trigger under its automation', () => {
    const titles = (kinds: NodeKindLookup): readonly string[] =>
      automationRuntimePages(searchTables(), linksOf(), kinds).map((page) => page.title);
    expect(titles(LOOKUP)).toContain('Someone arrives at the demo');
    expect(titles(STATIC_KIND_LOOKUP)).not.toContain('Someone arrives at the demo');
  });

  it('reads the plugin kinds from the synced table when it builds the sources', () => {
    const pluginKinds = makeTable({ [KIND_ROW.kind_id]: KIND_ROW }, [KIND_ROW.kind_id], 1);
    const titlesOf = (kinds: SearchTables['automationPluginKinds']): readonly string[] =>
      sourcesOf({ ...searchTables(), automationPluginKinds: kinds }, [], ENV, linksOf()).pages.map(
        (page) => page.title,
      );
    expect(titlesOf(pluginKinds)).toContain('Someone arrives at the demo');
    expect(titlesOf(emptyState().tables.automation_plugin_kinds)).not.toContain(
      'Someone arrives at the demo',
    );
  });
});
