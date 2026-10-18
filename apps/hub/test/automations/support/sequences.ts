import {
  API_ENDPOINTS,
  AUTOMATION_SEQUENCE_DEFINITION,
  sequenceV2Of,
  type AutomationRow,
  type AutomationV2,
} from '@smarteverything/domain';
import { nodeId, type Step, type Steps } from './programs';
import type { Rig } from './rig';

export interface SequenceParts {
  readonly actions: Steps;
  readonly parameters?: { name: string; kind: 'number' | 'boolean' }[];
  readonly runPolicy?: { readonly mode: 'single' | 'restart' };
  readonly controlKey?: string;
}

export function sequenceDefinition(parts: SequenceParts): AutomationV2 {
  const converted = sequenceV2Of(
    AUTOMATION_SEQUENCE_DEFINITION.parse({
      actions: parts.actions,
      parameters: parts.parameters ?? [],
      ...(parts.runPolicy === undefined ? {} : { runPolicy: parts.runPolicy }),
      ...(parts.controlKey === undefined ? {} : { controlKey: parts.controlKey }),
    }),
  );
  if ('unmigrated' in converted) throw new Error(converted.unmigrated);
  return converted.automation;
}

export async function createSequence(
  rig: Rig,
  name: string,
  parts: SequenceParts,
): Promise<AutomationRow> {
  return rig.request(API_ENDPOINTS.createAutomation, {
    body: { name, definition: sequenceDefinition(parts) },
  });
}

export function callSequence(
  sequenceId: string,
  parameters: Extract<Step, { type: 'sequence' }>['parameters'] = {},
): Step {
  return { type: 'sequence', nodeId: nodeId(), sequenceId, parameters };
}
