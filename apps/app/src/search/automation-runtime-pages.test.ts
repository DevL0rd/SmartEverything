import { describe, expect, it } from 'vitest';
import type { TableRow } from '@smarteverything/domain';
import { emptyState, makeTable } from '../store/state';
import type { SearchTables, SourceLinks } from './sources';
import { links } from '../features/automations';
import {
  buttonTrigger,
  rowId,
  setPower,
  storedAutomationRow,
} from '../test-support/automation-rows';
import { automationRuntimePages } from './automation-runtime-pages';

type Automation = TableRow<'automations'>;

const KITCHEN = '00000000-0000-4000-8000-000000000129';
const LIVING = '00000000-0000-4000-8000-000000000030';

function morning(index: number): Automation {
  return storedAutomationRow({
    index,
    name: 'Kitchen press',
    triggers: [buttonTrigger(KITCHEN, 'single_press')],
    nodes: [setPower(LIVING, true)],
  });
}

function unreadable(index: number): Automation {
  return { ...morning(index), revision: 0 };
}

function tablesOf(rows: readonly Automation[]): SearchTables {
  const { tables } = emptyState();
  return {
    devices: tables.devices,
    rooms: tables.rooms,
    deviceGroups: tables.device_groups,
    scenes: tables.scenes,
    automations: makeTable(
      Object.fromEntries(rows.map((row) => [row.id, row])),
      rows.map((row) => row.id),
      1,
    ),
    scheduled: tables.scheduled_actions,
    plugins: tables.plugins,
    pluginStreams: tables.plugin_streams,
    pluginUi: tables.plugin_ui,
    chats: [],
    extensions: undefined,
    configuration: undefined,
    inventory: undefined,
  };
}

function linksOf(): SourceLinks {
  return { links: new Map(), icons: new Map(), parents: new Map(), plugins: new Set() };
}

describe('automationRuntimePages', () => {
  it('adds the flowchart and actions under every stored automation', () => {
    const id = rowId(1);
    const out = linksOf();
    const pages = automationRuntimePages(tablesOf([morning(1)]), out);
    const paths = pages.map((page) => page.path);
    for (const key of ['flowchart', 'test', 'publish']) {
      expect(paths).toContain(`automation-editor:${id}:${key}`);
      expect(out.parents.get(`page:automation-editor:${id}:${key}`)).toBe(`automation:${id}`);
    }
    expect(out.links.get(`page:automation-editor:${id}:flowchart`)).toEqual(links.edit(id));
  });

  it('gives each node of the program its own page that opens the editor on it', () => {
    const id = rowId(1);
    const out = linksOf();
    const pages = automationRuntimePages(tablesOf([morning(1)]), out);
    const nodePages = pages.filter((page) => page.path.startsWith(`automation-editor:${id}:node:`));
    expect(nodePages.length).toBeGreaterThan(0);
    const [first] = nodePages;
    expect(out.links.get(`page:${first?.path ?? ''}`)).toEqual(
      links.edit(id, first?.path.slice(`automation-editor:${id}:`.length)),
    );
  });

  it('keeps every path unique across automations', () => {
    const paths = automationRuntimePages(tablesOf([morning(1), morning(2)]), linksOf()).map(
      (page) => page.path,
    );
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('gives no editor pages to a stored row that is not a readable program', () => {
    expect(automationRuntimePages(tablesOf([unreadable(1)]), linksOf())).toEqual([]);
  });
});
