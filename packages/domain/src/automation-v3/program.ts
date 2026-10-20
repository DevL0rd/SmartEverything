import { z } from 'zod';
import { IDENT } from './ident';
import { INPUT_PORT, OUTPUT_PORT, SCOPE, TRIGGER_NODE, VARIABLE } from './node';
import { BUDGET_OVERRIDES, RUN_POLICY } from './policy';
import { PORT_VALUE } from './port-value';
import { structuralRules } from './structure-rules';

const TEXT = z.string().min(1);

export const AUTOMATION_V3 = z
  .strictObject({
    version: z.literal(3),
    kind: z.literal('automation'),
    description: TEXT.optional(),
    triggers: z.array(TRIGGER_NODE),
    admit: PORT_VALUE.optional(),
    inputs: z.array(INPUT_PORT),
    outputs: z.array(OUTPUT_PORT),
    variables: z.array(VARIABLE),
    body: SCOPE,
    onFailure: SCOPE.optional(),
    policy: RUN_POLICY,
    budgets: BUDGET_OVERRIDES.optional(),
    history: z.strictObject({ detail: z.enum(['all', 'sampled', 'failures', 'none']) }).optional(),
  })
  .superRefine(structuralRules);

export const FUNCTION_V3 = z
  .strictObject({
    version: z.literal(3),
    kind: z.literal('function'),
    flavour: z.enum(['pure', 'action']),
    description: TEXT.optional(),
    category: TEXT.optional(),
    icon: TEXT.optional(),
    inputs: z.array(INPUT_PORT),
    outputs: z.array(OUTPUT_PORT),
    exits: z.array(IDENT).min(1),
    variables: z.array(VARIABLE),
    body: SCOPE,
  })
  .superRefine(structuralRules);

export const PROGRAM_V3 = z.discriminatedUnion('kind', [AUTOMATION_V3, FUNCTION_V3]);

export type AutomationV3 = z.infer<typeof AUTOMATION_V3>;
export type FunctionV3 = z.infer<typeof FUNCTION_V3>;
export type ProgramV3 = z.infer<typeof PROGRAM_V3>;
