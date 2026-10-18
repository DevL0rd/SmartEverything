import { z } from 'zod';
import { ToolError } from './registry';

export const COMPUTER_ID = z
  .uuid()
  .describe('The computer: its deviceId from find_devices with family computer');

export interface Chosen<C> {
  readonly deviceId: string;
  readonly change: C;
}

type Fields = Record<string, z.ZodType>;

export function actionOf(option: z.ZodObject): string {
  const action: unknown = option.shape['action'];
  if (action instanceof z.ZodLiteral && typeof action.value === 'string') return action.value;
  throw new ToolError('A tool variant has no action', 'internal');
}

function fieldsOf(option: z.ZodObject): [string, z.ZodType][] {
  return Object.entries(option.shape).filter(
    (entry): entry is [string, z.ZodType] => entry[0] !== 'action' && entry[1] instanceof z.ZodType,
  );
}

function required(schema: z.ZodType): boolean {
  return !schema.safeParse(undefined).success;
}

function takes(option: z.ZodObject): string {
  const names = fieldsOf(option).map(([name, schema]) =>
    required(schema) ? `${name} (required)` : name,
  );
  return `${actionOf(option)}: ${names.length === 0 ? 'no other fields' : names.join(', ')}`;
}

export function withoutDefault(field: z.core.$ZodType): z.core.$ZodType {
  if (!(field instanceof z.ZodDefault)) {
    return field;
  }
  const inner = field.unwrap();
  const copy = z.core.clone(inner);
  z.globalRegistry.add(copy, { ...z.globalRegistry.get(inner), ...z.globalRegistry.get(field) });
  return copy;
}

function merged(options: readonly z.ZodObject[]): Fields {
  const all: Fields = {};
  for (const option of options)
    for (const [name, schema] of fieldsOf(option)) all[name] ??= z.optional(withoutDefault(schema));
  return all;
}

export function flatChange<O extends z.ZodObject>(
  options: readonly O[],
): z.ZodType<Chosen<z.output<O>>> {
  const byAction = new Map(options.map((option) => [actionOf(option), option]));
  const actions = [...byAction.keys()];
  const [first = '', ...rest] = actions;
  return z
    .strictObject({
      deviceId: COMPUTER_ID,
      action: z.enum([first, ...rest]).describe(options.map(takes).join('; ')),
      ...merged(options),
    })
    .transform((input, context): Chosen<z.output<O>> => {
      const { deviceId, action, ...fields } = input;
      const parsed = byAction.get(action)?.safeParse({ ...fields, action });
      if (parsed?.success === true) return { deviceId, change: parsed.data };
      for (const issue of parsed?.error.issues ?? [])
        context.issues.push({ code: 'custom', message: issue.message, path: issue.path, input });
      return z.NEVER;
    });
}
