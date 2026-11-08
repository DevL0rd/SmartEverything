import { z } from 'zod';
import { ID } from './shared';

export const STACK_KINDS = ['burst', 'raw_jpeg'] as const;

export type StackKind = (typeof STACK_KINDS)[number];

export const STACK = z
  .strictObject({
    id: ID,
    kind: z.enum(STACK_KINDS),
    coverItemId: ID,
    itemIds: z.array(ID).min(2).readonly(),
  })
  .refine((stack) => stack.itemIds.includes(stack.coverItemId), {
    message: 'the cover is one of the stack’s items',
    path: ['coverItemId'],
  })
  .readonly();

export type Stack = z.infer<typeof STACK>;

export const STACK_PARAMS = z.strictObject({ stackId: ID });

export const STACK_COVER = z.strictObject({ itemId: ID }).readonly();
