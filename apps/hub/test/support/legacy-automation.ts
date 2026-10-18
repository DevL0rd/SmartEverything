import { AUTOMATION_DEFINITION, automationV2Of, type AutomationV2 } from '@smarteverything/domain';
import type { z } from 'zod';

export function legacyAutomation(definition: z.input<typeof AUTOMATION_DEFINITION>): AutomationV2 {
  const converted = automationV2Of(AUTOMATION_DEFINITION.parse(definition));
  if ('unmigrated' in converted) throw new Error(converted.unmigrated);
  return converted.automation;
}
