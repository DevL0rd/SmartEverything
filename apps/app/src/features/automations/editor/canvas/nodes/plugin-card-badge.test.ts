import { describe, expect, it } from 'vitest';
import {
  STATIC_KIND_LOOKUP,
  type AutomationPluginKindRow,
  type NodeKindLookup,
  type PluginKindStatus,
} from '@smarteverything/domain';
import { EntityStore } from '../../../../../store/entity-store';
import { emptyState, makeTable } from '../../../../../store/state';
import { PING_KIND_ID, kindRow } from '../../../../../test-support/plugin-kinds';
import { automation, gnode, idOf, start } from '../../../model/graph/graph-scene-fixtures';
import { projectGraphScene } from '../../../model/graph/project-graph-scene';
import { cardHtml, renderScene } from '../render-support';

function storeWith(row: AutomationPluginKindRow): EntityStore {
  const store = new EntityStore();
  store.update(() => {
    const state = emptyState();
    return {
      ...state,
      tables: {
        ...state.tables,
        automation_plugin_kinds: makeTable({ [row.kind_id]: row }, [row.kind_id], 1),
      },
    };
  });
  return store;
}

function kindsWith(row: AutomationPluginKindRow): NodeKindLookup {
  return {
    get: (id) => (id === row.kind_id ? row.declaration : STATIC_KIND_LOOKUP.get(id)),
    has: (id) => id === row.kind_id || STATIC_KIND_LOOKUP.has(id),
  };
}

function pingCard(status: PluginKindStatus): string {
  const row = kindRow(status);
  const program = automation([start('ping'), gnode('ping', PING_KIND_ID)]);
  const scene = projectGraphScene(program, { direction: 'ltr', kinds: kindsWith(row) });
  return cardHtml(
    renderScene(scene, null, () => undefined, storeWith(row)),
    idOf('ping'),
  );
}

describe('the plugin badge on a graph card', () => {
  it('says the plugin is switched off on a card whose plugin kind is off', () => {
    expect(pingCard('off')).toContain('Demo is switched off');
  });

  it('shows no badge while the plugin kind is active', () => {
    expect(pingCard('active')).not.toContain('gc-plugin-badge');
  });
});
