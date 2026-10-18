import { JSON_VALUE, type JsonValue } from '@smarteverything/domain';
import { shellyOperation, type ShellyAction } from '@smarteverything/shelly';
import { z } from 'zod';
import {
  arrayOf,
  branches,
  schemaOf,
  schemaType,
  type Schema,
} from '../../components/schema-values';

const SCALARS: ReadonlySet<string> = new Set(['string', 'number', 'integer', 'boolean']);
const SCHEMAS = new Map<ShellyAction, Schema>();

function openAnyValues(node: JsonValue): JsonValue {
  if (Array.isArray(node)) return arrayOf(node).map(openAnyValues);
  const record = schemaOf(node);
  const entries = Object.entries(record);
  if (entries.length === 0) return node;
  if (entries.length === 1 && record['secret'] === true) return {};
  return Object.fromEntries(entries.map(([key, value]) => [key, openAnyValues(value)]));
}

export function secretText(field: Schema): boolean {
  return field['secret'] === true;
}

export function paramsSchema(action: ShellyAction): Schema {
  const known = SCHEMAS.get(action);
  if (known !== undefined) return known;
  const raw: unknown = z.toJSONSchema(shellyOperation(action).params, {
    io: 'input',
    unrepresentable: 'any',
  });
  const schema = schemaOf(openAnyValues(JSON_VALUE.parse(raw)));
  SCHEMAS.set(action, schema);
  return schema;
}

export function propertiesOf(schema: Schema): Readonly<Record<string, Schema>> {
  return Object.fromEntries(
    Object.entries(schemaOf(schema['properties'])).map(([name, field]) => [name, schemaOf(field)]),
  );
}

export function nullableScalar(field: Schema): Schema | null {
  const variants = branches(field);
  const inner = variants.filter((variant) => schemaType(variant) !== 'null');
  const [only] = inner;
  if (inner.length !== 1 || variants.length !== 2 || only === undefined) return null;
  return typedScalar(only) ? only : null;
}

export function stringList(field: Schema): boolean {
  return field['type'] === 'array' && schemaOf(field['items'])['type'] === 'string';
}

function typedScalar(field: Schema): boolean {
  return (
    branches(field).length === 0 && typeof field['type'] === 'string' && SCALARS.has(field['type'])
  );
}

function inlineField(field: Schema): boolean {
  return nullableScalar(field) !== null || stringList(field) || typedScalar(field);
}

export function inlineForm(schema: Schema): boolean {
  return Object.values(propertiesOf(schema)).every(inlineField);
}

export function editorSchema(
  action: ShellyAction,
  wrap: string | undefined,
  fixed: readonly string[],
): Schema {
  const full = paramsSchema(action);
  const properties = propertiesOf(full);
  if (wrap !== undefined) return properties[wrap] ?? {};
  return {
    ...full,
    properties: Object.fromEntries(
      Object.entries(properties).filter(([name]) => !fixed.includes(name)),
    ),
  };
}
