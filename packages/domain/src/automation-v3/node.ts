import { z } from 'zod';
import { JSON_VALUE } from '../values';
import { IDENT, IDENT_PATTERN } from './ident';
import { CATCHABLE_ERROR_CLASS, NODE_POLICY, type NodePolicy } from './policy';
import { PORT_VALUE, type PortValue } from './port-value';
import { FLOW_TYPE } from './types';

type CatchableErrorClass = z.infer<typeof CATCHABLE_ERROR_CLASS>;

const ID = z.uuid();
const TEXT = z.string().min(1);

const KIND_ID_PATTERN = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/;
export const TRIGGER_KIND_PREFIX = 'trigger.';

export const NODE_KIND_ID = z
  .string()
  .regex(KIND_ID_PATTERN, 'a kind id is dotted lowercase words such as flow.if');

export const TRIGGER_KIND_ID = NODE_KIND_ID.refine((id) => id.startsWith(TRIGGER_KIND_PREFIX), {
  message: `a trigger kind id starts with ${TRIGGER_KIND_PREFIX}`,
});

export const SCOPE_NAME = z.string().regex(IDENT_PATTERN, 'a scope name is a plain identifier');

export const STRUCTURED_OUTPUT = z.strictObject({
  name: IDENT,
  type: FLOW_TYPE.optional(),
  values: z.record(SCOPE_NAME, PORT_VALUE).refine((values) => Object.keys(values).length > 0, {
    message: 'a structured output needs a value for at least one scope',
  }),
});

export const SWITCH_MATCH = z.union([
  z.strictObject({ eq: JSON_VALUE }),
  z.strictObject({ in: z.array(JSON_VALUE).min(1) }),
  z.strictObject({
    range: z
      .strictObject({ min: z.number().optional(), max: z.number().optional() })
      .refine((range) => range.min !== undefined || range.max !== undefined, {
        message: 'a range needs a min or a max',
      })
      .refine(
        (range) => range.min === undefined || range.max === undefined || range.min <= range.max,
        { message: 'min must not exceed max' },
      ),
  }),
  z.strictObject({ when: PORT_VALUE }),
]);

export type StructuredOutput = z.infer<typeof STRUCTURED_OUTPUT>;

export type SwitchMatch = z.infer<typeof SWITCH_MATCH>;

export interface Scope {
  nodes: FlowNode[];
}

export interface Branch {
  id: string;
  when: PortValue;
  scope: Scope;
}

export interface SwitchCase {
  id: string;
  match: SwitchMatch;
  scope: Scope;
}

export interface CatchRow {
  id: string;
  classes?: CatchableErrorClass[] | undefined;
  scope: Scope;
}

export interface FlowNode {
  id: string;
  key: string;
  kind: string;
  ports?: Record<string, PortValue> | undefined;
  branches?: Branch[] | undefined;
  cases?: SwitchCase[] | undefined;
  catches?: CatchRow[] | undefined;
  scopes?: Record<string, Scope> | undefined;
  outputs?: StructuredOutput[] | undefined;
  policy?: NodePolicy | undefined;
  label?: string | undefined;
  note?: string | undefined;
  enabled?: boolean | undefined;
  pin?: { revision: number } | undefined;
}

export const SCOPE: z.ZodType<Scope> = z.strictObject({
  get nodes() {
    return z.array(NODE);
  },
});

const BRANCH: z.ZodType<Branch> = z.strictObject({
  id: ID,
  when: PORT_VALUE,
  get scope() {
    return SCOPE;
  },
});

const SWITCH_CASE: z.ZodType<SwitchCase> = z.strictObject({
  id: ID,
  match: SWITCH_MATCH,
  get scope() {
    return SCOPE;
  },
});

const CATCH_ROW: z.ZodType<CatchRow> = z.strictObject({
  id: ID,
  classes: z.array(CATCHABLE_ERROR_CLASS).min(1).optional(),
  get scope() {
    return SCOPE;
  },
});

export const NODE: z.ZodType<FlowNode> = z.strictObject({
  id: ID,
  key: IDENT,
  kind: NODE_KIND_ID,
  ports: z.record(IDENT, PORT_VALUE).optional(),
  get branches() {
    return z.array(BRANCH).min(1).optional();
  },
  get cases() {
    return z.array(SWITCH_CASE).optional();
  },
  get catches() {
    return z.array(CATCH_ROW).optional();
  },
  get scopes() {
    return z.record(SCOPE_NAME, SCOPE).optional();
  },
  outputs: z.array(STRUCTURED_OUTPUT).optional(),
  policy: NODE_POLICY.optional(),
  label: TEXT.optional(),
  note: TEXT.optional(),
  enabled: z.boolean().optional(),
  pin: z.strictObject({ revision: z.int().min(1) }).optional(),
});

export const TRIGGER_NODE = z.strictObject({
  id: ID,
  key: IDENT,
  kind: TRIGGER_KIND_ID,
  ports: z.record(IDENT, PORT_VALUE),
  label: TEXT.optional(),
  note: TEXT.optional(),
  enabled: z.boolean().optional(),
});

export type TriggerNode = z.infer<typeof TRIGGER_NODE>;

export const INPUT_PORT = z.strictObject({
  name: IDENT,
  label: TEXT.optional(),
  type: FLOW_TYPE,
  required: z.boolean(),
  default: JSON_VALUE.optional(),
  description: TEXT.optional(),
});

export type InputPort = z.infer<typeof INPUT_PORT>;

export const OUTPUT_PORT = z.strictObject({
  name: IDENT,
  label: TEXT.optional(),
  type: FLOW_TYPE,
  optional: z.boolean().optional(),
  description: TEXT.optional(),
});

export type OutputPort = z.infer<typeof OUTPUT_PORT>;

export const VARIABLE = z.strictObject({
  name: IDENT,
  type: FLOW_TYPE,
  initial: PORT_VALUE,
  persist: z.boolean().optional(),
  description: TEXT.optional(),
});

export type Variable = z.infer<typeof VARIABLE>;
