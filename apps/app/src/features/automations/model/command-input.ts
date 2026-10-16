import { z } from 'zod';
import { JSON_VALUE } from '@smarteverything/domain';
import type {
  AutomationBindingKind,
  AutomationInput,
  JsonValue,
  AutomationCommandInput,
  DeviceCapability,
} from '@smarteverything/domain';
import { defaultValue } from './capability-choices';
import { literalValue } from './input-bindings';

export function commandBindingKind(capability: DeviceCapability): AutomationBindingKind | null {
  switch (capability.value.kind) {
    case 'boolean':
      return 'boolean';
    case 'number':
      return capability.value.unit === 'ms' ? 'duration' : 'number';
    case 'text':
    case 'enum':
      return 'string';
    case 'action':
    case 'color':
      return null;
  }
}
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
  readonly kind: AutomationBindingKind;
  readonly required: boolean;
}
function enumKind(values: readonly JsonValue[]): AutomationBindingKind | null {
  if (values.length === 0) return null;
  if (values.every((value) => typeof value === 'number')) return 'number';
  if (values.every((value) => typeof value === 'boolean')) return 'boolean';
  return values.every((value) => typeof value === 'string') ? 'string' : null;
}
function argumentKind(parameter: CommandArgument): AutomationBindingKind | null {
  const types: Readonly<Record<string, AutomationBindingKind>> = {
    boolean: 'boolean',
    number: 'number',
    integer: 'number',
    string: 'string',
  };
  const kind = parameter.type === undefined ? 'string' : (types[parameter.type] ?? null);
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
        kind: 'string',
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
            parameter: { ...parameter, type: parameter.type ?? kind },
            kind,
            required: required.has(name),
          },
        ];
  });
  return fields.length === Object.keys(schema.data.properties).length ? fields : null;
}
export function commandFieldInput(field: CommandField): AutomationInput {
  const value =
    field.parameter.enum?.[0] ??
    (field.kind === 'number' ? (field.parameter.minimum ?? 0) : literalValue(field.kind));
  return { binding: { source: 'literal', kind: field.kind, value } };
}
export function commandBinding(
  capability: DeviceCapability,
  literal?: JsonValue,
): AutomationCommandInput | null {
  const kind = commandBindingKind(capability);
  if (kind !== null)
    return {
      type: 'value',
      input: {
        binding: {
          source: 'literal',
          kind,
          value: literal === undefined ? defaultValue(capability.value) : literal,
        },
      },
    };
  const fields = commandFields(capability);
  if (fields === null) return null;
  const given = z.record(z.string(), JSON_VALUE).safeParse(literal);
  return {
    type: 'fields',
    fields: Object.fromEntries(
      fields.flatMap((field) => {
        const value = given.success ? given.data[field.name] : undefined;
        if (value === undefined && !field.required) return [];
        const input =
          value === undefined
            ? commandFieldInput(field)
            : { binding: { source: 'literal' as const, kind: field.kind, value } };
        return [[field.name, input]];
      }),
    ),
  };
}
