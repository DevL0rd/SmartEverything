import { createHash } from 'node:crypto';
import {
  ApiError,
  JSON_VALUE,
  jsonEquals,
  AUTOMATION_DEFINITION,
  usesStructuredActions,
  type AutomationRow,
} from '@smarteverything/domain';
import type { AutomationChange } from './automations';

export function automationDefinitionRevision(definition: unknown): string {
  return createHash('sha256').update(JSON.stringify(definition)).digest('hex');
}

export function requireCurrentAutomationDefinition(
  before: AutomationRow,
  change: AutomationChange,
): void {
  if (
    change.expectedRevision !== undefined &&
    change.expectedRevision !== automationDefinitionRevision(before.definition)
  ) {
    throw new ApiError(
      'conflict',
      'AutomationRevisionConflictError: The automation changed. Reload its current definition before saving.',
    );
  }
  if (change.definition === undefined || change.expectedRevision !== undefined) return;
  requireStructuredRevision(before, change.definition);
  const settings = ['runPolicy', 'controlKey'] as const;
  for (const key of settings) {
    const saved = before.definition[key];
    const next = change.definition[key];
    if (saved !== undefined && (next === undefined || !jsonEquals(saved, JSON_VALUE.parse(next)))) {
      throw new ApiError(
        'conflict',
        `AutomationRevisionConflictError: This client did not retain the current ${key}. Reload and supply expectedRevision to replace it explicitly.`,
      );
    }
  }
}

function requireStructuredRevision(
  before: AutomationRow,
  definition: NonNullable<AutomationChange['definition']>,
): void {
  const parsed = AUTOMATION_DEFINITION.safeParse(before.definition);
  const protectedDefinition =
    !parsed.success ||
    usesStructuredActions(parsed.data.actions) ||
    parsed.data.conditions.items.some(
      (condition) => condition.type === 'value' || condition.type === 'binding',
    );
  if (protectedDefinition && !jsonEquals(before.definition, JSON_VALUE.parse(definition)))
    throw new ApiError(
      'conflict',
      'AutomationRevisionConflictError: This structured definition requires expectedRevision for replacement.',
    );
}
