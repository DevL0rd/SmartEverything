import { z } from 'zod';
import { CAPABILITY_KEY } from '../capabilities';
import { IDENT } from './ident';

export const REF_KINDS = [
  'device',
  'room',
  'group',
  'scene',
  'person',
  'computer',
  'phone',
  'camera',
  'chat',
  'value',
  'automation',
  'function',
  'target',
  'secret',
] as const;

export const REF_KIND = z.enum(REF_KINDS);

export type RefKind = z.infer<typeof REF_KIND>;

const TEXT = z.string().min(1);

const CHOICE_OPTION = z.strictObject({ id: TEXT, label: TEXT });

const LEAF_TYPE = z.discriminatedUnion('t', [
  z.strictObject({ t: z.literal('boolean') }),
  z.strictObject({
    t: z.literal('number'),
    integer: z.boolean().optional(),
    min: z.number().optional(),
    max: z.number().optional(),
    unit: TEXT.optional(),
  }),
  z.strictObject({ t: z.literal('text') }),
  z.strictObject({ t: z.literal('duration') }),
  z.strictObject({ t: z.literal('instant') }),
  z.strictObject({ t: z.literal('timeOfDay') }),
  z.strictObject({ t: z.literal('date') }),
  z.strictObject({ t: z.literal('choice'), options: z.array(CHOICE_OPTION).min(1) }),
  z.strictObject({
    t: z.literal('ref'),
    of: REF_KIND,
    capabilities: z.array(CAPABILITY_KEY).optional(),
  }),
  z.strictObject({ t: z.literal('color') }),
  z.strictObject({ t: z.literal('error') }),
  z.strictObject({ t: z.literal('any') }),
  z.strictObject({ t: z.literal('param'), name: IDENT }),
]);

export type FlowType =
  | z.infer<typeof LEAF_TYPE>
  | { readonly t: 'list'; readonly of: FlowType }
  | { readonly t: 'optional'; readonly of: FlowType }
  | {
      readonly t: 'record';
      readonly fields?: Readonly<Record<string, FlowType>> | undefined;
      readonly values?: FlowType | undefined;
    };

export const FLOW_TYPE: z.ZodType<FlowType> = z.lazy(() =>
  z.union([
    LEAF_TYPE,
    z.strictObject({ t: z.literal('list'), of: FLOW_TYPE }),
    z.strictObject({ t: z.literal('optional'), of: FLOW_TYPE }),
    z.strictObject({
      t: z.literal('record'),
      fields: z.record(IDENT, FLOW_TYPE).optional(),
      values: FLOW_TYPE.optional(),
    }),
  ]),
);
