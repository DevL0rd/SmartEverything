import { z } from 'zod';
import { STATIC_KIND_LOOKUP } from '../automation-nodes/kind-lookup';
import { graphRules } from './graph-rules';
import { IDENT } from './ident';
import {
  INPUT_PORT,
  NODE_KIND_ID,
  OUTPUT_PORT,
  SCOPE_NAME,
  STRUCTURED_OUTPUT,
  SWITCH_MATCH,
  TRIGGER_NODE,
  VARIABLE,
} from './node';
import { BUDGET_OVERRIDES, CATCHABLE_ERROR_CLASS, NODE_POLICY, RUN_POLICY } from './policy';
import { PORT_VALUE } from './port-value';

const ID = z.uuid();
const TEXT = z.string().min(1);

const GRAPH_ROW_TO = { to: IDENT.optional() };

const GRAPH_ROW_NAME = { name: TEXT.optional() };

export const GRAPH_BRANCH = z.strictObject({
  id: ID,
  when: PORT_VALUE,
  ...GRAPH_ROW_NAME,
  ...GRAPH_ROW_TO,
});

export const GRAPH_CASE = z.strictObject({
  id: ID,
  match: SWITCH_MATCH,
  ...GRAPH_ROW_NAME,
  ...GRAPH_ROW_TO,
});

export const GRAPH_CATCH = z.strictObject({
  id: ID,
  classes: z.array(CATCHABLE_ERROR_CLASS).min(1).optional(),
  ...GRAPH_ROW_TO,
});

export const GRAPH_PATH = z.strictObject({ name: SCOPE_NAME, ...GRAPH_ROW_TO });

export const GRAPH_NODE = z.strictObject({
  id: ID,
  key: IDENT,
  kind: NODE_KIND_ID,
  ports: z.record(IDENT, PORT_VALUE).optional(),
  to: z.record(IDENT, IDENT).optional(),
  branches: z.array(GRAPH_BRANCH).min(1).optional(),
  cases: z.array(GRAPH_CASE).optional(),
  catches: z.array(GRAPH_CATCH).optional(),
  paths: z.array(GRAPH_PATH).optional(),
  outputs: z.array(STRUCTURED_OUTPUT).optional(),
  policy: NODE_POLICY.optional(),
  label: TEXT.optional(),
  note: TEXT.optional(),
  enabled: z.boolean().optional(),
  pin: z.strictObject({ revision: z.int().min(1) }).optional(),
});

export const AUTOMATION_V4 = z
  .strictObject({
    version: z.literal(4),
    kind: z.literal('automation'),
    description: TEXT.optional(),
    triggers: z.array(TRIGGER_NODE),
    admit: PORT_VALUE.optional(),
    inputs: z.array(INPUT_PORT),
    outputs: z.array(OUTPUT_PORT),
    variables: z.array(VARIABLE),
    nodes: z.array(GRAPH_NODE),
    policy: RUN_POLICY,
    budgets: BUDGET_OVERRIDES.optional(),
    history: z.strictObject({ detail: z.enum(['all', 'sampled', 'failures', 'none']) }).optional(),
  })
  .superRefine((program, context) => {
    graphRules(program, context, STATIC_KIND_LOOKUP);
  });

export const FUNCTION_V4 = z
  .strictObject({
    version: z.literal(4),
    kind: z.literal('function'),
    flavour: z.enum(['pure', 'action']),
    description: TEXT.optional(),
    category: TEXT.optional(),
    icon: TEXT.optional(),
    inputs: z.array(INPUT_PORT),
    outputs: z.array(OUTPUT_PORT),
    exits: z.array(IDENT).min(1),
    variables: z.array(VARIABLE),
    nodes: z.array(GRAPH_NODE),
  })
  .superRefine((program, context) => {
    graphRules(program, context, STATIC_KIND_LOOKUP);
  });

export const PROGRAM_V4 = z.discriminatedUnion('kind', [AUTOMATION_V4, FUNCTION_V4]);

export type GraphBranch = z.infer<typeof GRAPH_BRANCH>;
export type GraphCase = z.infer<typeof GRAPH_CASE>;
export type GraphCatch = z.infer<typeof GRAPH_CATCH>;
export type GraphPath = z.infer<typeof GRAPH_PATH>;
export type GraphNode = z.infer<typeof GRAPH_NODE>;
export type AutomationV4 = z.infer<typeof AUTOMATION_V4>;
export type FunctionV4 = z.infer<typeof FUNCTION_V4>;
export type ProgramV4 = z.infer<typeof PROGRAM_V4>;
