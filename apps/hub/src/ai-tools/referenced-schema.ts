import { z } from 'zod';
import { portableSchemaOf, referenceTarget, ToolSchemaReferenceError } from './portable-schema';

type Json = Readonly<Record<string, unknown>>;
const RECORD = z.record(z.string(), z.unknown());
function record(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
export function validateSchemaReferences(schema: Json): void {
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (!record(node)) return;
    const reference = node['$ref'];
    if (typeof reference === 'string') referenceTarget(schema, reference);
    Object.values(node).forEach(visit);
  };
  visit(schema);
}
function scopedReferences(node: unknown, namespace: string): unknown {
  if (Array.isArray(node)) return node.map((entry) => scopedReferences(entry, namespace));
  if (!record(node)) return node;
  return Object.fromEntries(
    Object.entries(node).map(([key, value]) => [
      key,
      key === '$ref' && typeof value === 'string'
        ? `#/$defs/${namespace}${value.slice(1)}`
        : scopedReferences(value, namespace),
    ]),
  );
}
export function referencedSchemaOf(schema: Json, namespace: string): Json {
  try {
    return portableSchemaOf(schema);
  } catch (cause) {
    if (
      !(cause instanceof ToolSchemaReferenceError) ||
      cause.reason !== 'recursive schemas cannot be inlined'
    )
      throw cause;
  }
  validateSchemaReferences(schema);
  const scoped = RECORD.parse(scopedReferences(schema, namespace));
  return { ...withoutDefinitions(scoped), $defs: { [namespace]: scoped } };
}
export function schemaDefinitions(schema: Json): Readonly<Record<string, unknown>> {
  const definitions = schema['$defs'];
  return definitions === undefined ? {} : RECORD.parse(definitions);
}
export function withoutDefinitions(schema: Json): Json {
  return Object.fromEntries(
    Object.entries(schema).filter(
      ([key]) => key !== '$defs' && key !== '$schema' && key !== 'definitions',
    ),
  );
}
