import {
  NODE_REGISTRY,
  isShippedKind,
  kindProblems,
  type AutomationPluginKindRow,
  type NodeKind,
  type NodeRegistry,
} from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { rowsOf, type StoreState } from '../../../store/state';

const log = new Logger('app.automations');

export type KindLookup = NodeRegistry;

const LOOKUPS = new WeakMap<readonly AutomationPluginKindRow[], KindLookup>();

function problemsOf(row: AutomationPluginKindRow, taken: ReadonlySet<string>): readonly string[] {
  const kind = row.declaration;
  if (kind.id !== row.kind_id) return ['the stored declaration has another id'];
  if (taken.has(kind.id)) return ['the id is already used by another kind'];
  return kindProblems(kind);
}

function pluginKindsOf(rows: readonly AutomationPluginKindRow[]): readonly NodeKind[] {
  const taken = new Set(NODE_REGISTRY.kinds.map((kind) => kind.id));
  const kept: NodeKind[] = [];
  for (const row of rows) {
    const problems = problemsOf(row, taken);
    if (problems.length > 0) {
      log.warn('plugin_kinds.row_rejected', { kind: row.kind_id, owner: row.owner, problems });
      continue;
    }
    taken.add(row.declaration.id);
    kept.push(row.declaration);
  }
  return kept;
}

function buildLookup(rows: readonly AutomationPluginKindRow[]): KindLookup {
  const plugin = pluginKindsOf(rows);
  if (plugin.length === 0) return NODE_REGISTRY;
  const kinds = [...NODE_REGISTRY.kinds, ...plugin];
  const added = new Map(plugin.map((kind) => [kind.id, kind]));
  return {
    kinds,
    get: (id) => NODE_REGISTRY.get(id) ?? added.get(id),
    has: (id) => NODE_REGISTRY.has(id) || added.has(id),
    shipped: () => kinds.filter(isShippedKind),
  };
}

export function kindLookupOf(rows: readonly AutomationPluginKindRow[]): KindLookup {
  const known = LOOKUPS.get(rows);
  if (known !== undefined) return known;
  const built = buildLookup(rows);
  LOOKUPS.set(rows, built);
  return built;
}

export function kindsOfState(state: StoreState): KindLookup {
  return kindLookupOf(rowsOf(state.tables.automation_plugin_kinds));
}
