import { z } from 'zod';
import { ACTION, validateActionTree } from './automation-actions';
import { AUTOMATION_RUN_POLICY } from './automation-runs';
import { SEQUENCE_PARAMETER } from './automation-bindings';
import { PLUGIN_ORIGIN } from './plugin-people';

export const MAX_SEQUENCE_PARAMETERS = 32;
export const AUTOMATION_SEQUENCE_DEFINITION = z
  .strictObject({
    actions: z.array(ACTION).min(1),
    parameters: z.array(SEQUENCE_PARAMETER).max(MAX_SEQUENCE_PARAMETERS).default([]),
    runPolicy: AUTOMATION_RUN_POLICY.optional(),
    controlKey: z.string().trim().min(1).max(100).optional(),
    origin: PLUGIN_ORIGIN.nullable().default(null),
  })
  .superRefine((definition, context) => {
    validateActionTree(definition.actions, context);
    if (
      new Set(definition.parameters.map((parameter) => parameter.name)).size !==
      definition.parameters.length
    )
      context.addIssue({ code: 'custom', message: 'Sequence parameter names must be unique' });
  });
export type AutomationSequenceDefinition = z.infer<typeof AUTOMATION_SEQUENCE_DEFINITION>;
