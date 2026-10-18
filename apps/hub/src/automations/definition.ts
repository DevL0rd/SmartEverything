import {
  ApiError,
  AUTOMATION_V2,
  type AutomationRow,
  type AutomationV2,
} from '@smarteverything/domain';

export function definitionOf(row: Pick<AutomationRow, 'name' | 'definition'>): AutomationV2 {
  const parsed = AUTOMATION_V2.safeParse(row.definition);
  if (!parsed.success)
    throw new ApiError(
      'invalid_request',
      `The automation ${row.name} is not valid, so it cannot run: ${parsed.error.message}`,
    );
  return parsed.data;
}
