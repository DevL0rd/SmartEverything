import { z } from 'zod';

export const STATUS_BATCH_SIZE = 20;

export const absentWhenEmpty = z
  .string()
  .nullish()
  .transform((value) => (value === undefined || value === '' ? null : value));

export const IDENTIFIER = z.union([z.string().min(1), z.number().int()]).transform(String);

export const CLOUD_DEVICE = z.object({
  id: z.string().min(1),
  name: z.string(),
  category: z.string(),
  product_id: z.string(),
  product_name: absentWhenEmpty,
  model: absentWhenEmpty,
  local_key: absentWhenEmpty,
  sub: z.boolean(),
  online: z.boolean(),
  gateway_id: absentWhenEmpty,
  node_id: absentWhenEmpty,
});

export type CloudDevice = z.output<typeof CLOUD_DEVICE>;

export interface SpecificationItem {
  readonly code: string;
  readonly dp_id: number;
  readonly type: string;
  readonly values: string;
  readonly name: string | null;
}

export const STATUS_ITEM = z.object({ code: z.string().min(1), value: z.unknown() });

export type StatusItem = z.output<typeof STATUS_ITEM>;

export function commandsOf(writes: readonly { code: string; value: unknown }[]): {
  readonly commands: readonly { readonly code: string; readonly value: unknown }[];
} {
  return { commands: writes.map(({ code, value }) => ({ code, value })) };
}
