import { NODE_REGISTRY, type SearchSources } from '@smarteverything/domain';
import { automationRowsOf, routineEntryOf } from '../features/automations';
import { rowsOf, type StoreState } from '../store/state';

interface RoutineTables {
  readonly scenes: StoreState['tables']['scenes'];
  readonly automations: StoreState['tables']['automations'];
}

export function routinesOf(tables: RoutineTables): Pick<SearchSources, 'scenes' | 'automations'> {
  const stored = rowsOf(tables.automations);
  const readable = new Map(automationRowsOf(stored).rows.map((row) => [row.id, row]));
  return {
    scenes: rowsOf(tables.scenes).map((scene) => ({ id: scene.id, name: scene.name, path: '' })),
    automations: stored.map((automation) => {
      const row = readable.get(automation.id);
      return row === undefined
        ? {
            id: automation.id,
            name: automation.name,
            enabled: automation.enabled,
            triggerKeywords: [],
            path: '',
          }
        : routineEntryOf(row, NODE_REGISTRY.get);
    }),
  };
}
