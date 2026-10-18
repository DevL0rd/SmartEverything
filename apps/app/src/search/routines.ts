import { Logger } from '@smarteverything/logging';
import type { SearchSources, TableRow } from '@smarteverything/domain';
import { storedAutomationOf, triggerKeywordsOf } from '../features/automations';
import { rowsOf, type StoreState } from '../store/state';

interface RoutineTables {
  readonly scenes: StoreState['tables']['scenes'];
  readonly automations: StoreState['tables']['automations'];
}

const log = new Logger('app.search');
const reported = new Set<string>();

function automationTriggerKeywords(
  automation: Pick<TableRow<'automations'>, 'id' | 'definition'>,
): readonly string[] {
  const stored = storedAutomationOf(automation);
  if (stored !== null) {
    return triggerKeywordsOf(stored.when);
  }
  if (!reported.has(automation.id)) {
    reported.add(automation.id);
    log.warn('automation.definition_rejected', { automationId: automation.id });
  }
  return [];
}

export function routinesOf(tables: RoutineTables): Pick<SearchSources, 'scenes' | 'automations'> {
  return {
    scenes: rowsOf(tables.scenes).map((scene) => ({ id: scene.id, name: scene.name, path: '' })),
    automations: rowsOf(tables.automations).map((automation) => ({
      id: automation.id,
      name: automation.name,
      enabled: automation.enabled,
      triggerKeywords: automationTriggerKeywords(automation),
      path: '',
    })),
  };
}
