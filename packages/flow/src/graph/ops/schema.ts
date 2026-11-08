import {
  ACTION_MODE,
  BUDGET_OVERRIDES,
  CATCHABLE_ERROR_CLASS,
  DURATION_MS,
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
} from '@smarteverything/domain';
import { z } from 'zod';

const ID = z.uuid();
const TEXT = z.string().min(1);
const TO = { to: IDENT.optional() };
const ROW_NAME = { name: TEXT.optional() };
const CATCH_CLASSES = z.array(CATCHABLE_ERROR_CLASS).min(1);

export const NODE_INPUT = z.strictObject({
  id: ID.optional(),
  key: IDENT.optional(),
  kind: NODE_KIND_ID,
  ports: z.record(IDENT, PORT_VALUE).optional(),
  to: z.record(IDENT, IDENT).optional(),
  branches: z
    .array(z.strictObject({ id: ID.optional(), when: PORT_VALUE, ...ROW_NAME, ...TO }))
    .optional(),
  cases: z
    .array(z.strictObject({ id: ID.optional(), match: SWITCH_MATCH, ...ROW_NAME, ...TO }))
    .optional(),
  catches: z
    .array(z.strictObject({ id: ID.optional(), classes: CATCH_CLASSES.optional(), ...TO }))
    .optional(),
  paths: z.array(z.strictObject({ name: SCOPE_NAME, ...TO })).optional(),
  outputs: z.array(STRUCTURED_OUTPUT).optional(),
  policy: NODE_POLICY.optional(),
  label: TEXT.optional(),
  note: TEXT.optional(),
  enabled: z.boolean().optional(),
  pin: z.strictObject({ revision: z.int().min(1) }).optional(),
});

const AFTER = z.strictObject({ key: IDENT, port: IDENT });

const ADD_OP = z.strictObject({
  op: z.literal('add'),
  node: NODE_INPUT,
  after: AFTER.optional(),
  join: z.strictObject({ key: IDENT.optional(), id: ID.optional() }).optional(),
});

const CONNECT_OP = z.strictObject({
  op: z.literal('connect'),
  from: IDENT,
  port: IDENT,
  to: IDENT,
});

const DISCONNECT_OP = z.strictObject({ op: z.literal('disconnect'), from: IDENT, port: IDENT });

const SET_OP = z.strictObject({
  op: z.literal('set'),
  key: IDENT,
  ports: z.record(IDENT, PORT_VALUE).optional(),
  policy: NODE_POLICY.nullable().optional(),
  mode: ACTION_MODE.nullable().optional(),
  timeout: DURATION_MS.nullable().optional(),
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

const REMOVE_OP = z.strictObject({
  op: z.literal('remove'),
  key: IDENT,
  heal: z.boolean().optional(),
  cascade: z.boolean().optional(),
});

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

const ROW_ID = { id: ID };
const PLACE = { index: z.int().min(0).optional() };
const AT = { at: z.int().min(0) };

const BRANCH_EDIT = z.discriminatedUnion('t', [
  z.strictObject({
    row: z.literal('branch'),
    t: z.literal('add'),
    id: ID.optional(),
    when: PORT_VALUE,
    ...ROW_NAME,
    ...TO,
    ...PLACE,
  }),
  z.strictObject({ row: z.literal('branch'), t: z.literal('remove'), ...ROW_ID }),
  z.strictObject({ row: z.literal('branch'), t: z.literal('move'), ...ROW_ID, ...AT }),
  z.strictObject({ row: z.literal('branch'), t: z.literal('when'), ...ROW_ID, when: PORT_VALUE }),
  z.strictObject({
    row: z.literal('branch'),
    t: z.literal('name'),
    ...ROW_ID,
    name: TEXT.nullable(),
  }),
]);

const CASE_EDIT = z.discriminatedUnion('t', [
  z.strictObject({
    row: z.literal('case'),
    t: z.literal('add'),
    id: ID.optional(),
    match: SWITCH_MATCH,
    ...ROW_NAME,
    ...TO,
    ...PLACE,
  }),
  z.strictObject({ row: z.literal('case'), t: z.literal('remove'), ...ROW_ID }),
  z.strictObject({ row: z.literal('case'), t: z.literal('move'), ...ROW_ID, ...AT }),
  z.strictObject({ row: z.literal('case'), t: z.literal('match'), ...ROW_ID, match: SWITCH_MATCH }),
  z.strictObject({
    row: z.literal('case'),
    t: z.literal('name'),
    ...ROW_ID,
    name: TEXT.nullable(),
  }),
]);

const CATCH_EDIT = z.discriminatedUnion('t', [
  z.strictObject({
    row: z.literal('catch'),
    t: z.literal('add'),
    id: ID.optional(),
    classes: CATCH_CLASSES.optional(),
    ...TO,
    ...PLACE,
  }),
  z.strictObject({ row: z.literal('catch'), t: z.literal('remove'), ...ROW_ID }),
  z.strictObject({ row: z.literal('catch'), t: z.literal('move'), ...ROW_ID, ...AT }),
  z.strictObject({
    row: z.literal('catch'),
    t: z.literal('classes'),
    ...ROW_ID,
    classes: CATCH_CLASSES.nullable(),
  }),
]);

export const ROW_EDIT = z.union([BRANCH_EDIT, CASE_EDIT, CATCH_EDIT]);

const ROW_OP = z.strictObject({ op: z.literal('row'), key: IDENT, edit: ROW_EDIT });

export const PATH_EDIT = z.discriminatedUnion('t', [
  z.strictObject({ t: z.literal('add'), name: SCOPE_NAME, ...TO, ...PLACE }),
  z.strictObject({ t: z.literal('rename'), name: SCOPE_NAME, as: SCOPE_NAME }),
  z.strictObject({ t: z.literal('remove'), name: SCOPE_NAME }),
]);

const PATH_OP = z.strictObject({ op: z.literal('path'), key: IDENT, edit: PATH_EDIT });

export const PATCH_OP = z.discriminatedUnion('op', [
  ADD_OP,
  CONNECT_OP,
  DISCONNECT_OP,
  SET_OP,
  UNSET_OP,
  RENAME_OP,
  REMOVE_OP,
  ROW_OP,
  PATH_OP,
  WRAP_OP,
  HEADER_OP,
]);

export const PATCH_OPS = z.array(PATCH_OP).min(1);

export type NodeInput = z.infer<typeof NODE_INPUT>;
export type PatchOp = z.infer<typeof PATCH_OP>;
export type AddOp = Extract<PatchOp, { op: 'add' }>;
export type ConnectOp = Extract<PatchOp, { op: 'connect' }>;
export type DisconnectOp = Extract<PatchOp, { op: 'disconnect' }>;
export type SetOp = Extract<PatchOp, { op: 'set' }>;
export type UnsetOp = Extract<PatchOp, { op: 'unset' }>;
export type RenameOp = Extract<PatchOp, { op: 'rename' }>;
export type RemoveOp = Extract<PatchOp, { op: 'remove' }>;
export type RowOp = Extract<PatchOp, { op: 'row' }>;
export type RowEdit = z.infer<typeof ROW_EDIT>;
export type PathOp = Extract<PatchOp, { op: 'path' }>;
export type PathEdit = z.infer<typeof PATH_EDIT>;
export type WrapOp = Extract<PatchOp, { op: 'wrap' }>;
export type HeaderOp = Extract<PatchOp, { op: 'header' }>;
