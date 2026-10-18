import { z } from 'zod';
import { JSON_VALUE, type DeviceCapability, type JsonValue } from '@smarteverything/domain';
import type { Kind } from './inputs';

const PARAMETER = z.object({
  type: z.string().optional(),
  enum: z.array(JSON_VALUE).optional(),
  minimum: z.number().optional(),
  maximum: z.number().optional(),
  pattern: z.string().optional(),
  maxLength: z.number().optional(),
});
export const COMMAND_ARGUMENT_SCHEMA = z.object({
  properties: z.record(z.string(), PARAMETER),
  required: z.array(z.string()).optional(),
});
export type CommandArgument = z.infer<typeof PARAMETER>;

export interface CommandField {
  readonly name: string;
  readonly parameter: CommandArgument;
  readonly kind: Kind;
  readonly required: boolean;
}

function enumKind(values: readonly JsonValue[]): Kind | null {
  if (values.length === 0) return null;
  if (values.every((value) => typeof value === 'number')) return 'number';
  if (values.every((value) => typeof value === 'boolean')) return 'flag';
  return values.every((value) => typeof value === 'string') ? 'text' : null;
}

const TYPE_KINDS: Readonly<Record<string, Kind>> = {
  boolean: 'flag',
  number: 'number',
  integer: 'number',
  string: 'text',
};

function argumentKind(parameter: CommandArgument): Kind | null {
  const kind = parameter.type === undefined ? 'text' : (TYPE_KINDS[parameter.type] ?? null);
  if (parameter.enum === undefined) return kind;
  const enumerated = enumKind(parameter.enum);
  return parameter.type === undefined || enumerated === kind ? enumerated : null;
}

export function commandFields(capability: DeviceCapability): readonly CommandField[] | null {
  const descriptor = capability.value;
  if (descriptor.kind !== 'action') return null;
  if (descriptor.argumentSchema === undefined)
    return (
      descriptor.arguments?.map((name) => ({
        name,
        kind: 'text',
        required: true,
        parameter: { type: 'string' },
      })) ?? null
    );
  const schema = COMMAND_ARGUMENT_SCHEMA.safeParse(descriptor.argumentSchema);
  if (!schema.success) return null;
  const required = new Set(schema.data.required ?? []);
  const fields = Object.entries(schema.data.properties).flatMap(([name, parameter]) => {
    const kind = argumentKind(parameter);
    return kind === null
      ? []
      : [
          {
            name,
            parameter: { ...parameter, type: parameter.type ?? 'string' },
            kind,
            required: required.has(name),
          },
        ];
  });
  return fields.length === Object.keys(schema.data.properties).length ? fields : null;
}

export function fieldDefault(field: CommandField): JsonValue {
  const first = field.parameter.enum?.[0];
  if (first !== undefined) return first;
  if (field.kind === 'number') return field.parameter.minimum ?? 0;
  return field.kind === 'flag' ? false : '';
}
