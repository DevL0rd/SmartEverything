import { z } from 'zod';
import { jsonSchemaOf } from '../../../../extensions/mcp/tools/registry';

const SCHEMA = z.looseObject({
  properties: z.record(z.string(), z.unknown()).default({}),
  required: z.array(z.string()).default([]),
});

export const EVENT_ID = z
  .uuid()
  .optional()
  .describe(
    'The eventId of the Discord request you are answering. Optional when you name a channelId or userId.',
  );

export const IDEMPOTENCY_KEY = z
  .string()
  .min(8)
  .max(128)
  .optional()
  .describe('Optional. Pass the same key only when retrying an action so it is not repeated.');

export const USER_REF = z
  .string()
  .min(1)
  .max(100)
  .describe(
    'Discord user ID, or an exact username, display name or server nickname. A name must match exactly one known person; ambiguous or unknown names are refused with the candidates listed.',
  );

export interface Variant {
  readonly action: string;
  readonly schema: z.ZodType;
}

function loosened(definitions: readonly unknown[]): unknown {
  const types = new Set(
    definitions.map((definition) => {
      const found = z.looseObject({ type: z.string().optional() }).safeParse(definition);
      return found.success ? found.data.type : undefined;
    }),
  );
  const [only] = [...types];
  return types.size === 1 && only !== undefined ? { type: only } : {};
}

export function flatSchemaOf(variants: readonly Variant[]): Readonly<Record<string, unknown>> {
  const merged = new Map<string, unknown[]>();
  for (const variant of variants) {
    const parsed = SCHEMA.parse(jsonSchemaOf(variant.schema, 'input'));
    for (const [key, definition] of Object.entries(parsed.properties)) {
      merged.set(key, [...(merged.get(key) ?? []), definition]);
    }
  }
  const properties = Object.fromEntries(
    [...merged.entries()]
      .filter(([key]) => key !== 'action')
      .map(([key, definitions]) => {
        const [first] = definitions;
        const same = definitions.every((item) => JSON.stringify(item) === JSON.stringify(first));
        return [key, same ? first : loosened(definitions)];
      }),
  );
  return {
    type: 'object',
    properties: {
      action: { type: 'string', enum: variants.map((variant) => variant.action) },
      ...properties,
    },
    required: ['action'],
    additionalProperties: false,
  };
}

export function summaryOf(action: string, schema: z.ZodType): string {
  const parsed = SCHEMA.parse(jsonSchemaOf(schema, 'input'));
  const names = Object.keys(parsed.properties).filter(
    (key) => key !== 'action' && key !== 'eventId' && key !== 'idempotencyKey',
  );
  const needed = names.filter((key) => parsed.required.includes(key));
  const optional = names.filter((key) => !parsed.required.includes(key));
  const parts = [
    ...(needed.length > 0 ? [needed.join(', ')] : []),
    ...(optional.length > 0 ? [`optional ${optional.join(', ')}`] : []),
  ];
  return `${action}(${parts.join('; ')})`;
}
