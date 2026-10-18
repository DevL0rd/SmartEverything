import {
  ACCESS_CONDITIONS,
  ACCESS_SCOPES,
  CHANNEL_SCOPE,
  DEVICE_SCOPE,
  MCP_TOOL_AREAS,
  MODEL_SCOPE,
  NO_CONDITIONS,
  PERSON_BUDGET,
  PERSON_TEMPLATE,
  TEMPLATE_SCOPES,
  type AccessConditions,
  type AccessScopes,
  type McpToolArea,
  type PersonBudget,
  type PersonTemplate,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import { z } from 'zod';
import { jsonText, type Sql } from './sql';

const STORED = z.object({
  profile_id: z.string(),
  template: z.string(),
  scopes: z.string(),
  budget: z.string().nullable(),
  conditions: z.string(),
});

const LOOSE = z.looseObject({});

const AREAS = z.array(z.string());

interface StoredAccessJson {
  readonly template: string;
  readonly scopes: string;
  readonly budget: string | null;
  readonly conditions: string;
}

interface RepairedAccess {
  readonly scopes: AccessScopes;
  readonly budget: PersonBudget | null;
  readonly conditions: AccessConditions;
}

function objectOf(text: string): Readonly<Record<string, unknown>> {
  return LOOSE.catch({}).parse(JSON.parse(text));
}

function templateOf(name: string): PersonTemplate {
  return PERSON_TEMPLATE.catch('adult').parse(name);
}

function areasOf(stored: unknown, base: readonly McpToolArea[]): McpToolArea[] {
  const given = AREAS.safeParse(stored);
  if (!given.success) return [...base];
  const known = MCP_TOOL_AREAS.filter((area) => given.data.includes(area));
  return known.length === 0 && given.data.length > 0 ? [...base] : known;
}

function scopesOf(
  stored: Readonly<Record<string, unknown>>,
  template: PersonTemplate,
): AccessScopes {
  const base = TEMPLATE_SCOPES[template];
  return ACCESS_SCOPES.parse({
    areas: areasOf(stored['areas'], base.areas),
    devices: DEVICE_SCOPE.catch(base.devices).parse(stored['devices']),
    models: MODEL_SCOPE.catch(base.models).parse(stored['models']),
    channels: CHANNEL_SCOPE.catch(base.channels).parse(stored['channels']),
  });
}

function conditionsOf(stored: Readonly<Record<string, unknown>>): AccessConditions {
  const whole = ACCESS_CONDITIONS.safeParse(stored);
  if (whole.success) return whole.data;
  return ACCESS_CONDITIONS.parse({
    home_only: z.boolean().catch(NO_CONDITIONS.home_only).parse(stored['home_only']),
    schedule: ACCESS_CONDITIONS.shape.schedule
      .catch(NO_CONDITIONS.schedule)
      .parse(stored['schedule']),
  });
}

function budgetOf(text: string | null): PersonBudget | null {
  if (text === null) return null;
  return PERSON_BUDGET.nullable().catch(null).parse(objectOf(text));
}

function repairedAccess(stored: StoredAccessJson): RepairedAccess {
  return {
    scopes: scopesOf(objectOf(stored.scopes), templateOf(stored.template)),
    budget: budgetOf(stored.budget),
    conditions: conditionsOf(objectOf(stored.conditions)),
  };
}

function readable(stored: StoredAccessJson): boolean {
  return (
    PERSON_TEMPLATE.safeParse(stored.template).success &&
    ACCESS_SCOPES.safeParse(JSON.parse(stored.scopes)).success &&
    ACCESS_CONDITIONS.safeParse(JSON.parse(stored.conditions)).success &&
    (stored.budget === null || PERSON_BUDGET.safeParse(JSON.parse(stored.budget)).success)
  );
}

export function repairPersonAccess(sql: Sql, log: Logger): number {
  let repairedCount = 0;
  const rows = sql.all(
    STORED,
    'select profile_id, template, scopes, budget, conditions from person_access',
  );
  for (const row of rows) {
    if (readable(row)) continue;
    const repaired = repairedAccess(row);
    sql.run(
      'repair the stored person access',
      `update person_access set scopes = $scopes, budget = $budget, conditions = $conditions
       where profile_id = $profileId`,
      {
        profileId: row.profile_id,
        scopes: jsonText(repaired.scopes),
        budget: repaired.budget === null ? null : jsonText(repaired.budget),
        conditions: jsonText(repaired.conditions),
      },
    );
    repairedCount += 1;
    log.warn('person_access.repaired', { profileId: row.profile_id });
  }
  return repairedCount;
}
