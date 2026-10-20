import {
  type AutomationRunPolicy,
  type PluginOrigin,
  type SequenceParameter,
} from '@smarteverything/domain';
import type { AutomationDefinition } from './v1-definition';
import type { AutomationSequenceDefinition } from './v1-sequences';
import { UnmigratedError } from './v2-convert-input';
import { stepsV2Of } from './v2-convert-steps';
import { conditionsV2Of, triggerV2Of } from './v2-convert-when';
import { AUTOMATION_V2, type AutomationV2, type InputDeclarationV2 } from './v2-schema';

interface ConvertedAutomation {
  readonly automation: AutomationV2;
  readonly origin: PluginOrigin | null;
}

interface UnmigratedAutomation {
  readonly unmigrated: string;
}

export type AutomationConversion = ConvertedAutomation | UnmigratedAutomation;

const INPUT_TYPE_OF_KIND: Readonly<Record<SequenceParameter['kind'], InputDeclarationV2['type']>> =
  {
    boolean: 'flag',
    number: 'number',
    duration: 'duration',
    choice: 'choice',
    string: 'text',
  };

function runFields(
  policy: AutomationRunPolicy | undefined,
  controlKey: string | undefined,
): Pick<AutomationV2, 'mode' | 'max' | 'key'> {
  const key = controlKey === undefined ? {} : { key: controlKey };
  if (policy === undefined) return { mode: 'parallel', ...key };
  return 'limit' in policy
    ? { mode: policy.mode, max: policy.limit, ...key }
    : { mode: policy.mode, ...key };
}

function conversion(draft: () => unknown, origin: PluginOrigin | null): AutomationConversion {
  try {
    const parsed = AUTOMATION_V2.safeParse(draft());
    return parsed.success
      ? { automation: parsed.data, origin }
      : {
          unmigrated: parsed.error.issues
            .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
            .join('; '),
        };
  } catch (error) {
    if (error instanceof UnmigratedError) return { unmigrated: error.message };
    throw error;
  }
}

export function automationV2Of(definition: AutomationDefinition): AutomationConversion {
  const everyone = definition.conditions.mode === 'all' && definition.conditions.items.length === 0;
  return conversion(
    () => ({
      when: definition.triggers.map(triggerV2Of),
      ...(everyone ? {} : { onlyIf: conditionsV2Of(definition.conditions) }),
      steps: stepsV2Of(definition.actions),
      ...runFields(definition.runPolicy, definition.controlKey),
    }),
    definition.origin,
  );
}

export function sequenceV2Of(definition: AutomationSequenceDefinition): AutomationConversion {
  return conversion(
    () => ({
      when: [],
      steps: stepsV2Of(definition.actions),
      ...(definition.parameters.length === 0
        ? {}
        : {
            inputs: definition.parameters.map(({ name, kind }) => ({
              name,
              type: INPUT_TYPE_OF_KIND[kind],
            })),
          }),
      ...runFields(definition.runPolicy, definition.controlKey),
    }),
    definition.origin,
  );
}
