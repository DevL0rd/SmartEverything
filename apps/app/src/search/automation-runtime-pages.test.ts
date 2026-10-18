import { describe, expect, it, vi } from 'vitest';
import type { TableRow } from '@smarteverything/domain';
import { emptyState, makeTable } from '../store/state';
import type { SearchTables, SourceLinks } from './sources';
import { href } from '../app-shell/hrefs';

const focusTargets = vi.hoisted(() => vi.fn());

vi.mock('../features/automations', () => ({
  storedFocusTargets: focusTargets,
  valueFocusTargets: (): readonly string[] => [],
}));

import { automationRuntimePages } from './automation-runtime-pages';

type Automation = TableRow<'automations'>;

const MOMENT = '2026-10-16T08:00:00.000Z';
const V2_DEFINITION = {
  when: [{ on: 'time', at: '07:00' }],
  steps: [{ do: 'notify', message: 'Good morning' }],
};
const V1_DEFINITION = {
  triggers: [{ type: 'interval', everyMinutes: 5 }],
  conditions: { mode: 'all', items: [] },
  actions: [{ type: 'notify', message: 'Old' }],
};

function automation(id: string, definition: Automation['definition']): Automation {
  return {
    id,
    name: id,
    enabled: true,
    revision: 1,
    definition,
    origin: null,
    author: null,
    last_run_at: null,
    last_error: null,
    run_count: 0,
    created_at: MOMENT,
    updated_at: MOMENT,
  };
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
  it('builds editor focus pages for an automation the editor can read', () => {
    focusTargets.mockReturnValue({
      reusable: false,
      targets: [{ key: 'name', parent: null, title: 'Name', focus: 'name', keywords: ['rename'] }],
    });
    const out = linksOf();
    const pages = automationRuntimePages(tablesOf([automation('morning', V2_DEFINITION)]), out);
    expect(pages.map((page) => page.path)).toEqual(['automation-editor:morning:name']);
    expect(out.parents.get('page:automation-editor:morning:name')).toBe('automation:morning');
    expect(out.links.get('page:automation-editor:morning:name')).toEqual(
      href.automation('morning', undefined, 'name'),
    );
  });

  it('links reusable steps to the sequence editor', () => {
    focusTargets.mockReturnValue({
      reusable: true,
      targets: [{ key: 'name', parent: null, title: 'Name', focus: 'name', keywords: [] }],
    });
    const out = linksOf();
    automationRuntimePages(tablesOf([automation('steps', V2_DEFINITION)]), out);
    expect(out.links.get('page:automation-editor:steps:name')).toEqual(
      href.automationSequence('steps', 'name'),
    );
  });

  it('gives no editor pages to a stored program the editor cannot read', () => {
    focusTargets.mockReturnValue(null);
    const pages = automationRuntimePages(tablesOf([automation('old', V1_DEFINITION)]), linksOf());
    expect(pages).toEqual([]);
  });
});
