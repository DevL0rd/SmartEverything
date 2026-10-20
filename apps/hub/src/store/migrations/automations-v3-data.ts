import type { AutomationV3 } from '@smarteverything/domain';
import type { LogPayload } from '@smarteverything/logging';
import { jsonText, type Sql } from '../sql';
import { AUTOMATIONS_V3_STATEMENTS } from './automations-v3-schema';
import type { Migration } from './migration';

export const EMPTY_AUTOMATION: AutomationV3 = {
  version: 3,
  kind: 'automation',
  triggers: [],
  inputs: [],
  outputs: [],
  variables: [],
  body: { nodes: [] },
  policy: { mode: 'single' },
};

export function keepOldAutomationsForRemaking(sql: Sql): LogPayload {
  const kept = sql.run(
    'keep each old automation to read while it is remade',
    'update automations set definition_v2 = definition, definition = $empty, enabled = 0',
    { empty: jsonText(EMPTY_AUTOMATION) },
  );
  return { keptForRemaking: kept };
}

export const AUTOMATIONS_V3_MIGRATION: Migration = {
  version: 130,
  name: 'automations_v3',
  statements: AUTOMATIONS_V3_STATEMENTS,
  backfill: keepOldAutomationsForRemaking,
};
