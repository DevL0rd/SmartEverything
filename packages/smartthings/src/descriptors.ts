import type { JsonValue, ValueDescriptor } from '@smarteverything/domain';
import type { JsonSchemaShape } from './definition-schema';

export const RAW_TEXT_LIMIT = 4096;

export const RAW_NUMBER_BOUND = 100_000;

const DECIMAL_STEP = 0.1;

type NumberDescriptor = Extract<ValueDescriptor, { kind: 'number' }>;

function withUnit(descriptor: NumberDescriptor, unit: string | null): NumberDescriptor {
  return unit === null ? descriptor : { ...descriptor, unit };
}

function numberDescriptor(schema: JsonSchemaShape, step: number): NumberDescriptor {
  return {
    kind: 'number',
    min: schema.minimum ?? -RAW_NUMBER_BOUND,
    max: schema.maximum ?? RAW_NUMBER_BOUND,
    step,
  };
}

export function descriptorFromSchema(
  schema: JsonSchemaShape,
  unit: string | null,
): ValueDescriptor {
  if (schema.enum !== undefined && schema.enum.length > 0) {
    return { kind: 'enum', options: [...schema.enum] };
  }
  if (schema.type === 'boolean') {
    return { kind: 'boolean' };
  }
  if (schema.type === 'integer') {
    return withUnit(numberDescriptor(schema, 1), unit);
  }
  if (schema.type === 'number') {
    return withUnit(numberDescriptor(schema, DECIMAL_STEP), unit);
  }
  return { kind: 'text', maxLength: schema.maxLength ?? RAW_TEXT_LIMIT };
}

export function descriptorFromValue(value: JsonValue, unit: string | null): ValueDescriptor {
  if (typeof value === 'boolean') {
    return { kind: 'boolean' };
  }
  if (typeof value === 'number') {
    const type = Number.isInteger(value) ? 'integer' : 'number';
    return descriptorFromSchema({ type }, unit);
  }
  return { kind: 'text', maxLength: RAW_TEXT_LIMIT };
}
