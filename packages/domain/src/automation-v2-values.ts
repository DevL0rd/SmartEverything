import { z } from 'zod';
import type { AutomationValueContent } from './automation-values';

const NAME = z.string().trim().min(1);
const OVERFLOW = z.enum(['reject', 'clamp', 'wrap']);
const NUMERIC = {
  name: NAME,
  min: z.number().optional(),
  max: z.number().optional(),
  step: z.number().positive().optional(),
  overflow: OVERFLOW.optional(),
};

export const AUTOMATION_VALUE_V2 = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('flag'), name: NAME, value: z.boolean() }),
  z.strictObject({ type: z.literal('number'), value: z.number(), ...NUMERIC }),
  z.strictObject({ type: z.literal('duration'), value: z.number().nonnegative(), ...NUMERIC }),
  z.strictObject({
    type: z.literal('choice'),
    name: NAME,
    value: z.uuid(),
    choices: z.array(z.strictObject({ id: z.uuid(), label: NAME })).min(1),
    overflow: z.enum(['clamp', 'wrap']).optional(),
  }),
]);
export type AutomationValueV2 = z.infer<typeof AUTOMATION_VALUE_V2>;

function boundsOf(content: Extract<AutomationValueContent, { kind: 'number' | 'duration' }>): {
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  readonly overflow?: 'clamp' | 'wrap';
} {
  const { minimum, maximum, quantum, overflow } = content.bounds;
  return {
    ...(minimum === undefined ? {} : { min: minimum }),
    ...(maximum === undefined ? {} : { max: maximum }),
    ...(quantum === undefined ? {} : { step: quantum }),
    ...(overflow === 'reject' ? {} : { overflow }),
  };
}

export function automationValueV2Of(content: AutomationValueContent): AutomationValueV2 {
  switch (content.kind) {
    case 'boolean':
      return { type: 'flag', name: content.name, value: content.value };
    case 'number':
    case 'duration':
      return { type: content.kind, name: content.name, value: content.value, ...boundsOf(content) };
    case 'choice':
      return {
        type: 'choice',
        name: content.name,
        value: content.value,
        choices: content.choices.map(({ id, label }) => ({ id, label })),
        ...(content.overflow === 'clamp' ? {} : { overflow: content.overflow }),
      };
  }
}
