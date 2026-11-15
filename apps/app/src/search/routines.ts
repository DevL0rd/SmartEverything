import { type NodeKindLookup, type SearchSources } from '@smarteverything/domain';
import { automationRowsOf, routineEntryOf } from '../features/automations';
import { rowsOf, type StoreState } from '../store/state';

interface RoutineTables {
  readonly automations: StoreState['tables']['automations'];
}

export function routinesOf(
  tables: RoutineTables,
  kinds: NodeKindLookup,
): Pick<SearchSources, 'automations'> {
  const stored = rowsOf(tables.automations);
  const readable = new Map(automationRowsOf(stored, kinds).rows.map((row) => [row.id, row]));
  return {
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
        : routineEntryOf(row, (id) => kinds.get(id));
    }),
  };
}
