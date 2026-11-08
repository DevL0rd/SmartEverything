import { z } from 'zod';

const ID = z.uuid();
const DAY = z.iso.date();
const BYTES = z.int().nonnegative();

export const SMART_RULE_ITEM_KINDS = ['image', 'video', 'audio', 'document', 'other'] as const;

export const SMART_RULE_MATCH = ['all', 'any'] as const;

export const SMART_RULE_TEXT_FIELDS = ['name', 'path', 'camera', 'lens'] as const;

export const SMART_RULE_DATE_FIELDS = ['takenAt', 'addedAt', 'modifiedAt'] as const;

export const SMART_RULE_LEAF = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('item_kind'),
    itemKinds: z.array(z.enum(SMART_RULE_ITEM_KINDS)).min(1).readonly(),
  }),
  z.strictObject({
    kind: z.literal('text'),
    field: z.enum(SMART_RULE_TEXT_FIELDS),
    contains: z.string().trim().min(1),
  }),
  z.strictObject({
    kind: z.literal('date_range'),
    field: z.enum(SMART_RULE_DATE_FIELDS),
    from: DAY.nullable(),
    to: DAY.nullable(),
  }),
  z.strictObject({ kind: z.literal('in_root'), rootId: ID }),
  z.strictObject({ kind: z.literal('in_folder'), folderId: ID }),
  z.strictObject({ kind: z.literal('starred'), starred: z.boolean() }),
  z.strictObject({
    kind: z.literal('size_range'),
    minBytes: BYTES.nullable(),
    maxBytes: BYTES.nullable(),
  }),
  z.strictObject({
    kind: z.literal('duration_range'),
    minMs: BYTES.nullable(),
    maxMs: BYTES.nullable(),
  }),
]);

export type SmartRuleLeaf = z.infer<typeof SMART_RULE_LEAF>;

export const SMART_RULE = z
  .strictObject({
    match: z.enum(SMART_RULE_MATCH),
    rules: z.array(SMART_RULE_LEAF).min(1).readonly(),
  })
  .readonly();

export type SmartRule = z.infer<typeof SMART_RULE>;
