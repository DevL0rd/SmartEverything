import {
  BUDGET_OVERRIDES,
  CATCHABLE_ERROR_CLASS,
  IDENT,
  INPUT_PORT,
  NODE_KIND_ID,
  NODE_POLICY,
  OUTPUT_PORT,
  PORT_VALUE,
  RUN_POLICY,
  SCOPE_NAME,
  STRUCTURED_OUTPUT,
  SWITCH_MATCH,
  VARIABLE,
  type NodePolicy,
  type PortValue,
  type StructuredOutput,
  type SwitchMatch,
} from '@smarteverything/domain';
import { z } from 'zod';
import { parseScopePath } from '../program/paths';

type CatchableErrorClass = z.infer<typeof CATCHABLE_ERROR_CLASS>;

export const TRIGGERS_TARGET = 'triggers';

const ID = z.uuid();
const TEXT = z.string().min(1);

export interface ScopeInput {
  nodes: NodeInput[];
}

export interface BranchInput {
  id?: string | undefined;
  when: PortValue;
  scope: ScopeInput;
}

export interface CaseInput {
  id?: string | undefined;
  match: SwitchMatch;
  scope: ScopeInput;
}

export interface CatchInput {
  id?: string | undefined;
  classes?: CatchableErrorClass[] | undefined;
  scope: ScopeInput;
}

export interface NodeInput {
  id?: string | undefined;
  key?: string | undefined;
  kind: string;
  ports?: Record<string, PortValue> | undefined;
  branches?: BranchInput[] | undefined;
  cases?: CaseInput[] | undefined;
  catches?: CatchInput[] | undefined;
  scopes?: Record<string, ScopeInput> | undefined;
  outputs?: StructuredOutput[] | undefined;
  policy?: NodePolicy | undefined;
  label?: string | undefined;
  note?: string | undefined;
  enabled?: boolean | undefined;
  pin?: { revision: number } | undefined;
}

const SCOPE_INPUT: z.ZodType<ScopeInput> = z.strictObject({
  get nodes() {
    return z.array(NODE_INPUT);
  },
});

const BRANCH_INPUT: z.ZodType<BranchInput> = z.strictObject({
  id: ID.optional(),
  when: PORT_VALUE,
  get scope() {
    return SCOPE_INPUT;
  },
});

const CASE_INPUT: z.ZodType<CaseInput> = z.strictObject({
  id: ID.optional(),
  match: SWITCH_MATCH,
  get scope() {
    return SCOPE_INPUT;
  },
});

const CATCH_INPUT: z.ZodType<CatchInput> = z.strictObject({
  id: ID.optional(),
  classes: z.array(CATCHABLE_ERROR_CLASS).min(1).optional(),
  get scope() {
    return SCOPE_INPUT;
  },
});

export const NODE_INPUT: z.ZodType<NodeInput> = z.strictObject({
  id: ID.optional(),
  key: IDENT.optional(),
  kind: NODE_KIND_ID,
  ports: z.record(IDENT, PORT_VALUE).optional(),
  get branches() {
    return z.array(BRANCH_INPUT).min(1).optional();
  },
  get cases() {
    return z.array(CASE_INPUT).optional();
  },
  get catches() {
    return z.array(CATCH_INPUT).optional();
  },
  get scopes() {
    return z.record(SCOPE_NAME, SCOPE_INPUT).optional();
  },
  outputs: z.array(STRUCTURED_OUTPUT).optional(),
  policy: NODE_POLICY.optional(),
  label: TEXT.optional(),
  note: TEXT.optional(),
  enabled: z.boolean().optional(),
  pin: z.strictObject({ revision: z.int().min(1) }).optional(),
});

export function isTarget(text: string): boolean {
  return text === TRIGGERS_TARGET || parseScopePath(text) !== undefined;
}

const TARGET = z.string().refine(isTarget, {
  message: 'a target is "triggers" or a scope path such as body, onFailure or key.scopeName',
});

const PLACEMENT = {
  after: IDENT.optional(),
  before: IDENT.optional(),
  index: z.int().min(0).optional(),
};

function atMostOnePlacement(place: {
  after?: string | undefined;
  before?: string | undefined;
  index?: number | undefined;
}): boolean {
  return (
    [place.after, place.before, place.index].filter((entry) => entry !== undefined).length <= 1
  );
}

const PLACEMENT_MESSAGE = { message: 'give at most one of after, before and index' };

const ADD_OP = z
  .strictObject({ op: z.literal('add'), node: NODE_INPUT, in: TARGET, ...PLACEMENT })
  .refine(atMostOnePlacement, PLACEMENT_MESSAGE);

const SET_OP = z.strictObject({
  op: z.literal('set'),
  key: IDENT,
  ports: z.record(IDENT, PORT_VALUE).optional(),
  policy: NODE_POLICY.nullable().optional(),
  label: TEXT.nullable().optional(),
  note: TEXT.nullable().optional(),
  enabled: z.boolean().nullable().optional(),
  outputs: z.array(STRUCTURED_OUTPUT).nullable().optional(),
});

const UNSET_OP = z.strictObject({
  op: z.literal('unset'),
  key: IDENT,
  ports: z.array(IDENT).min(1),
  keepEmpty: z.boolean().optional(),
});

const MOVE_OP = z
  .strictObject({ op: z.literal('move'), key: IDENT, in: TARGET, ...PLACEMENT })
  .refine(atMostOnePlacement, PLACEMENT_MESSAGE);

const REMOVE_OP = z.strictObject({
  op: z.literal('remove'),
  key: IDENT,
  cascade: z.boolean().optional(),
});

const WRAP_OP = z.strictObject({
  op: z.literal('wrap'),
  keys: z.tuple([IDENT], IDENT),
  kind: NODE_KIND_ID,
  key: IDENT.optional(),
  id: ID.optional(),
  ports: z.record(IDENT, PORT_VALUE).optional(),
  when: PORT_VALUE.optional(),
  rowId: ID.optional(),
  policy: NODE_POLICY.optional(),
  label: TEXT.optional(),
  note: TEXT.optional(),
  enabled: z.boolean().optional(),
});

const UNWRAP_OP = z.strictObject({ op: z.literal('unwrap'), key: IDENT });

const RENAME_OP = z.strictObject({ op: z.literal('rename'), key: IDENT, to: IDENT });

const HEADER_OP = z
  .strictObject({
    op: z.literal('header'),
    variables: z.array(VARIABLE).optional(),
    inputs: z.array(INPUT_PORT).optional(),
    outputs: z.array(OUTPUT_PORT).optional(),
    policy: RUN_POLICY.optional(),
    admit: PORT_VALUE.nullable().optional(),
    budgets: BUDGET_OVERRIDES.nullable().optional(),
    description: TEXT.nullable().optional(),
  })
  .refine((header) => Object.keys(header).length > 1, {
    message: 'a header change names at least one field',
  });

const ROW_ID = { id: ID };
const ROW_PLACE = { index: z.int().min(0).optional() };
const ROW_TO = { to: z.int().min(0) };

const BRANCH_EDIT = z.discriminatedUnion('t', [
  z.strictObject({
    row: z.literal('branch'),
    t: z.literal('add'),
    ...ROW_ID,
    when: PORT_VALUE,
    scope: SCOPE_INPUT.optional(),
    ...ROW_PLACE,
  }),
  z.strictObject({ row: z.literal('branch'), t: z.literal('remove'), ...ROW_ID }),
  z.strictObject({ row: z.literal('branch'), t: z.literal('move'), ...ROW_ID, ...ROW_TO }),
  z.strictObject({ row: z.literal('branch'), t: z.literal('when'), ...ROW_ID, when: PORT_VALUE }),
]);

const CASE_EDIT = z.discriminatedUnion('t', [
  z.strictObject({
    row: z.literal('case'),
    t: z.literal('add'),
    ...ROW_ID,
    match: SWITCH_MATCH,
    scope: SCOPE_INPUT.optional(),
    ...ROW_PLACE,
  }),
  z.strictObject({ row: z.literal('case'), t: z.literal('remove'), ...ROW_ID }),
  z.strictObject({ row: z.literal('case'), t: z.literal('move'), ...ROW_ID, ...ROW_TO }),
  z.strictObject({ row: z.literal('case'), t: z.literal('match'), ...ROW_ID, match: SWITCH_MATCH }),
]);

const CATCH_CLASSES = z.array(CATCHABLE_ERROR_CLASS).min(1);

const CATCH_EDIT = z.discriminatedUnion('t', [
  z.strictObject({
    row: z.literal('catch'),
    t: z.literal('add'),
    ...ROW_ID,
    classes: CATCH_CLASSES.optional(),
    scope: SCOPE_INPUT.optional(),
    ...ROW_PLACE,
  }),
  z.strictObject({ row: z.literal('catch'), t: z.literal('remove'), ...ROW_ID }),
  z.strictObject({ row: z.literal('catch'), t: z.literal('move'), ...ROW_ID, ...ROW_TO }),
  z.strictObject({
    row: z.literal('catch'),
    t: z.literal('classes'),
    ...ROW_ID,
    classes: CATCH_CLASSES.nullable(),
  }),
]);

export const ROW_EDIT = z.union([BRANCH_EDIT, CASE_EDIT, CATCH_EDIT]);

const ROW_OP = z.strictObject({
  op: z.literal('row'),
  key: IDENT,
  edit: ROW_EDIT,
  cascade: z.boolean().optional(),
});

export const PATCH_OP = z.discriminatedUnion('op', [
  ADD_OP,
  SET_OP,
  UNSET_OP,
  MOVE_OP,
  REMOVE_OP,
  WRAP_OP,
  UNWRAP_OP,
  RENAME_OP,
  ROW_OP,
  HEADER_OP,
]);

export const PATCH_OPS = z.array(PATCH_OP).min(1);

export type PatchOp = z.infer<typeof PATCH_OP>;

export type AddOp = Extract<PatchOp, { op: 'add' }>;
export type SetOp = Extract<PatchOp, { op: 'set' }>;
export type UnsetOp = Extract<PatchOp, { op: 'unset' }>;
export type MoveOp = Extract<PatchOp, { op: 'move' }>;
export type RemoveOp = Extract<PatchOp, { op: 'remove' }>;
export type WrapOp = Extract<PatchOp, { op: 'wrap' }>;
export type UnwrapOp = Extract<PatchOp, { op: 'unwrap' }>;
export type RenameOp = Extract<PatchOp, { op: 'rename' }>;
export type RowOp = Extract<PatchOp, { op: 'row' }>;
export type RowEdit = z.infer<typeof ROW_EDIT>;
export type HeaderOp = Extract<PatchOp, { op: 'header' }>;
